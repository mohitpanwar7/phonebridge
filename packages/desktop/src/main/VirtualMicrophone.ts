/**
 * VirtualMicrophone — routes decoded PCM audio from the phone's microphone
 * to "CABLE Input" (VB-Cable) so it appears as a microphone source in
 * Zoom, Teams, Discord, OBS, etc.
 *
 * Audio flow:
 *   Phone mic → WebRTC audio track → AudioWorklet (renderer) → IPC → here → PortAudio → CABLE Input
 *
 * Requires:
 *   - VB-Cable installed (https://vb-audio.com/Cable/)
 *   - @abandonware/naudiodon installed and built for the current Electron version
 */

const SAMPLE_RATE   = 48_000; // Hz — must match AudioDecoder in renderer
const NUM_CHANNELS  = 2;      // stereo
const BITS_PER_SAMPLE = 16;   // naudiodon expects 16-bit PCM
const CABLE_INPUT_NAME = 'CABLE Input';

export class VirtualMicrophone {
  private portAudio: any = null;
  private stream: any    = null;
  private active = false;
  private deviceIndex = -1;

  constructor() {
    this.tryLoadPortAudio();
  }

  private tryLoadPortAudio() {
    try {
      // @abandonware/naudiodon is the maintained fork of naudiodon
      this.portAudio = require('@abandonware/naudiodon');
      console.log('[VirtualMicrophone] naudiodon loaded');
    } catch {
      try {
        this.portAudio = require('naudiodon');
        console.log('[VirtualMicrophone] naudiodon (legacy) loaded');
      } catch {
        console.warn(
          '[VirtualMicrophone] naudiodon not available — virtual mic disabled.\n' +
          '  Install: pnpm add @abandonware/naudiodon --filter @phonebridge/desktop',
        );
      }
    }
  }

  /** Find the CABLE Input device index in PortAudio's device list. */
  private findCableInputIndex(): number {
    if (!this.portAudio) return -1;
    try {
      const devices: any[] = this.portAudio.getDevices();
      for (const dev of devices) {
        if (
          typeof dev.name === 'string' &&
          dev.name.includes(CABLE_INPUT_NAME) &&
          dev.maxOutputChannels > 0
        ) {
          console.log(`[VirtualMicrophone] Found "${dev.name}" at index ${dev.id}`);
          return dev.id as number;
        }
      }
      console.warn(`[VirtualMicrophone] "${CABLE_INPUT_NAME}" not found in PortAudio devices`);
    } catch (err) {
      console.error('[VirtualMicrophone] getDevices() failed:', err);
    }
    return -1;
  }

  /**
   * Start streaming PCM to CABLE Input.
   * Call once when the phone connects.
   */
  start(): boolean {
    if (this.active) return true;
    if (!this.portAudio) return false;

    this.deviceIndex = this.findCableInputIndex();
    if (this.deviceIndex < 0) return false;

    try {
      this.stream = new this.portAudio.AudioIO({
        outOptions: {
          channelCount:   NUM_CHANNELS,
          sampleFormat:   this.portAudio.SampleFormat16Bit,
          sampleRate:     SAMPLE_RATE,
          deviceId:       this.deviceIndex,
          closeOnError:   false,
        },
      });

      this.stream.start();
      this.active = true;
      console.log(`[VirtualMicrophone] Streaming PCM → "${CABLE_INPUT_NAME}" (${SAMPLE_RATE} Hz, ${NUM_CHANNELS}ch)`);
      return true;
    } catch (err) {
      console.error('[VirtualMicrophone] Failed to open PortAudio stream:', err);
      this.stream = null;
      return false;
    }
  }

  /**
   * Write a chunk of Float32 PCM (from AudioWorklet) to CABLE Input.
   * The renderer sends float32 samples; we convert to Int16 here for PortAudio.
   *
   * @param float32Buffer - Float32Array-compatible Buffer from renderer IPC
   */
  writePCM(float32Buffer: Buffer): void {
    if (!this.active || !this.stream) return;

    // float32Buffer contains raw Float32 samples (4 bytes each)
    const floatSamples = float32Buffer.length / 4;
    const int16Buf = Buffer.allocUnsafe(floatSamples * 2);

    for (let i = 0; i < floatSamples; ++i) {
      const f = float32Buffer.readFloatLE(i * 4);
      // Clamp and convert Float32 [-1, 1] → Int16 [-32768, 32767]
      const clamped = Math.max(-1, Math.min(1, f));
      int16Buf.writeInt16LE(Math.round(clamped * 32767), i * 2);
    }

    try {
      this.stream.write(int16Buf);
    } catch {
      // Stream may overflow briefly — ignore individual frame drops
    }
  }

  /** Stop streaming and release the PortAudio stream. */
  stop(): void {
    if (!this.active || !this.stream) return;
    try {
      this.stream.quit();
    } catch { /* ignore */ }
    this.stream  = null;
    this.active  = false;
    console.log('[VirtualMicrophone] Stopped');
  }

  get isActive(): boolean { return this.active; }
  get isAvailable(): boolean { return this.portAudio !== null; }
  get sampleRate(): number { return SAMPLE_RATE; }
  get channels(): number { return NUM_CHANNELS; }
}
