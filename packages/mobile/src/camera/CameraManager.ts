import { Camera } from 'react-native-vision-camera';
import type { CameraDevice as VisionCameraDevice } from 'react-native-vision-camera';
import type { CameraDevice } from '@phonebridge/shared';

export class CameraManager {
  private devices: VisionCameraDevice[] = [];

  async initialize(): Promise<CameraDevice[]> {
    const permission = await Camera.requestCameraPermission();
    if (permission !== 'granted') {
      throw new Error('Camera permission denied');
    }

    this.devices = await Camera.getAvailableCameraDevices();
    return this.devices.map(this.toSharedDevice);
  }

  private toSharedDevice(device: VisionCameraDevice): CameraDevice {
    const physicalNames = device.physicalDevices || [];
    let name = '';
    if (device.position === 'front') {
      name = 'Front Camera';
    } else if (physicalNames.includes('ultra-wide-angle-camera')) {
      name = 'Ultra Wide';
    } else if (physicalNames.includes('telephoto-camera')) {
      name = 'Telephoto';
    } else {
      name = 'Main Camera';
    }

    return {
      id: device.id,
      name,
      position: device.position === 'front' ? 'front' : device.position === 'back' ? 'back' : 'external',
      physicalDevices: physicalNames as any[],
      hasFlash: device.hasFlash,
      hasTorch: device.hasTorch,
      minZoom: device.minZoom,
      maxZoom: device.maxZoom,
    };
  }

  getDevice(id: string): VisionCameraDevice | undefined {
    return this.devices.find((d) => d.id === id);
  }

  getDefaultBackCamera(): VisionCameraDevice | undefined {
    return this.devices.find(
      (d) => d.position === 'back' && d.physicalDevices.includes('wide-angle-camera')
    ) || this.devices.find((d) => d.position === 'back');
  }

  getDefaultFrontCamera(): VisionCameraDevice | undefined {
    return this.devices.find((d) => d.position === 'front');
  }

  getAllDevices(): VisionCameraDevice[] {
    return this.devices;
  }

  getSharedDevices(): CameraDevice[] {
    return this.devices.map(this.toSharedDevice);
  }
}
