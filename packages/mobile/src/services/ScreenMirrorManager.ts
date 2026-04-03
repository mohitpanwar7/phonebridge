import { NativeModules, Platform } from 'react-native';

const { ScreenMirrorModule } = NativeModules;

export class ScreenMirrorManager {
  private active = false;

  /** Returns true if screen mirroring is supported on this device. */
  isSupported(): boolean {
    return Platform.OS === 'android' && !!ScreenMirrorModule;
  }

  /**
   * Request the MediaProjection permission from the user.
   * Must be called before startMirroring().
   * Returns 'granted' on success, throws on denial.
   */
  async requestPermission(): Promise<void> {
    if (!this.isSupported()) return;
    await ScreenMirrorModule.requestPermission();
  }

  /**
   * Start screen mirroring. The captured frames are encoded via H.264 inside
   * the native module. Integration with WebRTC is a future step (custom video source).
   */
  async startMirroring(width = 1280, height = 720, fps = 30): Promise<void> {
    if (!this.isSupported()) return;
    await ScreenMirrorModule.startMirroring(width, height, fps);
    this.active = true;
  }

  async stopMirroring(): Promise<void> {
    if (!this.isSupported()) return;
    await ScreenMirrorModule.stopMirroring();
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}

export const screenMirrorManager = new ScreenMirrorManager();
