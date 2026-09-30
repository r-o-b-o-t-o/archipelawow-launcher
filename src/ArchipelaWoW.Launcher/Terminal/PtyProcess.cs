using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace ArchipelaWoW.Launcher.Terminal;

/// <summary>
/// A console process attached to a pseudoconsole (ConPTY). The child believes it writes to a real
/// console, so its output isn't block-buffered the way it is on a pipe, colors come through as VT
/// sequences, and Ctrl+C is delivered by writing \x03 to its input.
/// </summary>
public sealed class PtyProcess : IDisposable
{
    readonly IntPtr _pseudoConsole;
    readonly SafeProcessHandle _process;
    readonly FileStream _input;
    readonly FileStream _output;
    readonly Action<string> _onOutput;
    readonly TaskCompletionSource<int> _exited = new(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly RegisteredWaitHandle _exitWait;
    int _exitCode;
    int _pseudoConsoleClosed;

    public int Pid { get; }

    /// <summary>Completes with the exit code once the process has exited and all its output was delivered.</summary>
    public Task<int> Exited => _exited.Task;

    public bool HasExited => _exited.Task.IsCompleted;

    PtyProcess(IntPtr pseudoConsole, Native.PROCESS_INFORMATION pi, SafeFileHandle input, SafeFileHandle output, Action<string> onOutput)
    {
        _pseudoConsole = pseudoConsole;
        _process = new SafeProcessHandle(pi.hProcess, ownsHandle: true);
        Native.CloseHandle(pi.hThread);
        Pid = pi.dwProcessId;
        _input = new FileStream(input, FileAccess.Write, 1);
        _output = new FileStream(output, FileAccess.Read, 1);
        _onOutput = onOutput;

        var readerDone = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var processExited = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        new Thread(() => ReadOutput(readerDone)) { IsBackground = true, Name = $"pty-{Pid}" }.Start();

        _exitWait = ThreadPool.RegisterWaitForSingleObject(new ProcessWaitHandle(_process), (_, _) =>
        {
            Native.GetExitCodeProcess(_process, out _exitCode);
            // Closing the pseudoconsole flushes it and ends the output pipe, which lets the reader finish
            ClosePseudoConsole();
            processExited.TrySetResult();
        }, null, Timeout.Infinite, executeOnlyOnce: true);

        Task.WhenAll(readerDone.Task, processExited.Task).ContinueWith(_ => _exited.TrySetResult(_exitCode));
    }

    /// <param name="onOutput">Called on a background thread with each decoded chunk of output.</param>
    public static PtyProcess Start(string executable, IEnumerable<string> arguments, string workingDirectory,
        short columns, short rows, Action<string> onOutput)
    {
        if (!File.Exists(executable))
            throw new FileNotFoundException($"{executable} is missing.", executable);

        SafeFileHandle? inputRead = null, inputWrite = null, outputRead = null, outputWrite = null;
        var pseudoConsole = IntPtr.Zero;
        var attributeList = IntPtr.Zero;
        try
        {
            if (!Native.CreatePipe(out inputRead, out inputWrite, IntPtr.Zero, 0) ||
                !Native.CreatePipe(out outputRead, out outputWrite, IntPtr.Zero, 0))
                throw new Win32Exception();

            var hr = Native.CreatePseudoConsole(new Native.COORD { X = columns, Y = rows }, inputRead, outputWrite, 0, out pseudoConsole);
            if (hr != 0)
                throw new Win32Exception(hr, "Could not create a pseudoconsole (Windows 10 1809 or later is required).");

            var attributeListSize = IntPtr.Zero;
            Native.InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeListSize);
            attributeList = Marshal.AllocHGlobal(attributeListSize);
            if (!Native.InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeListSize) ||
                !Native.UpdateProcThreadAttribute(attributeList, 0, Native.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
                    pseudoConsole, IntPtr.Size, IntPtr.Zero, IntPtr.Zero))
                throw new Win32Exception();

            var startupInfo = new Native.STARTUPINFOEX { lpAttributeList = attributeList };
            startupInfo.StartupInfo.cb = Marshal.SizeOf<Native.STARTUPINFOEX>();
            // Null std handles make the child use the pseudoconsole even when the launcher's own
            // handles are redirected (e.g. started from an IDE)
            startupInfo.StartupInfo.dwFlags = Native.STARTF_USESTDHANDLES;

            var commandLine = new StringBuilder(QuoteArgument(executable));
            foreach (var argument in arguments)
                commandLine.Append(' ').Append(QuoteArgument(argument));

            if (!Native.CreateProcessW(null, commandLine, IntPtr.Zero, IntPtr.Zero, false,
                    Native.EXTENDED_STARTUPINFO_PRESENT, IntPtr.Zero, workingDirectory, ref startupInfo, out var pi))
            {
                var error = new Win32Exception();
                throw new Win32Exception(error.NativeErrorCode, $"Could not start {Path.GetFileName(executable)}: {error.Message}");
            }

            var process = new PtyProcess(pseudoConsole, pi, inputWrite, outputRead, onOutput);
            pseudoConsole = IntPtr.Zero;
            inputWrite = outputRead = null;
            return process;
        }
        finally
        {
            if (attributeList != IntPtr.Zero)
            {
                Native.DeleteProcThreadAttributeList(attributeList);
                Marshal.FreeHGlobal(attributeList);
            }
            if (pseudoConsole != IntPtr.Zero)
                Native.ClosePseudoConsole(pseudoConsole);
            // The pseudoconsole holds its own duplicates of the pipe ends it was given
            inputRead?.Dispose();
            outputWrite?.Dispose();
            inputWrite?.Dispose();
            outputRead?.Dispose();
        }
    }

    public void Write(string text)
    {
        if (HasExited)
            return;
        try
        {
            _input.Write(Encoding.UTF8.GetBytes(text));
            _input.Flush();
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException)
        {
            // The process is on its way out
        }
    }

    public void SendCtrlC() => Write("\x03");

    public void Resize(short columns, short rows)
    {
        if (Volatile.Read(ref _pseudoConsoleClosed) == 0)
            Native.ResizePseudoConsole(_pseudoConsole, new Native.COORD { X = columns, Y = rows });
    }

    public void Kill()
    {
        // Closed by Dispose, after which the PID may belong to another process
        if (_process.IsClosed)
            return;
        try
        {
            using var process = Process.GetProcessById(Pid);
            process.Kill(entireProcessTree: true);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or Win32Exception)
        {
            // Already gone
        }
    }

    void ReadOutput(TaskCompletionSource done)
    {
        var decoder = Encoding.UTF8.GetDecoder();
        var bytes = new byte[16 * 1024];
        var chars = new char[Encoding.UTF8.GetMaxCharCount(bytes.Length)];
        try
        {
            int read;
            while ((read = _output.Read(bytes, 0, bytes.Length)) > 0)
            {
                var count = decoder.GetChars(bytes, 0, read, chars, 0);
                if (count > 0)
                    _onOutput(new string(chars, 0, count));
            }
        }
        catch (IOException)
        {
            // Broken pipe: the pseudoconsole is gone
        }
        finally
        {
            _output.Dispose();
            done.TrySetResult();
        }
    }

    void ClosePseudoConsole()
    {
        if (Interlocked.Exchange(ref _pseudoConsoleClosed, 1) == 0)
            Native.ClosePseudoConsole(_pseudoConsole);
    }

    public void Dispose()
    {
        _exitWait.Unregister(null);
        // Only once the exit wait on the handle is over
        if (HasExited)
            _process.Dispose();
        else
            Kill();
        // ClosePseudoConsole can block until the output is drained, so keep it off the caller's thread
        Task.Run(ClosePseudoConsole);
        _input.Dispose();
    }

    /// <summary>Quotes an argument following the rules of CommandLineToArgvW and the MSVC runtime.</summary>
    public static string QuoteArgument(string argument)
    {
        if (argument.Length > 0 && argument.IndexOfAny([' ', '\t', '"']) < 0)
            return argument;

        var quoted = new StringBuilder("\"");
        var backslashes = 0;
        foreach (var c in argument)
        {
            if (c == '\\')
            {
                backslashes++;
                continue;
            }
            quoted.Append('\\', c == '"' ? backslashes * 2 + 1 : backslashes).Append(c);
            backslashes = 0;
        }
        return quoted.Append('\\', backslashes * 2).Append('"').ToString();
    }

    sealed class ProcessWaitHandle : WaitHandle
    {
        public ProcessWaitHandle(SafeProcessHandle process) =>
            SafeWaitHandle = new SafeWaitHandle(process.DangerousGetHandle(), ownsHandle: false);
    }

    static class Native
    {
        public const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
        public const int STARTF_USESTDHANDLES = 0x00000100;
        public static readonly IntPtr PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016;

        [StructLayout(LayoutKind.Sequential)]
        public struct COORD
        {
            public short X;
            public short Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct STARTUPINFO
        {
            public int cb;
            public IntPtr lpReserved;
            public IntPtr lpDesktop;
            public IntPtr lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct STARTUPINFOEX
        {
            public STARTUPINFO StartupInfo;
            public IntPtr lpAttributeList;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        [DllImport("kernel32.dll")]
        public static extern int CreatePseudoConsole(COORD size, SafeFileHandle hInput, SafeFileHandle hOutput, uint dwFlags, out IntPtr phPC);

        [DllImport("kernel32.dll")]
        public static extern int ResizePseudoConsole(IntPtr hPC, COORD size);

        [DllImport("kernel32.dll")]
        public static extern void ClosePseudoConsole(IntPtr hPC);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CreatePipe(out SafeFileHandle hReadPipe, out SafeFileHandle hWritePipe, IntPtr lpPipeAttributes, int nSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool InitializeProcThreadAttributeList(IntPtr lpAttributeList, int dwAttributeCount, int dwFlags, ref IntPtr lpSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool UpdateProcThreadAttribute(IntPtr lpAttributeList, uint dwFlags, IntPtr attribute, IntPtr lpValue,
            IntPtr cbSize, IntPtr lpPreviousValue, IntPtr lpReturnSize);

        [DllImport("kernel32.dll")]
        public static extern void DeleteProcThreadAttributeList(IntPtr lpAttributeList);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern bool CreateProcessW(string? lpApplicationName, StringBuilder lpCommandLine, IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string? lpCurrentDirectory,
            ref STARTUPINFOEX lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool GetExitCodeProcess(SafeProcessHandle hProcess, out int lpExitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr handle);
    }
}
