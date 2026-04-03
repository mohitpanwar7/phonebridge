/**
 * AudioDecoder — renderer-side audio pipeline
 *
 * Takes the audio MediaStream received from the phone via WebRTC and:
 *  1. Connects it to an AudioContext
 *  2. Passes audio through an AudioWorkletNode (pcm-processor) that extracts
 *     raw Float32 interleaved PCM frames
 *  3. Sends each frame to the main process via IPC → VirtualMicrophone → VB-Cable
 *
 * Must be started after the WebRTC stream's audio track is available.
 */

const PROCESSOR_NAME = 'pcm-processor';
const SAMPLE_RATE    = 48_000; // must match VirtualMicrophone.ts

// Inline worklet code as a blob URL so it works without a separate file server
const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const left  = input[0];
    const right = input.length > 1 ? input[1] : input[0];
    const interleaved = new Float32Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
      interleaved[i * 2]     = left[i];
      interleaved[i * 2 + 1] = right[i];
    }
    this.port.postMessage(interleaved.buffer, [interleaved.buffer]);
    return true;
  }
}
registerProcessor('${PROCESSOR_NAME}', PCMProcessor);
`;

export class AudioDecoder {
  private ctx: AudioContext | null       = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private active = false;

  /**
   * Start decoding audio from the given MediaStream.
   * Safe to call multiple times — restarts if a new stream arrives.
   */
  async start(stream: MediaStream): Promise<void> {
    this.stop();

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn('[AudioDecoder] Stream has no audio tracks');
      return;
    }

    try {
      this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });

      // Load the worklet from an inline Blob URL (no external file needed)
      const blob     = new Blob([WORKLET_CODE], { type: 'application/javascript' });
      const blobURL  = URL.createObjectURL(blob);
      await this.ctx.audioWorklet.addModule(blobURL);
      URL.revokeObjectURL(blobURL);

      this.workletNode = new AudioWorkletNode(this.ctx, PROCESSOR_NAME, {
        numberOfInputs:  1,
        numberOfOutputs: 0, // no speaker output — we only forward PCM to IPC
      });

      // Receive PCM frames from the worklet thread
      this.workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        this.onPCMFrame(e.data);
      };

      this.sourceNode = this.ctx.createMediaStreamSource(stream);
      this.sourceNode.connect(this.workletNode);

      this.active = true;
      console.log('[AudioDecoder] Started — routing phone audio → VB-Cable');
    } catch (err) {
      console.error('[AudioDecoder] Failed to start:', err);
      this.stop();
    }
  }

  /** Called for every 128-sample (stereo interleaved) chunk from the worklet. */
  private onPCMFrame(buffer: ArrayBuffer): void {
    if (!this.active) return;
    // Send raw Float32LE bytes to main process
    window.phoneBridge?.sendAudioFrame(buffer);
  }

  /** Stop and release all audio resources. */
  stop(): void {
    this.active = false;
    try { this.workletNode?.disconnect(); } catch { /* ignore */ }
    try { this.sourceNode?.disconnect(); }  catch { /* ignore */ }
    try { this.ctx?.close(); }              catch { /* ignore */ }
    this.workletNode = null;
    this.sourceNode  = null;
    this.ctx         = null;
  }

  get isActive(): boolean { return this.active; }
}
