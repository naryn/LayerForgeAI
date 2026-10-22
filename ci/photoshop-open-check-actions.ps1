# Photoshop no-warning open check over the legacy action-automation class
# (Photoshop.Application.200.1).
#
# This driver exists because the ExtendScript subsystem of the installed
# Photoshop 2026 (27.11) is non-functional on this host: ScriptingSupport.8li
# loads but its commands never register ("无法完成请求，因为一条命令不可用。"),
# so `Photoshop.Application` never enters the ROT (DCOM 10010 on every attempt),
# and `DoJavaScript` / `Photoshop.exe -r` do nothing. The pinned vendor checker
# uses exactly that path, so it cannot run here.
#
# This driver opens the real document in the real running Photoshop through the
# class that still works, with dialogs left at their defaults (a warning is
# therefore visible, not suppressed). It is not a substitute for the vendor
# checker on a healthy install; ci/photoshop-m0-check-actions.ps1 records which
# driver produced the evidence.
#
#   powershell -File ci/photoshop-open-check-actions.ps1 -Files a.psd,b.psd
# Output lines match the vendor checker: CLEAN / UNKNOWN-DATA / DIALOG / ERROR.
# A dialog is never dismissed. It parks the open, so the run reports and stops;
# a warning can therefore never be mistaken for a clean open.
param(
  [Parameter(Mandatory = $true)][string[]]$Files,
  [int]$OpenTimeoutSec = 120,
  [string]$LogPath = ''
)
$ErrorActionPreference = 'Stop'

$procs = @(Get-Process Photoshop -ErrorAction SilentlyContinue)
if ($procs.Count -ne 1) { throw "Expected exactly one running Photoshop instance, found $($procs.Count)." }
$psPid = $procs[0].Id

$watcherLog = [System.IO.Path]::GetTempFileName()
$watcher = Start-Job -ArgumentList $watcherLog, $psPid -ScriptBlock {
  param($LogFile, $TargetPid)
  Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class PsWatch {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  static string Cls(IntPtr h) { var c = new StringBuilder(256); GetClassNameW(h, c, 256); return c.ToString(); }
  public static List<string> Dialogs(uint pid) {
    var found = new List<string>();
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      var cls = Cls(h);
      if (cls != "PSDialogBox" && cls != "#32770") return true;
      var text = new StringBuilder();
      EnumChildWindows(h, (c, l2) => {
        if (Cls(c) == "Static") { var t = new StringBuilder(1024); GetWindowTextW(c, t, 1024); if (t.Length > 0) { text.Append(t).Append(" | "); } }
        return true; }, IntPtr.Zero);
      found.Add(text.ToString().TrimEnd(' ', '|'));
      return true; }, IntPtr.Zero);
    return found;
  }
}
"@
  $seen = @{}
  while ($true) {
    if (Test-Path ($LogFile + '.stop')) { break }
    foreach ($t in [PsWatch]::Dialogs([uint32]$TargetPid)) {
      if (-not $seen.ContainsKey($t)) {
        $seen[$t] = $true
        Add-Content -Path $LogFile -Value ('DIALOG ' + $t) -Encoding UTF8
      }
    }
    Start-Sleep -Milliseconds 200
  }
}

$lines = @()
foreach ($file in $Files) {
  $full = (Resolve-Path -LiteralPath $file).Path
  $before = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
  $seenBefore = @()
  if (Test-Path $watcherLog) { $seenBefore = @(Get-Content $watcherLog -Encoding UTF8 -ErrorAction SilentlyContinue) }

  # The COM call must live in its own process: a modal dialog blocks it forever,
  # and only the parent can enforce a deadline.
  $opener = Start-Job -ArgumentList $full -ScriptBlock {
    param($Path)
    try {
      $app = [Activator]::CreateInstance([Type]::GetTypeFromCLSID([Guid]'6DECC242-87EF-11CF-86B4-444553540000'))
      $doc = $app.Open($Path)
      $title = $doc.Title
      $doc.Close()
      "OK $title"
    } catch {
      "ERROR $($_.Exception.Message)"
    }
  }
  $completed = Wait-Job $opener -Timeout $OpenTimeoutSec
  $outcome = ''
  if ($completed) { $outcome = (@(Receive-Job $opener) -join ' ') } else { $outcome = "TIMEOUT after ${OpenTimeoutSec}s" }
  Remove-Job $opener -Force -ErrorAction SilentlyContinue

  Start-Sleep -Seconds 2
  $seen = @()
  if (Test-Path $watcherLog) { $seen = @(Get-Content $watcherLog -Encoding UTF8 -ErrorAction SilentlyContinue) }
  $newDialogs = @($seen | Where-Object { $seenBefore -notcontains $_ })
  $after = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash

  if ($before -ne $after) { $lines += "ERROR $file :: file changed during open" }
  elseif ($newDialogs.Count -gt 0) { foreach ($d in $newDialogs) { $lines += "DIALOG $file :: $($d -replace '^DIALOG ', '')" } }
  elseif ($outcome -like 'OK *') { $lines += "CLEAN $file" }
  else { $lines += "ERROR $file :: $outcome" }
}
New-Item -ItemType File -Force -Path ($watcherLog + '.stop') | Out-Null
Wait-Job $watcher -Timeout 10 | Out-Null
Remove-Job $watcher -Force -ErrorAction SilentlyContinue
Remove-Item ($watcherLog + '.stop') -ErrorAction SilentlyContinue
Remove-Item $watcherLog -ErrorAction SilentlyContinue

foreach ($l in $lines) { Write-Output $l }
if ($LogPath) { $lines | Set-Content -LiteralPath $LogPath -Encoding UTF8 }
