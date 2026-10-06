namespace ArchipelaWoW.Launcher.Services;

public sealed record PlayerFile(string Name, long Size, DateTimeOffset Modified);

/// <summary>Archipelago player option files (YAML), kept in the players folder of the installation.</summary>
public sealed class PlayerFilesService(AppPaths paths)
{
    public IReadOnlyList<PlayerFile> List()
    {
        if (!Directory.Exists(paths.PlayersDir))
            return [];
        return new DirectoryInfo(paths.PlayersDir).EnumerateFiles()
            .Where(f => IsYaml(f.Name))
            .OrderBy(f => f.Name, StringComparer.OrdinalIgnoreCase)
            .Select(f => new PlayerFile(f.Name, f.Length, f.LastWriteTime))
            .ToList();
    }

    public string Read(string name) => File.ReadAllText(FullPath(name));

    public void Write(string name, string content)
    {
        Directory.CreateDirectory(paths.PlayersDir);
        File.WriteAllText(FullPath(name), content);
    }

    public void Delete(string name) => File.Delete(FullPath(name));

    /// <summary>Copies a file into the players folder, renaming it if the name is taken.</summary>
    public string Import(string source)
    {
        Directory.CreateDirectory(paths.PlayersDir);
        var baseName = Path.GetFileNameWithoutExtension(source);
        var extension = Path.GetExtension(source);
        var name = baseName + extension;
        for (var i = 2; File.Exists(Path.Combine(paths.PlayersDir, name)); i++)
            name = $"{baseName} ({i}){extension}";
        File.Copy(source, FullPath(name));
        return name;
    }

    public void Export(string name, string destination) => File.Copy(FullPath(name), destination, overwrite: true);

    string FullPath(string name)
    {
        if (name != Path.GetFileName(name) || !IsYaml(name))
            throw new ArgumentException($"\"{name}\" is not a valid player file name.");
        return Path.Combine(paths.PlayersDir, name);
    }

    static bool IsYaml(string name) =>
        name.EndsWith(".yaml", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".yml", StringComparison.OrdinalIgnoreCase);
}
