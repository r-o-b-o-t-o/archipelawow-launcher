namespace ArchipelaWoW.Launcher.Services;

/// <summary>
/// Directory operations that treat links, such as the junctions of a development installation, as links: they are
/// removed or replaced, never what they point to.
/// </summary>
public static class Directories
{
    /// <summary>Deletes a directory and what it holds, if it exists.</summary>
    public static void Delete(string directory)
    {
        var info = new DirectoryInfo(directory);
        if (!info.Exists)
            return;
        // Directory.Delete leaves link targets alone too, but throws on the junctions it finds inside when not elevated
        if (info.LinkTarget == null)
        {
            foreach (var child in info.EnumerateDirectories())
                Delete(child.FullName);
        }
        info.Delete(recursive: true);
    }

    /// <summary>Merges a directory into another, replacing the files they share and the links in the way.</summary>
    public static void MoveInto(string source, string destination)
    {
        if (new DirectoryInfo(destination).LinkTarget != null)
            Directory.Delete(destination);
        Directory.CreateDirectory(destination);
        foreach (var file in Directory.EnumerateFiles(source))
            File.Move(file, Path.Combine(destination, Path.GetFileName(file)), overwrite: true);
        foreach (var directory in Directory.EnumerateDirectories(source))
        {
            var target = Path.Combine(destination, Path.GetFileName(directory));
            if (Directory.Exists(target))
                MoveInto(directory, target);
            else
                Directory.Move(directory, target);
        }
    }
}
