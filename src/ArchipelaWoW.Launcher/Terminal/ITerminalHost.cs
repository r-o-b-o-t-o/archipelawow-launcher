namespace ArchipelaWoW.Launcher.Terminal;

/// <summary>Something whose output is shown in a UI terminal, and which takes keyboard input and resizes from it.</summary>
public interface ITerminalHost
{
    TerminalBuffer Terminal { get; }
    void Input(string data);
    void Resize(short columns, short rows);
}
