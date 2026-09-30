<#
.SYNOPSIS
    Assembles the portable ArchipelaWoW Launcher folder from a built AzerothCore, MySQL and the launcher.

.DESCRIPTION
    Layout of the result, which the launcher's AppPaths mirrors:

      ArchipelaWoW Launcher\
        ArchipelaWoW.Launcher.exe    the launcher
        server\bin\                  authserver, worldserver, dbimport, the extractors, their DLLs and configs\
        server\source\               the SQL files of the core and its modules, read by the database updater
        mysql\                       MySQL Community Server, trimmed down to what running it takes

    Every DLL the binaries need is copied next to them, the Visual C++ runtime included, so nothing
    has to be installed. The script fails if a dependency is left out.
#>
param(
    # cmake --install prefix: the executables, configs\ and mmaps-config.yaml
    [Parameter(Mandatory)] [string] $CoreInstallDir,
    # The azerothcore-wotlk checkout the core was built from, with its modules\
    [Parameter(Mandatory)] [string] $CoreSourceDir,
    # An extracted mysql-<version>-winx64 archive
    [Parameter(Mandatory)] [string] $MySqlDir,
    # The OpenSSL installation the core was built against
    [Parameter(Mandatory)] [string] $OpenSslDir,
    # dotnet publish output of the launcher
    [Parameter(Mandatory)] [string] $LauncherDir,
    # Where to create the ArchipelaWoW Launcher folder
    [Parameter(Mandatory)] [string] $OutputDir
)

$ErrorActionPreference = 'Stop'
# robocopy reports success with non-zero exit codes, Copy-Tree checks them itself
$PSNativeCommandUseErrorActionPreference = $false
$CoreInstallDir, $CoreSourceDir, $MySqlDir, $OpenSslDir, $LauncherDir = @($CoreInstallDir, $CoreSourceDir, $MySqlDir, $OpenSslDir, $LauncherDir) |
    ForEach-Object { (Resolve-Path $_).Path }
$OutputDir = [IO.Path]::GetFullPath([IO.Path]::Combine((Get-Location).Path, $OutputDir))

function Copy-Tree([string] $Source, [string] $Destination, [string[]] $ExcludeDirs = @(), [string[]] $ExcludeFiles = @()) {
    $arguments = @($Source, $Destination, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    if ($ExcludeDirs) { $arguments += @('/XD') + $ExcludeDirs }
    if ($ExcludeFiles) { $arguments += @('/XF') + $ExcludeFiles }
    robocopy @arguments | Out-Host
    # robocopy's exit codes below 8 all mean success
    if ($LASTEXITCODE -ge 8) { throw "Copying $Source to $Destination failed (robocopy exit code $LASTEXITCODE)." }
    $global:LASTEXITCODE = 0
}

function Find-VisualStudio {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    $path = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $path) { throw 'No Visual Studio installation with the C++ tools was found.' }
    return $path
}

# The newest redistributable Visual C++ runtime DLLs shipped with Visual Studio. Microsoft allows
# deploying them next to the application (app-local), which spares users the redistributable.
function Get-VcRuntime([string] $VisualStudio) {
    $crt = Get-ChildItem (Join-Path $VisualStudio 'VC\Redist\MSVC\*\x64\Microsoft.VC*.CRT') -Directory |
        Where-Object { $_.Parent.Parent.Name -as [version] } |
        Sort-Object { [version]$_.Parent.Parent.Name } |
        Select-Object -Last 1
    if (-not $crt) { throw "No Visual C++ runtime found under $VisualStudio." }
    Write-Host "Visual C++ runtime: $($crt.FullName)"
    return Get-ChildItem $crt.FullName -Filter *.dll
}

# Lists, with dumpbin, the DLLs the binaries import that are neither next to them nor part of Windows
function Get-MissingDependencies([string] $Directory, [string] $VisualStudio) {
    $dumpbin = Get-ChildItem (Join-Path $VisualStudio 'VC\Tools\MSVC\*\bin\Hostx64\x64\dumpbin.exe') | Select-Object -Last 1
    $local = (Get-ChildItem $Directory -Filter *.dll).Name
    # Present on the build machine, but not on a fresh Windows
    $vcRuntime = '^(msvcp|vcruntime|concrt|vccorlib)\d+'
    foreach ($binary in Get-ChildItem "$Directory\*" -Include *.exe, *.dll) {
        $imports = & $dumpbin.FullName /nologo /dependents $binary.FullName |
            Where-Object { $_ -match '^\s+(\S+\.dll)\s*$' } | ForEach-Object { $Matches[1] }
        foreach ($dll in $imports) {
            $inWindows = $dll -match '^(api|ext)-ms-' -or ($dll -notmatch $vcRuntime -and (Test-Path "$env:SystemRoot\System32\$dll"))
            if ($local -notcontains $dll -and -not $inWindows) { "$($binary.FullName.Substring($root.Length + 1)) needs $dll" }
        }
    }
}

