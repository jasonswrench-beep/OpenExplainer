# Lists every top-level window of openexplainer.exe, visible or not, with its class, title and owner. Used by Test MCP.bat to check that MCP mode shows no window.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class Enumerate {
  public delegate bool Callback(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  public static List<string> ForPid(HashSet<uint> pids) {
    var found = new List<string>();
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pids.Contains(pid)) {
        var t = new StringBuilder(256); GetWindowText(h, t, 256);
        var c = new StringBuilder(256); GetClassName(h, c, 256);
        found.Add(string.Format("{0} | class={1} | visible={2} | owner={3}", t, c, IsWindowVisible(h), GetWindow(h, 4) != IntPtr.Zero));
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
$ids = New-Object 'System.Collections.Generic.HashSet[uint32]'
Get-Process -Name openexplainer -ErrorAction SilentlyContinue | ForEach-Object { [void]$ids.Add([uint32]$_.Id) }
[Enumerate]::ForPid($ids)
