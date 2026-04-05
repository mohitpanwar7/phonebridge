import { execFileSync, execFile } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { app, dialog } from 'electron';

export interface AudioDevice {
  name: string;
  index: number;
}

const VBCABLE_INPUT_NAME  = 'CABLE Input';
const VBCABLE_OUTPUT_NAME = 'CABLE Output';

export class VBCableDetector {
  /** Returns true if VB-Cable is installed (checks Windows registry). */
  isInstalled(): boolean {
    // Check registry for VB-Audio Virtual Cable driver service
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

  /** Path to the bundled VB-Cable installer (x64 preferred). */
  private getInstallerPath(): string | null {
    // In packaged app: resources/vbcable/VBCABLE_Setup_x64.exe
    // In dev: packages/desktop/resources/vbcable/VBCABLE_Setup_x64.exe
    const candidates = [
      path.join(process.resourcesPath, 'vbcable', 'VBCABLE_Setup_x64.exe'),
      path.join(process.resourcesPath, 'vbcable', 'VBCABLE_Setup.exe'),
      path.join(app.getAppPath(), 'resources', 'vbcable', 'VBCABLE_Setup_x64.exe'),
      path.join(app.getAppPath(), 'resources', 'vbcable', 'VBCABLE_Setup.exe'),
      // Dev mode fallback
      path.join(__dirname, '..', '..', 'resources', 'vbcable', 'VBCABLE_Setup_x64.exe'),
      path.join(__dirname, '..', '..', 'resources', 'vbcable', 'VBCABLE_Setup.exe'),
    ];

    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Install VB-Cable from the bundled installer.
   * Requires admin elevation (UAC prompt will appear).
   * Returns { success, message }.
   */
  async install(): Promise<{ success: boolean; message: string }> {
    if (this.isInstalled()) {
      return { success: true, message: 'VB-Cable is already installed.' };
    }

    const installerPath = this.getInstallerPath();
    if (!installerPath) {
      return {
        success: false,
        message: 'VB-Cable installer not found in app resources. Please reinstall PhoneBridge.',
      };
    }

    // Confirm with user
    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: 'Install VB-Cable Virtual Audio',
      message: 'Install VB-Cable?',
      detail:
        'PhoneBridge includes VB-Cable (by VB-Audio Software) to route your phone\'s microphone ' +
        'audio to apps like Zoom, Teams, and Discord.\n\n' +
        'The installer will request administrator access.\n' +
        'VB-Cable is free software — see vb-audio.com for details.',
      buttons: ['Install', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response !== 0) {
      return { success: false, message: 'Installation cancelled by user.' };
    }

    return new Promise((resolve) => {
      // Run installer with UAC elevation via PowerShell Start-Process -Verb RunAs
      const psCmd = `Start-Process -FilePath '${installerPath.replace(/'/g, "''")}' -Verb RunAs -Wait`;
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
        timeout: 120_000,
      }, (err) => {
        if (err) {
          console.error('[VBCableDetector] Installer failed:', err);
          resolve({ success: false, message: `Installer failed: ${err.message}` });
          return;
        }

        // Check if installation succeeded
        const installed = this.isInstalled();
        if (installed) {
          console.log('[VBCableDetector] VB-Cable installed successfully');
          resolve({ success: true, message: 'VB-Cable installed successfully! You may need to restart PhoneBridge.' });
        } else {
          resolve({ success: false, message: 'Installation may not have completed. Please try running the installer manually from the app folder.' });
        }
      });
    });
  }

  /**
   * Check if VB-Cable is installed. If not, prompt to install from bundled drivers.
   * Returns true if VB-Cable is ready to use.
   */
  async ensureInstalled(): Promise<boolean> {
    if (this.isInstalled()) {
      console.log('[VBCableDetector] VB-Cable detected');
      return true;
    }

    const result = await this.install();
    return result.success;
  }

  get cableInputName(): string { return VBCABLE_INPUT_NAME; }
  get cableOutputName(): string { return VBCABLE_OUTPUT_NAME; }
}
