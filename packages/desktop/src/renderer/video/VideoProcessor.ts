/**
 * VideoProcessor — chains effects on each video frame before sending to
 * the virtual camera (Softcam).  All processing runs on an OffscreenCanvas
 * inside a requestAnimationFrame loop.
 */

export interface VideoEffects {
  blur: boolean;            // background blur (CSS filter, no ML yet)
  brightness: number;       // 0.5 – 2.0
  contrast: number;         // 0.5 – 2.0
  saturation: number;       // 0.0 – 3.0
  filter: 'none' | 'grayscale' | 'sepia' | 'vivid' | 'warm' | 'cool';
  crop: { x: number; y: number; w: number; h: number } | null; // normalized 0-1
  recording: boolean;
}

export const DEFAULT_EFFECTS: VideoEffects = {
  blur: false,
  brightness: 1.0,
  contrast: 1.0,
  saturation: 1.0,
  filter: 'none',
  crop: null,
  recording: false,
};

const FILTER_PRESETS: Record<string, string> = {
  none:      '',
  grayscale: 'grayscale(1)',
  sepia:     'sepia(0.8)',
  vivid:     'saturate(2) contrast(1.2)',
  warm:      'sepia(0.3) saturate(1.5)',
  cool:      'hue-rotate(200deg) saturate(0.9)',
};

export class VideoProcessor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private effects: VideoEffects = { ...DEFAULT_EFFECTS };
  private rafId: number | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private onFrame: ((data: ImageData, w: number, h: number) => void) | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
  }

  start(videoEl: HTMLVideoElement, onFrame: (data: ImageData, w: number, h: number) => void) {
    this.onFrame = onFrame;
    const loop = () => {
      if (videoEl.readyState >= 2) {
        const srcW = videoEl.videoWidth;
        const srcH = videoEl.videoHeight;

        // Determine crop region
        const crop = this.effects.crop;
        const sx = crop ? crop.x * srcW : 0;
        const sy = crop ? crop.y * srcH : 0;
        const sw = crop ? crop.w * srcW : srcW;
        const sh = crop ? crop.h * srcH : srcH;

        this.canvas.width = Math.max(1, Math.round(sw));
        this.canvas.height = Math.max(1, Math.round(sh));

        // Build CSS filter string
        const parts: string[] = [];
        if (this.effects.brightness !== 1) parts.push(`brightness(${this.effects.brightness})`);
        if (this.effects.contrast !== 1) parts.push(`contrast(${this.effects.contrast})`);
        if (this.effects.saturation !== 1) parts.push(`saturate(${this.effects.saturation})`);
        if (this.effects.blur) parts.push('blur(4px)');
        const preset = FILTER_PRESETS[this.effects.filter] || '';
        if (preset) parts.push(preset);
        this.ctx.filter = parts.join(' ') || 'none';

        this.ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, this.canvas.width, this.canvas.height);

        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        onFrame(imageData, this.canvas.width, this.canvas.height);
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.stopRecording();
  }

  setEffects(effects: Partial<VideoEffects>) {
    this.effects = { ...this.effects, ...effects };
    if (effects.recording !== undefined) {
      if (effects.recording) this.startRecording();
      else this.stopRecording();
    }
  }

  getEffects(): VideoEffects {
    return { ...this.effects };
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  private startRecording() {
    if (this.mediaRecorder) return; // already recording
    try {
      const stream = this.canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });
      this.recordedChunks = [];
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };
      this.mediaRecorder.onstop = () => this.saveRecording();
      this.mediaRecorder.start(100);
    } catch (err) {
      console.error('[VideoProcessor] Recording start failed:', err);
    }
  }

  private stopRecording() {
    if (this.mediaRecorder?.state !== 'inactive') {
      this.mediaRecorder?.stop();
    }
    this.mediaRecorder = null;
  }

  private saveRecording() {
    if (this.recordedChunks.length === 0) return;
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phonebridge-recording-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    this.recordedChunks = [];
  }

  // ── Snapshot ───────────────────────────────────────────────────────────────

  snapshot(): string {
    return this.canvas.toDataURL('image/png');
  }
}