$root = Join-Path $OutputDir 'ArchipelaWoW Launcher'
if (Test-Path $root) { Remove-Item $root -Recurse -Force }
$serverBin = New-Item -ItemType Directory (Join-Path $root 'server\bin')
$source = Join-Path $root 'server\source'
$mysql = Join-Path $root 'mysql'
$visualStudio = Find-VisualStudio
$vcRuntime = Get-VcRuntime $visualStudio

Write-Host '== Server binaries'
Copy-Tree $CoreInstallDir $serverBin -ExcludeFiles '*.pdb', '*.lib', '*.exp', '*.ilk'
Copy-Item (Join-Path $MySqlDir 'lib\libmysql.dll') $serverBin
$legacy = @('bin\legacy.dll', 'lib\ossl-modules\legacy.dll') | ForEach-Object { Join-Path $OpenSslDir $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $legacy) { throw "legacy.dll, which the core loads at startup, is missing from $OpenSslDir." }
Copy-Item (Join-Path $OpenSslDir 'bin\libssl-3-x64.dll'), (Join-Path $OpenSslDir 'bin\libcrypto-3-x64.dll'), $legacy $serverBin
$vcRuntime | Copy-Item -Destination $serverBin
Copy-Item (Join-Path $CoreSourceDir 'LICENSE') (Join-Path $root 'server\LICENSE-AzerothCore.txt')

Write-Host '== SQL files'
# The updater reads data\sql\{base,updates,custom} and needs archive\ too: the base schemas list the
# archived updates as applied, and a missing file is reported on every start
foreach ($dir in 'base', 'archive', 'updates', 'custom') {
    Copy-Tree (Join-Path $CoreSourceDir "data\sql\$dir") (Join-Path $source "data\sql\$dir")
}
foreach ($module in Get-ChildItem (Join-Path $CoreSourceDir 'modules') -Directory) {
    $sql = Join-Path $module.FullName 'data\sql'
    if (Test-Path $sql) {
        Copy-Tree $sql (Join-Path $source "modules\$($module.Name)\data\sql")
        Get-ChildItem $module.FullName -Filter 'LICENSE*' -File | Copy-Item -Destination (Join-Path $source "modules\$($module.Name)")
    }
}

Write-Host '== MySQL'
# Leaves out the headers, import libraries, debug builds and symbols (mysqld.pdb alone is 600 MB),
# and the Japanese full-text parser dictionaries. data and my.ini only exist in an installation
# that was already used, the launcher creates its own.
Copy-Tree $MySqlDir $mysql -ExcludeDirs 'include', 'docs', 'debug', 'mecab', 'data' `
    -ExcludeFiles '*.pdb', '*.lib', '*-debug.dll', '*.pl', 'my.ini', 'configurator_settings.xml'
# The server, the client worldserver imports SQL with, and the tools to shut down, back up and repair
$keep = 'mysqld.exe', 'mysql.exe', 'mysqladmin.exe', 'mysqldump.exe', 'mysqlcheck.exe'
Get-ChildItem (Join-Path $mysql 'bin\*.exe') | Where-Object Name -notin $keep | Remove-Item
$vcRuntime | Copy-Item -Destination (Join-Path $mysql 'bin')

Write-Host '== Launcher'
Get-ChildItem $LauncherDir -File | Where-Object Extension -in '.exe', '.dll' | Copy-Item -Destination $root

Write-Host '== Checking dependencies'
$missing = @(Get-MissingDependencies $serverBin $visualStudio) + @(Get-MissingDependencies (Join-Path $mysql 'bin') $visualStudio)
if ($missing) { throw "Missing DLLs:`n$($missing -join "`n")" }
Write-Host 'Every DLL the binaries import is present.'

$size = (Get-ChildItem $root -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("Packaged {0} ({1:N0} MB)" -f $root, $size)
