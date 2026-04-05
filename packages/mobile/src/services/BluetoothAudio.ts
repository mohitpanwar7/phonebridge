import { BleManager, Device, Characteristic, BleError } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';

// Nordic UART-inspired UUIDs for PhoneBridge BLE audio
const PHONEBRIDGE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const MIC_OUT_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // phone writes mic audio here
const SPEAKER_IN_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // phone subscribes to PC audio here

// Audio constants
const SAMPLE_RATE = 16000;
const PACKET_HEADER_SIZE = 2; // [sequence_number_u8, frame_count_u8]
const PACKET_PAYLOAD_SIZE = 240; // 120 Int16 samples = 7.5ms at 16kHz mono
const PACKET_TOTAL_SIZE = PACKET_HEADER_SIZE + PACKET_PAYLOAD_SIZE; // 242 bytes, fits BLE MTU 244

// Reconnection config
const SCAN_TIMEOUT_MS = 15000;
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

type ConnectionCallback = () => void;
type SpeakerAudioCallback = (pcmData: Float32Array) => void;

export class BluetoothAudioService {
  private bleManager: BleManager;
  private connectedDevice: Device | null = null;
  private connected = false;
  private destroyed = false;
  private scanning = false;
  private sequenceNumber = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  private onConnectedCallbacks: Set<ConnectionCallback> = new Set();
  private onDisconnectedCallbacks: Set<ConnectionCallback> = new Set();
  private speakerAudioCallbacks: Set<SpeakerAudioCallback> = new Set();

