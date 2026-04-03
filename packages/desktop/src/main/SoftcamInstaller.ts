import { dialog, app } from 'electron';
import { execFile, execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

// CLSID registered by "regsvr32 softcam.dll"
const SOFTCAM_CLSID = '{ED3640E5-0F28-4152-8D0F-1893BCF4AD78}';
const REG_KEY = `HKCR\\CLSID\\${SOFTCAM_CLSID}\\InprocServer32`;

export class SoftcamInstaller {
  private dllPath: string;

  constructor() {
    // In packaged app: resources/softcam.dll
    // In dev: packages/desktop/native/softcam-addon/deps/softcam/build/src/softcam.dll
    const devPath = join(
      __dirname,
      '../../native/softcam-addon/deps/softcam/build/src/Release/softcam.dll',
    );
    const prodPath = join(process.resourcesPath ?? app.getAppPath(), 'softcam.dll');

    this.dllPath = existsSync(devPath) ? devPath : prodPath;
  }

  /** Returns true if Softcam filter is registered in the Windows registry. */
  isRegistered(): boolean {
    try {
      execFileSync('reg', ['query', REG_KEY], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if Softcam is registered. If not, shows a dialog and offers to
   * register it. Requires that softcam.dll is present (built or bundled).
   * Returns true if the virtual camera is ready to use.
   */
  async ensureInstalled(): Promise<boolean> {
    if (this.isRegistered()) {
      console.log('[SoftcamInstaller] Softcam already registered');
      return true;
    }

    if (!existsSync(this.dllPath)) {
      console.warn('[SoftcamInstaller] softcam.dll not found at', this.dllPath);
      console.warn('[SoftcamInstaller] Build it: cd native/softcam-addon/deps/softcam && cmake -B build && cmake --build build --config Release');
      return false;
    }

    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: 'Virtual Camera Setup',
      message: 'PhoneBridge Virtual Camera (Softcam) is not installed.',
      detail:
        'To use your phone as a webcam in Zoom, Teams, OBS, etc., PhoneBridge needs to ' +
        'register a virtual camera driver.\n\nThis requires administrator privileges.',
      buttons: ['Install Virtual Camera', 'Skip'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response !== 0) return false;

    return this.register();
  }

  /** Registers softcam.dll via regsvr32 with UAC elevation. */
  private register(): Promise<boolean> {
    return new Promise((resolve) => {
      // Use PowerShell Start-Process with RunAs to get UAC elevation
      const psCmd = `Start-Process regsvr32 -ArgumentList '/s "${this.dllPath}"' -Verb RunAs -Wait`;

      execFile(
        'powershell',
        ['-NoProfile', '-Command', psCmd],
        { timeout: 30_000 },
        (err) => {
          if (err) {
            console.error('[SoftcamInstaller] regsvr32 failed:', err.message);
            dialog.showErrorBox(
              'Virtual Camera Installation Failed',
              `Could not register the virtual camera driver.\n\n${err.message}`,
            );
            resolve(false);
            return;
          }

          const ok = this.isRegistered();
          if (ok) {
            console.log('[SoftcamInstaller] Softcam registered successfully');
          } else {
            console.warn('[SoftcamInstaller] regsvr32 ran but CLSID still not found');
          }
          resolve(ok);
        },
      );
    });
  }

  /** Unregisters softcam.dll (for uninstall). */
  unregister(): Promise<boolean> {
    return new Promise((resolve) => {
      const psCmd = `Start-Process regsvr32 -ArgumentList '/u /s "${this.dllPath}"' -Verb RunAs -Wait`;
      execFile('powershell', ['-NoProfile', '-Command', psCmd], { timeout: 30_000 }, (err) => {
        resolve(!err);
      });
    });
  }
}
