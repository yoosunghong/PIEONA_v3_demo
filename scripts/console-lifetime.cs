using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Security.Cryptography;
using System.Text;

// The launcher owns the only job handle. Windows closes it even on console X,
// task termination or a crash, killing ALL descendants (including cloudflared).
public static class PieonaConsoleLifetime
{
    static IntPtr job;
    static Mutex singleton;
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Reserved, Peb, Reserved2, Reserved3, ProcessId, ParentId; }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits limits, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int infoClass, ref ProcessInfo info, int size, out int returned);

    public static void Attach(string projectRoot)
    {
        if (job != IntPtr.Zero) throw new InvalidOperationException("Console job already attached.");
        using (var hash = SHA256.Create()) {
            string key = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(projectRoot.ToLowerInvariant()))).Replace("-", "");
            singleton = new Mutex(false, "Local\\PIEONA-" + key);
        }
        try {
            if (!singleton.WaitOne(0)) throw new InvalidOperationException("PIEONA is already running in another console. Close that window first.");
        } catch (AbandonedMutexException) { /* Previous console was closed; we now own it. */ }
        job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new Win32Exception();
        var limits = new ExtendedLimits();
        limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits))) throw new Win32Exception();
        using (var self = Process.GetCurrentProcess()) {
            if (!AssignProcessToJobObject(job, self.Handle)) throw new Win32Exception();
            // Also cover termination of just cmd.exe, without a console-close signal.
            var info = new ProcessInfo(); int returned;
            if (NtQueryInformationProcess(self.Handle, 0, ref info, Marshal.SizeOf(info), out returned) != 0)
                throw new InvalidOperationException("Unable to watch the launcher parent.");
            var parent = Process.GetProcessById(info.ParentId.ToInt32());
            var handle = parent.Handle; // Pin identity so PID reuse cannot keep the job alive.
            var watcher = new Thread(() => { parent.WaitForExit(); Environment.Exit(1); });
            watcher.IsBackground = true;
            watcher.Start();
        }
    }
}