  constructor() {
    this.bleManager = new BleManager();
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Start scanning for the PC's PhoneBridge BLE service and connect when found.
   * The phone acts as BLE central (scanner/client).
   */
  async startAdvertising(): Promise<void> {
    if (this.destroyed) {
      throw new Error('[BLE Audio] Service has been destroyed');
    }
    if (this.scanning || this.connected) {
      console.log('[BLE Audio] Already scanning or connected, skipping');
      return;
    }

    await this.requestPermissions();
    await this.ensureBluetoothOn();
    this.reconnectAttempts = 0;
    await this.startScanning();
  }

  /**
   * Stop scanning and disconnect from the PC.
   */
  async stopAdvertising(): Promise<void> {
    this.clearTimers();
    this.stopScanning();
    await this.disconnectDevice();
  }

  /**
   * Returns true if connected to the PC's BLE service.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Register a callback for when the PC connects.
   * Returns an unsubscribe function.
   */
  onPCConnected(callback: ConnectionCallback): () => void {
    this.onConnectedCallbacks.add(callback);
    return () => this.onConnectedCallbacks.delete(callback);
  }

  /**
   * Register a callback for when the PC disconnects.
   * Returns an unsubscribe function.
   */
  onPCDisconnected(callback: ConnectionCallback): () => void {
    this.onDisconnectedCallbacks.add(callback);
    return () => this.onDisconnectedCallbacks.delete(callback);
  }

  /**
   * Encode Float32 PCM samples to Int16 and send as chunked BLE packets.
   * Each packet: [seq_u8, frame_count_u8, ...int16_le_bytes(240)]
   */
  async sendMicAudio(pcmData: Float32Array): Promise<void> {
    if (!this.connected || !this.connectedDevice) {
      return;
    }

    const int16Data = float32ToInt16(pcmData);
    const totalBytes = int16Data.byteLength;
    const samplesPerPacket = PACKET_PAYLOAD_SIZE / 2; // 120 samples per packet
    const totalPackets = Math.ceil(int16Data.length / samplesPerPacket);

    for (let i = 0; i < totalPackets; i++) {
      const sampleOffset = i * samplesPerPacket;
      const sampleCount = Math.min(samplesPerPacket, int16Data.length - sampleOffset);
      const byteCount = sampleCount * 2;

      // Build packet: header + payload
      const packet = new Uint8Array(PACKET_HEADER_SIZE + byteCount);
      packet[0] = this.sequenceNumber & 0xff;
      packet[1] = i & 0xff; // frame index within this batch

      // Copy Int16 bytes into packet payload
      const sourceBytes = new Uint8Array(int16Data.buffer, int16Data.byteOffset + sampleOffset * 2, byteCount);
      packet.set(sourceBytes, PACKET_HEADER_SIZE);

      this.sequenceNumber = (this.sequenceNumber + 1) & 0xff;

      try {
        const base64Payload = uint8ArrayToBase64(packet);
        await this.connectedDevice.writeCharacteristicWithoutResponseForService(
          PHONEBRIDGE_SERVICE_UUID,
          MIC_OUT_CHAR_UUID,
          base64Payload,
        );
      } catch (err) {
        console.warn('[BLE Audio] Failed to send mic packet:', err);
        // Don't break on a single failed write; keep trying with the next packet
      }
    }
  }

  /**
   * Register a callback to receive decoded PCM audio from the PC speaker stream.
   * Returns an unsubscribe function.
   */
  onSpeakerAudio(callback: SpeakerAudioCallback): () => void {
    this.speakerAudioCallbacks.add(callback);
    return () => this.speakerAudioCallbacks.delete(callback);
  }

  /**
   * Tear down all BLE resources. The service cannot be reused after this.
   */
  async destroy(): Promise<void> {
    this.destroyed = true;
    this.clearTimers();
    this.stopScanning();
    await this.disconnectDevice();
    this.onConnectedCallbacks.clear();
    this.onDisconnectedCallbacks.clear();
    this.speakerAudioCallbacks.clear();
    this.bleManager.destroy();
    console.log('[BLE Audio] Service destroyed');
  }

  // ── Permissions ─────────────────────────────────────────────────────

  private async requestPermissions(): Promise<void> {
    if (Platform.OS !== 'android') {
      // iOS permissions are handled via Info.plist
      return;
    }

    const apiLevel = Platform.Version;

    if (typeof apiLevel === 'number' && apiLevel >= 31) {
      // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      const allGranted = Object.values(granted).every(
        (status) => status === PermissionsAndroid.RESULTS.GRANTED,
      );
      if (!allGranted) {
        throw new Error('[BLE Audio] Bluetooth permissions not granted');
      }
    } else {
      // Android < 12 requires ACCESS_FINE_LOCATION for BLE scanning
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('[BLE Audio] Location permission not granted (required for BLE)');
      }
    }
  }

  private async ensureBluetoothOn(): Promise<void> {
    const state = await this.bleManager.state();
    if (state !== 'PoweredOn') {
      console.log(`[BLE Audio] Bluetooth state: ${state}, waiting for PoweredOn...`);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          sub.remove();
          reject(new Error('[BLE Audio] Timed out waiting for Bluetooth to power on'));
        }, 10000);

        const sub = this.bleManager.onStateChange((newState) => {
          if (newState === 'PoweredOn') {
            clearTimeout(timeout);
            sub.remove();
            resolve();
          }
        }, true);
      });
    }
  }

  // ── Scanning & Connection ───────────────────────────────────────────

  private async startScanning(): Promise<void> {
    if (this.scanning || this.destroyed) return;
    this.scanning = true;
    console.log('[BLE Audio] Scanning for PhoneBridge PC service...');

    // Auto-stop scanning after timeout
    this.scanTimer = setTimeout(() => {
      if (this.scanning && !this.connected) {
        console.warn('[BLE Audio] Scan timed out, no PhoneBridge PC found');
        this.stopScanning();
        this.scheduleReconnect();
      }
    }, SCAN_TIMEOUT_MS);

    this.bleManager.startDeviceScan(
      [PHONEBRIDGE_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          console.error('[BLE Audio] Scan error:', error.message);
          this.scanning = false;
          this.scheduleReconnect();
          return;
        }

        if (device) {
          console.log(`[BLE Audio] Found PhoneBridge PC: ${device.name || device.id}`);
          this.stopScanning();
          this.connectToDevice(device);
        }
      },
    );
  }

  private stopScanning(): void {
    if (!this.scanning) return;
    this.scanning = false;
    try {
      this.bleManager.stopDeviceScan();
    } catch {
      // Ignore stop errors
    }
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  private async connectToDevice(device: Device): Promise<void> {
    if (this.destroyed) return;

    try {
      console.log(`[BLE Audio] Connecting to ${device.name || device.id}...`);

      const connected = await device.connect({
        requestMTU: 244,
        timeout: 10000,
      });

      const discovered = await connected.discoverAllServicesAndCharacteristics();
      this.connectedDevice = discovered;
      this.connected = true;
      this.reconnectAttempts = 0;
      this.sequenceNumber = 0;

      console.log(`[BLE Audio] Connected to ${discovered.name || discovered.id}`);

      // Monitor disconnection
      this.bleManager.onDeviceDisconnected(discovered.id, (error, dev) => {
        console.log(`[BLE Audio] Device disconnected: ${error?.message || 'clean'}`);
        this.handleDisconnection();
      });

      // Subscribe to speaker audio notifications (PC -> phone)
      await this.subscribeSpeakerAudio(discovered);

      // Notify listeners
      for (const cb of this.onConnectedCallbacks) {
        try {
          cb();
        } catch (err) {
          console.error('[BLE Audio] onConnected callback error:', err);
        }
      }
    } catch (err: any) {
      console.error('[BLE Audio] Connection failed:', err?.message || err);
      this.connected = false;
      this.connectedDevice = null;
      this.scheduleReconnect();
    }
  }

  private async subscribeSpeakerAudio(device: Device): Promise<void> {
    try {
      device.monitorCharacteristicForService(
        PHONEBRIDGE_SERVICE_UUID,
        SPEAKER_IN_CHAR_UUID,
        (error: BleError | null, characteristic: Characteristic | null) => {
          if (error) {
            console.warn('[BLE Audio] Speaker notification error:', error.message);
            return;
          }
          if (!characteristic?.value) return;

          try {
            const raw = base64ToUint8Array(characteristic.value);
            if (raw.length < PACKET_HEADER_SIZE) return;

            // Skip the 2-byte header, decode Int16 payload to Float32
            const payload = raw.slice(PACKET_HEADER_SIZE);
            const float32 = int16ToFloat32(payload);

            for (const cb of this.speakerAudioCallbacks) {
              try {
                cb(float32);
              } catch (err) {
                console.error('[BLE Audio] Speaker audio callback error:', err);
              }
            }
          } catch (err) {
            console.error('[BLE Audio] Error decoding speaker audio:', err);
          }
        },
      );
      console.log('[BLE Audio] Subscribed to speaker audio notifications');
    } catch (err: any) {
      console.error('[BLE Audio] Failed to subscribe to speaker audio:', err?.message || err);
    }
  }

  // ── Reconnection ────────────────────────────────────────────────────

  private handleDisconnection(): void {
    const wasConnected = this.connected;
    this.connected = false;
    this.connectedDevice = null;

    if (wasConnected) {
      for (const cb of this.onDisconnectedCallbacks) {
        try {
          cb();
        } catch (err) {
          console.error('[BLE Audio] onDisconnected callback error:', err);
        }
      }
    }

    if (!this.destroyed) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.connected || this.scanning) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(
        `[BLE Audio] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`,
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts; // linear backoff
    console.log(
      `[BLE Audio] Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed && !this.connected) {
        this.startScanning();
      }
    }, delay);
  }

  private async disconnectDevice(): Promise<void> {
    this.connected = false;
    const device = this.connectedDevice;
    this.connectedDevice = null;

    if (device) {
      try {
        const isDeviceConnected = await device.isConnected();
        if (isDeviceConnected) {
          await device.cancelConnection();
          console.log('[BLE Audio] Disconnected from device');
        }
      } catch (err: any) {
        console.warn('[BLE Audio] Error during disconnect:', err?.message || err);
      }
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }
}

// ── Audio Conversion Helpers ────────────────────────────────────────────

/**
 * Convert Float32 PCM samples (range -1.0 to 1.0) to Int16 PCM.
 */
function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return int16;
}

/**
 * Convert raw Int16 LE bytes back to Float32 PCM samples.
 */
function int16ToFloat32(bytes: Uint8Array): Float32Array {
  // Ensure even byte count
  const validLength = bytes.length - (bytes.length % 2);
  const sampleCount = validLength / 2;
  const float32 = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, validLength);

  for (let i = 0; i < sampleCount; i++) {
    const int16Value = view.getInt16(i * 2, true); // little-endian
    float32[i] = int16Value / (int16Value < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

// ── Base64 Helpers (react-native-ble-plx uses base64 for data) ──────────

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encode a Uint8Array to base64 string.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? BASE64_CHARS[((b1 & 0xf) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? BASE64_CHARS[b2 & 0x3f] : '=';
  }
  return result;
}

/**
 * Decode a base64 string to Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Strip padding
  const cleaned = base64.replace(/=+$/, '');
  const byteLength = Math.floor((cleaned.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const a = BASE64_CHARS.indexOf(cleaned[i]);
    const b = BASE64_CHARS.indexOf(cleaned[i + 1]);
    const c = i + 2 < cleaned.length ? BASE64_CHARS.indexOf(cleaned[i + 2]) : 0;
    const d = i + 3 < cleaned.length ? BASE64_CHARS.indexOf(cleaned[i + 3]) : 0;

    bytes[byteIndex++] = (a << 2) | (b >> 4);
    if (i + 2 < cleaned.length) bytes[byteIndex++] = ((b & 0xf) << 4) | (c >> 2);
    if (i + 3 < cleaned.length) bytes[byteIndex++] = ((c & 3) << 6) | d;
  }

  return bytes;
}
