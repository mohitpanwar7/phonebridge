/**
 * NoiseGateProcessor — AudioWorkletProcessor
 * Mutes samples whose amplitude is below a configurable threshold.
 */
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._threshold = 0.02; // default ~-34 dBFS
    this._attack = 0.001;   // attack smoothing coefficient
    this._release = 0.0001; // release smoothing coefficient
    this._envelope = 0;

    this.port.onmessage = (e) => {
      if (e.data.threshold !== undefined) this._threshold = e.data.threshold;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    for (let ch = 0; ch < output.length; ch++) {
      const inCh = input[ch] ?? new Float32Array(output[ch].length);
      const outCh = output[ch];
      for (let i = 0; i < outCh.length; i++) {
        const abs = Math.abs(inCh[i]);
        // Envelope follower
        const coeff = abs > this._envelope ? this._attack : this._release;
        this._envelope = coeff * abs + (1 - coeff) * this._envelope;
        outCh[i] = this._envelope > this._threshold ? inCh[i] : 0;
      }
    }
    return true;
  }
}

registerProcessor('noise-gate', NoiseGateProcessor);
