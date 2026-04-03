import { join } from 'path';

interface SoftcamAddon {
  createCamera(width: number, height: number, fps: number): boolean;
  sendFrame(buffer: Buffer): void;
  destroyCamera(): void;
  isAvailable(): boolean;
}

export class VirtualCamera {
  private addon: SoftcamAddon | null = null;
  private active = false;
  private width = 0;
  private height = 0;

  constructor() {
    try {
      // Try to load the pre-built native addon
      const addonPath = join(__dirname, '../../native/softcam-addon/build/Release/softcam_addon.node');
      this.addon = require(addonPath) as SoftcamAddon;
      console.log('[VirtualCamera] Softcam addon loaded');
    } catch {
      console.warn('[VirtualCamera] Softcam addon not available — virtual camera disabled');
      console.warn('[VirtualCamera] Run: cd native/softcam-addon && npm run build');
    }
  }

  isAvailable(): boolean {
    return this.addon?.isAvailable() ?? false;
  }

  create(width: number, height: number, fps = 30): boolean {
    if (!this.addon) return false;
    const ok = this.addon.createCamera(width, height, fps);
    if (ok) {
      this.active = true;
      this.width = width;
      this.height = height;
    }
    return ok;
  }

  /**
   * Send a raw RGBA frame to the virtual camera.
   * The buffer must be width × height × 4 bytes.
   */
  sendFrame(rgbaBuffer: Buffer): void {
    if (!this.active || !this.addon) return;
    this.addon.sendFrame(rgbaBuffer);
  }

  destroy(): void {
    if (!this.active || !this.addon) return;
    this.addon.destroyCamera();
    this.active = false;
  }

  get isActive(): boolean {
    return this.active;
  }

  get dimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
