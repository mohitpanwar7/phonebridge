import {
  Accelerometer,
  Gyroscope,
  Magnetometer,
  Barometer,
  LightSensor,
  Pedometer,
  DeviceMotion,
} from 'expo-sensors';
import Geolocation from 'react-native-geolocation-service';
import * as Battery from 'expo-battery';
import type { SensorType, SensorData } from '@phonebridge/shared';

type SensorCallback = (sensor: SensorType, data: SensorData, timestamp: number) => void;

interface SensorSubscription {
  remove: () => void;
}

interface SensorConfig {
  enabled: boolean;
  intervalMs: number;
}

const DEFAULT_CONFIGS: Record<SensorType, SensorConfig> = {
  gps: { enabled: true, intervalMs: 1000 },
  accelerometer: { enabled: true, intervalMs: 16 },
  gyroscope: { enabled: true, intervalMs: 16 },
  magnetometer: { enabled: true, intervalMs: 100 },
  barometer: { enabled: true, intervalMs: 1000 },
  light: { enabled: true, intervalMs: 200 },
  proximity: { enabled: false, intervalMs: 500 },
  pedometer: { enabled: true, intervalMs: 1000 },
  gravity: { enabled: false, intervalMs: 16 },
  rotation: { enabled: false, intervalMs: 16 },
  battery: { enabled: true, intervalMs: 10000 },
};

export class SensorManager {
  private subscriptions: Map<SensorType, SensorSubscription> = new Map();
  private configs: Record<SensorType, SensorConfig>;
  private callback: SensorCallback;
  private gpsWatchId: number | null = null;
  private batteryInterval: ReturnType<typeof setInterval> | null = null;
  private proximityInterval: ReturnType<typeof setInterval> | null = null;

  // Batching for high-frequency sensors
  private batchBuffer: Map<SensorType, Array<{ ts: number; data: SensorData }>> = new Map();
  private batchInterval: ReturnType<typeof setInterval> | null = null;
  private batchCallback: ((sensor: SensorType, readings: Array<{ ts: number; data: SensorData }>) => void) | null = null;

  constructor(callback: SensorCallback) {
    this.callback = callback;
    this.configs = { ...DEFAULT_CONFIGS };
  }

  setBatchCallback(cb: (sensor: SensorType, readings: Array<{ ts: number; data: SensorData }>) => void) {
    this.batchCallback = cb;
  }

  startAll() {
    for (const [sensor, config] of Object.entries(this.configs)) {
      if (config.enabled) {
        this.startSensor(sensor as SensorType);
      }
    }

    // Start batch flush interval (50ms)
    this.batchInterval = setInterval(() => this.flushBatches(), 50);
  }

