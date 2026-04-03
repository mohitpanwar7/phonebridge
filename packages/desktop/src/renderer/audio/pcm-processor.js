/**
 * PCMProcessor — AudioWorkletProcessor
 *
 * Runs in the AudioWorklet thread. Receives audio frames from the WebRTC
 * audio track, interleaves stereo channels, converts to Float32 binary, and
 * posts them to the main thread (AudioDecoder) via this.port.
 *
 * Frame size: 128 samples/channel (Web Audio spec fixed block size).
 * Output: raw Float32LE bytes posted as an ArrayBuffer.
 */
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const left  = input[0];                        // Float32Array, 128 samples
    const right = input.length > 1 ? input[1] : input[0]; // use left for mono

    // Interleave L/R into a single ArrayBuffer
    const interleaved = new Float32Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
      interleaved[i * 2]     = left[i];
      interleaved[i * 2 + 1] = right[i];
    }

    // Transfer ownership (zero-copy) to the main thread
    this.port.postMessage(interleaved.buffer, [interleaved.buffer]);
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
