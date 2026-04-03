import { execFileSync } from 'child_process';
import { dialog, shell } from 'electron';

export interface AudioDevice {
  name: string;
  index: number;
}

const VBCABLE_INPUT_NAME  = 'CABLE Input';
const VBCABLE_OUTPUT_NAME = 'CABLE Output';
const VBCABLE_DOWNLOAD_URL = 'https://vb-audio.com/Cable/';

export class VBCableDetector {
  /**
   * Enumerate all Windows audio output (render) devices via PowerShell.
   * Returns an array of { name, index } objects.
   */
  listOutputDevices(): AudioDevice[] {
    try {
      const ps = [
        '[Console]::OutputEncoding = [Text.Encoding]::UTF8;',
        'Add-Type -AssemblyName System.Runtime;',
        '$idx = 0;',
        'Get-AudioDevice -List |',
        '  Where-Object { $_.Type -eq "Playback" } |',
        '  ForEach-Object { "$idx|$($_.Name)"; $idx++ }',
      ].join(' ');

      // Fallback: use simpler WASAPI enumeration via PowerShell + COM
      const fallbackPs = `
        [Console]::OutputEncoding = [Text.Encoding]::UTF8
        Add-Type -AssemblyName System.Windows.Forms
        $devices = [System.Windows.Forms.Screen]::AllScreens
        # Use .NET Audio
        Add-Type -AssemblyName PresentationCore
        $e = [System.Windows.Media.MediaPlayer].Assembly
        # Simplest: just check for VB-Cable registry
        $keys = Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Drivers32' -ErrorAction SilentlyContinue
        $keys | ForEach-Object { $_.GetValueNames() | ForEach-Object { $_ } }
      `;

      // Most reliable: PowerShell + MMDevice API via inline C#
      const mmPs = `
        [Console]::OutputEncoding = [Text.Encoding]::UTF8
        Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { void f1(); void f2();
          int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection col); }
        [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceCollection { int GetCount(out uint count);
          int Item(uint nDevice, out IMMDevice device); }
        [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { int Activate(ref Guid iid, int clsCtx, IntPtr par, out object intf);
          int OpenPropertyStore(int access, out IPropertyStore store); int GetId(out string id); }
        [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IPropertyStore { int GetCount(out uint count);
          int GetAt(uint iProp, out PROPERTYKEY key);
          int GetValue(ref PROPERTYKEY key, out PROPVARIANT val); }
        [StructLayout(LayoutKind.Sequential)] struct PROPERTYKEY { public Guid fmtid; public uint pid; }
        [StructLayout(LayoutKind.Explicit)] struct PROPVARIANT { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr ptr; }
        "@
        # Simpler approach: use pnputil or just check known registry path
        $null
      `;

      // Simplest reliable approach: check PowerShell AudioDeviceCmdlets OR registry
      const simplePs = `
        [Console]::OutputEncoding = [Text.Encoding]::UTF8
        $found = @()
        # Try AudioDeviceCmdlets module
        if (Get-Module -ListAvailable -Name AudioDeviceCmdlets -ErrorAction SilentlyContinue) {
          $found = Get-AudioDevice -List | Where-Object { $_.Type -eq 'Playback' } | Select-Object -ExpandProperty Name
        } else {
          # Fallback: powershell COM approach
          $obj = New-Object -ComObject MMDeviceAPI.MMDeviceEnumerator -ErrorAction SilentlyContinue
          if (-not $obj) {
            # Last resort: check VB-Audio registry key
            $path = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4D36E96C-E325-11CE-BFC1-08002BE10318}'
            if (Test-Path $path) {
              Get-ChildItem $path -ErrorAction SilentlyContinue | ForEach-Object {
                $n = (Get-ItemProperty $_.PSPath -Name DriverDesc -ErrorAction SilentlyContinue).DriverDesc
                if ($n) { $found += $n }
              }
            }
          }
        }
        $found -join '|'
      `;

      const out = execFileSync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command', simplePs,
      ], { encoding: 'utf8', timeout: 10_000 }).trim();

      const names = out.split('|').map((s) => s.trim()).filter(Boolean);
      return names.map((name, index) => ({ name, index }));
    } catch (err) {
      console.warn('[VBCableDetector] Device enumeration failed:', err);
      return [];
    }
  }

  /** Returns true if VB-Cable (CABLE Input) is installed and visible as an audio device. */
  isInstalled(): boolean {
    // Check registry for VB-Audio Virtual Cable driver
    try {
      execFileSync('reg', [
        'query',
        'HKLM\\SYSTEM\\CurrentControlSet\\Services\\VBAudioVACMME',
      ], { stdio: 'pipe', timeout: 5_000 });
      return true;
    } catch {
      // Not found via service key — try device class
    }

    try {
      const out = execFileSync('reg', [
        'query',
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4D36E96C-E325-11CE-BFC1-08002BE10318}',
        '/s', '/f', 'VB-Audio Virtual Cable', '/d',
      ], { encoding: 'utf8', stdio: 'pipe', timeout: 5_000 }).trim();
      return out.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Prompts the user to install VB-Cable if it's not detected.
   * Returns true if VB-Cable is ready to use.
   */
  async ensureInstalled(): Promise<boolean> {
    if (this.isInstalled()) {
      console.log('[VBCableDetector] VB-Cable detected');
      return true;
    }

    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: 'Virtual Microphone Setup',
      message: 'VB-Cable is not installed.',
      detail:
        'PhoneBridge uses VB-Cable to route your phone\'s microphone audio to apps like ' +
        'Zoom, Teams, and Discord.\n\n' +
        'VB-Cable is a free virtual audio cable driver by VB-Audio Software.\n' +
        'Click "Download VB-Cable" to open the download page, then run the installer and restart PhoneBridge.',
      buttons: ['Download VB-Cable', 'Skip'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      await shell.openExternal(VBCABLE_DOWNLOAD_URL);
    }

    return false;
  }

  get cableInputName(): string { return VBCABLE_INPUT_NAME; }
  get cableOutputName(): string { return VBCABLE_OUTPUT_NAME; }
}