  private startSensor(sensor: SensorType) {
    switch (sensor) {
      case 'accelerometer':
        Accelerometer.setUpdateInterval(this.configs.accelerometer.intervalMs);
        this.subscriptions.set('accelerometer',
          Accelerometer.addListener((data) => {
            this.addToBatch('accelerometer', { x: data.x, y: data.y, z: data.z });
          })
        );
        break;

      case 'gyroscope':
        Gyroscope.setUpdateInterval(this.configs.gyroscope.intervalMs);
        this.subscriptions.set('gyroscope',
          Gyroscope.addListener((data) => {
            this.addToBatch('gyroscope', { x: data.x, y: data.y, z: data.z });
          })
        );
        break;

      case 'magnetometer':
        Magnetometer.setUpdateInterval(this.configs.magnetometer.intervalMs);
        this.subscriptions.set('magnetometer',
          Magnetometer.addListener((data) => {
            this.callback('magnetometer', { x: data.x, y: data.y, z: data.z }, Date.now());
          })
        );
        break;

      case 'barometer':
        Barometer.setUpdateInterval(this.configs.barometer.intervalMs);
        this.subscriptions.set('barometer',
          Barometer.addListener((data) => {
            this.callback('barometer', {
              pressure: data.pressure,
              relativeAltitude: (data as any).relativeAltitude || 0
            }, Date.now());
          })
        );
        break;

      case 'light':
        LightSensor.setUpdateInterval(this.configs.light.intervalMs);
        this.subscriptions.set('light',
          LightSensor.addListener((data) => {
            this.callback('light', { illuminance: data.illuminance }, Date.now());
          })
        );
        break;

      case 'pedometer': {
        const sub = Pedometer.watchStepCount((result) => {
          this.callback('pedometer', { steps: result.steps }, Date.now());
        });
        this.subscriptions.set('pedometer', sub);
        break;
      }

      case 'gps':
        this.gpsWatchId = Geolocation.watchPosition(
          (position) => {
            this.callback('gps', {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              altitude: position.coords.altitude || 0,
              speed: position.coords.speed || 0,
              heading: position.coords.heading || 0,
              accuracy: position.coords.accuracy,
            }, position.timestamp);
          },
          (error) => {
            console.error('[Sensor] GPS error:', error);
          },
          {
            enableHighAccuracy: true,
            distanceFilter: 0,
            interval: this.configs.gps.intervalMs,
            fastestInterval: this.configs.gps.intervalMs,
          }
        );
        break;

      case 'gravity':
        DeviceMotion.setUpdateInterval(this.configs.gravity.intervalMs);
        this.subscriptions.set('gravity',
          DeviceMotion.addListener((data) => {
            if (data.accelerationIncludingGravity && data.acceleration) {
              // gravity = accelerationIncludingGravity - acceleration
              this.addToBatch('gravity', {
                x: data.accelerationIncludingGravity.x - (data.acceleration.x || 0),
                y: data.accelerationIncludingGravity.y - (data.acceleration.y || 0),
                z: data.accelerationIncludingGravity.z - (data.acceleration.z || 0),
              });
            }
          })
        );
        break;

      case 'rotation':
        DeviceMotion.setUpdateInterval(this.configs.rotation.intervalMs);
        this.subscriptions.set('rotation',
          DeviceMotion.addListener((data) => {
            if (data.rotation) {
              this.addToBatch('rotation', {
                x: data.rotation.beta || 0,  // pitch
                y: data.rotation.gamma || 0, // roll
                z: data.rotation.alpha || 0, // yaw
                scalar: 0, // Euler angles, no quaternion scalar
              });
            }
          })
        );
        break;

      case 'proximity':
        // Proximity uses a polling approach via Android NativeModules
        // expo-sensors doesn't provide proximity directly, so we use a simple interval
        // that checks sensor availability. For full proximity support, a native module is needed.
        // For now, emit a placeholder that indicates the sensor is active.
        this.subscriptions.set('proximity', {
          remove: () => {
            if (this.proximityInterval) {
              clearInterval(this.proximityInterval);
              this.proximityInterval = null;
            }
          },
        });
        this.proximityInterval = setInterval(() => {
          // Proximity data would come from native module
          // Placeholder: report "not near" until native module is integrated
          this.callback('proximity', { isNear: false, distance: -1 }, Date.now());
        }, this.configs.proximity.intervalMs);
        break;

      case 'battery':
        this.batteryInterval = setInterval(async () => {
          const level = await Battery.getBatteryLevelAsync();
          const state = await Battery.getBatteryStateAsync();
          this.callback('battery', {
            level,
            isCharging: state === Battery.BatteryState.CHARGING,
            state: state === Battery.BatteryState.CHARGING ? 'charging'
              : state === Battery.BatteryState.FULL ? 'full'
              : 'discharging',
          }, Date.now());
        }, this.configs.battery.intervalMs);
        break;
    }
  }

  private addToBatch(sensor: SensorType, data: SensorData) {
    if (!this.batchBuffer.has(sensor)) {
      this.batchBuffer.set(sensor, []);
    }
    this.batchBuffer.get(sensor)!.push({ ts: Date.now(), data });
  }

  private flushBatches() {
    for (const [sensor, readings] of this.batchBuffer) {
      if (readings.length > 0) {
        if (this.batchCallback) {
          this.batchCallback(sensor, [...readings]);
        }
        readings.length = 0;
      }
    }
  }

  setSensorRate(sensor: SensorType, intervalMs: number) {
    this.configs[sensor].intervalMs = intervalMs;
    // Restart sensor with new rate
    this.stopSensor(sensor);
    if (this.configs[sensor].enabled) {
      this.startSensor(sensor);
    }
  }

  enableSensor(sensor: SensorType, enabled: boolean) {
    this.configs[sensor].enabled = enabled;
    if (enabled) {
      this.startSensor(sensor);
    } else {
      this.stopSensor(sensor);
    }
  }

  private stopSensor(sensor: SensorType) {
    const sub = this.subscriptions.get(sensor);
    if (sub) {
      sub.remove();
      this.subscriptions.delete(sensor);
    }
    if (sensor === 'gps' && this.gpsWatchId !== null) {
      Geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }
    if (sensor === 'battery' && this.batteryInterval) {
      clearInterval(this.batteryInterval);
      this.batteryInterval = null;
    }
    if (sensor === 'proximity' && this.proximityInterval) {
      clearInterval(this.proximityInterval);
      this.proximityInterval = null;
    }
  }

  stopAll() {
    for (const sensor of Object.keys(this.configs) as SensorType[]) {
      this.stopSensor(sensor);
    }
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
    this.batchBuffer.clear();
  }

  getAvailableSensors(): SensorType[] {
    return Object.keys(this.configs) as SensorType[];
  }
}
