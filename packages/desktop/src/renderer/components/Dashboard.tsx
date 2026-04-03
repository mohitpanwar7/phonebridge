import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AppState, AppSettings } from '../App';
import { NotificationPanel, type AppNotification } from './NotificationPanel';

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg: '#09090b',
  surface: '#141417',
  surface2: '#1c1c22',
  surface3: '#27272a',
  border: '#2e2e35',
  border2: '#3f3f46',
  accent: '#7c3aed',
  accentHover: '#6d28d9',
  accentL: '#a78bfa',
  accentBg: 'rgba(124,58,237,0.12)',
  accentBg2: 'rgba(167,139,250,0.08)',
  green: '#22c55e',
  greenBg: 'rgba(34,197,94,0.12)',
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.12)',
  amber: '#f59e0b',
  amberBg: 'rgba(245,158,11,0.12)',
  blue: '#3b82f6',
  blueBg: 'rgba(59,130,246,0.12)',
  t1: '#f4f4f5',
  t2: '#a1a1aa',
  t3: '#71717a',
  t4: '#52525b',
  mono: '"JetBrains Mono","Fira Code","Courier New",monospace',
};

// ─── Tiny helpers ────────────────────────────────────────────────────────────
const card = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: C.surface2,
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  padding: '14px 16px',
  ...extra,
});

const label = (extra?: React.CSSProperties): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: C.t3,
  marginBottom: 10,
  ...extra,
});

const row = (extra?: React.CSSProperties): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  ...extra,
});

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 20,
      background: connected ? C.greenBg : C.surface3,
      border: `1px solid ${connected ? 'rgba(34,197,94,0.3)' : C.border}`,
      fontSize: 12, fontWeight: 600,
      color: connected ? C.green : C.t3,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: connected ? C.green : C.t4,
        boxShadow: connected ? `0 0 6px ${C.green}` : 'none',
      }} />
      {connected ? 'Connected' : 'Waiting for phone…'}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={label()}>{children}</div>;
}

function DeviceBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', padding: '9px 12px',
      borderRadius: 7, border: `1px solid ${active ? C.accentL + '40' : 'transparent'}`,
      background: active ? C.accentBg : 'transparent',
      color: active ? C.accentL : C.t2,
      fontSize: 13, fontWeight: active ? 600 : 400,
      cursor: 'pointer', transition: 'all 0.12s',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: active ? C.accentL : C.t4,
      }} />
      {children}
    </button>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 36, height: 20, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
      background: value ? C.accent : C.surface3,
      border: `1px solid ${value ? C.accentL + '40' : C.border}`,
      position: 'relative', transition: 'all 0.15s',
    }}>
      <div style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 14, height: 14, borderRadius: '50%',
        background: value ? C.accentL : C.t4,
        transition: 'left 0.15s',
      }} />
    </div>
  );
}

function Select<T extends string | number>({
  value, options, onChange,
}: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select value={String(value)} onChange={(e) => {
      const raw = e.target.value;
      const match = options.find((o) => String(o.v) === raw);
      if (match) onChange(match.v);
    }} style={{
      background: C.surface3, border: `1px solid ${C.border}`,
      borderRadius: 6, padding: '5px 8px', color: C.t1,
      fontSize: 12, cursor: 'pointer', outline: 'none',
    }}>
      {options.map((o) => (
        <option key={String(o.v)} value={String(o.v)}>{o.label}</option>
      ))}
    </select>
  );
}

function SettingRow({ label: lbl, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 13, color: C.t2 }}>{lbl}</span>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: C.accentL,
      display: 'flex', alignItems: 'center', gap: 6,
      marginTop: 16, marginBottom: 4,
    }}>
      <span>{icon}</span>{title}
    </div>
  );
}

// ─── STATS OVERLAY ───────────────────────────────────────────────────────────

interface StreamStats {
  fps: number;
  bitrateKbps: number;
  resolutionW: number;
  resolutionH: number;
}

function StatsOverlay({ videoRef, visible }: { videoRef: React.RefObject<HTMLVideoElement>; visible: boolean }) {
  const [stats, setStats] = useState<StreamStats>({ fps: 0, bitrateKbps: 0, resolutionW: 0, resolutionH: 0 });
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return; }

    let prevTimestamp = 0;
    const measure = (timestamp: number) => {
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        frameCountRef.current++;
        const now = performance.now();
        const elapsed = now - lastFpsTimeRef.current;
        if (elapsed >= 1000) {
          const fps = Math.round((frameCountRef.current * 1000) / elapsed);
          const w = video.videoWidth;
          const h = video.videoHeight;
          // Estimate bitrate from video element if available
          const bitrateKbps = 0; // will be updated via RTCStatsReport in useWebRTC
          setStats({ fps, bitrateKbps, resolutionW: w, resolutionH: h });
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;
        }
      }
      rafRef.current = requestAnimationFrame(measure);
    };
    rafRef.current = requestAnimationFrame(measure);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [visible, videoRef]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
      borderRadius: 8, padding: '6px 10px',
      fontSize: 11, fontFamily: C.mono, color: C.accentL,
      display: 'flex', flexDirection: 'column', gap: 2,
      lineHeight: 1.5,
    }}>
      <div>{stats.fps} fps</div>
      {stats.resolutionW > 0 && <div>{stats.resolutionW}×{stats.resolutionH}</div>}
    </div>
  );
}

// ─── VU METER ────────────────────────────────────────────────────────────────

function VUMeter({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    const audioCtx = new AudioContext();
    ctxRef.current = audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      const canvas = canvasRef.current;
      const ctx2d = canvas?.getContext('2d');
      if (!canvas || !ctx2d) { rafRef.current = requestAnimationFrame(draw); return; }
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      const level = avg / 255;
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      const grad = ctx2d.createLinearGradient(0, canvas.height, 0, 0);
      grad.addColorStop(0, '#22c55e');
      grad.addColorStop(0.7, '#f59e0b');
      grad.addColorStop(1, '#ef4444');
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, canvas.height * (1 - level), canvas.width, canvas.height * level);
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtx.close().catch(() => {});
    };
  }, [stream]);

  return (
    <canvas
      ref={canvasRef}
      width={8}
      height={80}
      style={{ borderRadius: 4, background: C.surface3 }}
    />
  );
}

// ─── SENSOR SPARKLINE ────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || values.length < 2) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    ctx.beginPath();
    ctx.strokeStyle = color ?? C.accentL;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [values, color]);
  return <canvas ref={canvasRef} width={80} height={24} style={{ display: 'block' }} />;
}

// ─── SENSORS TAB ─────────────────────────────────────────────────────────────

function extractNumericValue(sensor: string, data: any): number | null {
  if (!data) return null;
  switch (sensor) {
    case 'accelerometer':
    case 'gyroscope':
    case 'magnetometer':
    case 'gravity': return Math.sqrt((data.x ?? 0) ** 2 + (data.y ?? 0) ** 2 + (data.z ?? 0) ** 2);
    case 'barometer': return data.pressure ?? null;
    case 'light': return data.illuminance ?? null;
    case 'pedometer': return data.steps ?? null;
    case 'battery': return (data.level ?? 0) * 100;
    case 'gps': return data.speed ?? null;
    default: return null;
  }
}

const SENSOR_ICONS: Record<string, string> = {
  gps: '📍', accelerometer: '↗', gyroscope: '🌀',
  magnetometer: '🧭', barometer: '🌡', light: '💡',
  proximity: '📏', pedometer: '👣', gravity: '🌍',
  rotation: '🔄', battery: '🔋',
};

function formatSensor(sensor: string, data: any): string {
  if (!data) return '—';
  switch (sensor) {
    case 'gps': return `${data.latitude?.toFixed(5)}, ${data.longitude?.toFixed(5)}`;
    case 'accelerometer':
    case 'gyroscope':
    case 'magnetometer':
    case 'gravity': return `${data.x?.toFixed(3)}, ${data.y?.toFixed(3)}, ${data.z?.toFixed(3)}`;
    case 'rotation': return `x:${data.x?.toFixed(2)} y:${data.y?.toFixed(2)} z:${data.z?.toFixed(2)}`;
    case 'barometer': return `${data.pressure?.toFixed(2)} hPa`;
    case 'light': return `${data.illuminance?.toFixed(0)} lux`;
    case 'proximity': return data.isNear ? '● Near' : '○ Far';
    case 'pedometer': return `${data.steps?.toLocaleString()} steps`;
    case 'battery': return `${(data.level * 100).toFixed(0)}% ${data.isCharging ? '⚡' : ''}`;
    default: return JSON.stringify(data);
  }
}

function SensorsTab({ sensorData }: { sensorData: Record<string, { data: any; timestamp: number }> }) {
  const bridge = (window as any).phoneBridge;

  const exportCSV = () => bridge?.exportSensorsCSV?.();
  const exportJSON = () => bridge?.exportSensorsJSON?.();

  // Keep a rolling 30-point history for sparklines
  const historyRef = useRef<Record<string, number[]>>({});
  Object.entries(sensorData).forEach(([sensor, entry]) => {
    if (!historyRef.current[sensor]) historyRef.current[sensor] = [];
    const numeric = extractNumericValue(sensor, entry.data);
    if (numeric !== null) {
      historyRef.current[sensor].push(numeric);
      if (historyRef.current[sensor].length > 30) historyRef.current[sensor].shift();
    }
  });

  const entries = Object.entries(sensorData);

  const exportBtnStyle: React.CSSProperties = {
    background: C.surface3, border: `1px solid ${C.border}`,
    borderRadius: 6, color: C.t2, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
  };

  return (
    <div>
      {/* Export toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.t4, marginRight: 4 }}>Export:</span>
        <button style={exportBtnStyle} onClick={exportCSV}>CSV</button>
        <button style={exportBtnStyle} onClick={exportJSON}>JSON</button>
        <span style={{ fontSize: 11, color: C.t4, marginLeft: 8 }}>{entries.length} sensor{entries.length !== 1 ? 's' : ''}</span>
      </div>
    {entries.length === 0 ? (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, color: C.t4, fontSize: 13 }}>
        No sensor data yet
      </div>
    ) : (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, padding: 4 }}>
      {entries.map(([sensor, entry]) => (
        <div key={sensor} style={{
          background: C.surface3, borderRadius: 8,
          border: `1px solid ${C.border}`, padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>{SENSOR_ICONS[sensor] ?? '📊'}</span>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.t3 }}>
              {sensor}
            </span>
            <div style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: C.green, boxShadow: `0 0 4px ${C.green}` }} />
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.t1, wordBreak: 'break-all' }}>
            {formatSensor(sensor, entry.data)}
          </div>
          {/* Sparkline */}
          {(historyRef.current[sensor]?.length ?? 0) >= 2 && (
            <div style={{ marginTop: 6 }}>
              <Sparkline values={historyRef.current[sensor]} />
            </div>
          )}
          <div style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>
            {new Date(entry.timestamp).toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
    )}
    </div>
  );
}

// ─── SETTINGS TAB ────────────────────────────────────────────────────────────

function DriverBadge({ ready, label }: { ready: boolean; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: ready ? C.greenBg : C.amberBg,
      color: ready ? C.green : C.amber,
      border: `1px solid ${ready ? C.green : C.amber}40`,
    }}>
      <div style={{
        width: 5, height: 5, borderRadius: '50%',
        background: ready ? C.green : C.amber,
        boxShadow: ready ? `0 0 4px ${C.green}` : 'none',
      }} />
      {label}: {ready ? 'Ready' : 'Not installed'}
    </div>
  );
}

function SettingsTab({
  settings,
  onChange,
  driverStatus,
  sysAudioActive,
  gainValue,
  noiseGateThreshold,
  onStartSystemAudio,
  onStopSystemAudio,
  onSetGain,
  onSetNoiseGate,
}: {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
  driverStatus: { softcamReady: boolean; vbCableReady: boolean };
  sysAudioActive: boolean;
  gainValue: number;
  noiseGateThreshold: number;
  onStartSystemAudio?: () => Promise<void>;
  onStopSystemAudio?: () => void;
  onSetGain?: (v: number) => void;
  onSetNoiseGate?: (v: number) => void;
}) {
  const setVideo = (patch: Partial<AppSettings['video']>) =>
    onChange({ ...settings, video: { ...settings.video, ...patch } });
  const setAudio = (patch: Partial<AppSettings['audio']>) =>
    onChange({ ...settings, audio: { ...settings.audio, ...patch } });
  const setSensor = (sensor: string, patch: Partial<{ enabled: boolean; intervalMs: number }>) =>
    onChange({
      ...settings,
      sensors: { ...settings.sensors, [sensor]: { ...settings.sensors[sensor], ...patch } },
    });

  const sensorList = Object.entries(settings.sensors);
  const rateOptions = [
    { v: 16, label: '60 Hz' },
    { v: 33, label: '30 Hz' },
    { v: 50, label: '20 Hz' },
    { v: 100, label: '10 Hz' },
    { v: 200, label: '5 Hz' },
    { v: 500, label: '2 Hz' },
    { v: 1000, label: '1 Hz' },
    { v: 5000, label: '0.2 Hz' },
    { v: 10000, label: '0.1 Hz' },
  ];

  return (
    <div style={{ padding: '4px 8px', overflowY: 'auto', maxHeight: '100%' }}>
      <SectionHeader icon="🎬" title="Video" />
      <div style={card({ padding: '6px 14px', marginBottom: 8 })}>
        <SettingRow label="Resolution">
          <Select value={settings.video.resolution} onChange={(v) => setVideo({ resolution: v })}
            options={[{ v: '480p', label: '480p' }, { v: '720p', label: '720p HD' }, { v: '1080p', label: '1080p FHD' }, { v: '4K', label: '4K UHD' }]} />
        </SettingRow>
        <SettingRow label="Frame Rate">
          <Select value={settings.video.fps} onChange={(v) => setVideo({ fps: v })}
            options={[{ v: 15, label: '15 fps' }, { v: 24, label: '24 fps' }, { v: 30, label: '30 fps' }, { v: 60, label: '60 fps' }]} />
        </SettingRow>
        <SettingRow label="Codec">
          <Select value={settings.video.codec} onChange={(v) => setVideo({ codec: v })}
            options={[{ v: 'H264', label: 'H.264 (best compat.)' }, { v: 'VP8', label: 'VP8' }, { v: 'VP9', label: 'VP9' }]} />
        </SettingRow>
        <SettingRow label="Bitrate">
          <Select value={settings.video.bitrateKbps} onChange={(v) => setVideo({ bitrateKbps: v })}
            options={[{ v: 0, label: 'Auto' }, { v: 1000, label: '1 Mbps' }, { v: 2000, label: '2 Mbps' }, { v: 4000, label: '4 Mbps' }, { v: 8000, label: '8 Mbps' }]} />
        </SettingRow>
      </div>

      <SectionHeader icon="🎙" title="Audio" />
      <div style={card({ padding: '6px 14px', marginBottom: 8 })}>
        <SettingRow label="Microphone">
          <Toggle value={settings.audio.enabled} onChange={(v) => setAudio({ enabled: v })} />
        </SettingRow>
        <SettingRow label="Sample Rate">
          <Select value={settings.audio.sampleRate} onChange={(v) => setAudio({ sampleRate: v })}
            options={[{ v: 44100, label: '44.1 kHz (CD)' }, { v: 48000, label: '48 kHz (Studio)' }]} />
        </SettingRow>
        <SettingRow label="Channels">
          <Select value={settings.audio.channels} onChange={(v) => setAudio({ channels: v })}
            options={[{ v: 1, label: 'Mono' }, { v: 2, label: 'Stereo' }]} />
        </SettingRow>
        <SettingRow label="Noise Suppression">
          <Toggle value={settings.audio.noiseSuppression} onChange={(v) => setAudio({ noiseSuppression: v })} />
        </SettingRow>
        <SettingRow label="Echo Cancellation">
          <Toggle value={settings.audio.echoCancellation} onChange={(v) => setAudio({ echoCancellation: v })} />
        </SettingRow>
        <SettingRow label="PC → Phone Speaker">
          <Select value={settings.audio.speakerOutput} onChange={(v) => setAudio({ speakerOutput: v })}
            options={[{ v: 'disabled', label: 'Disabled' }, { v: 'vbcable', label: 'VB-Cable (install required)' }]} />
        </SettingRow>
      </div>

      <SectionHeader icon="🔊" title="PC Audio → Phone" />
      <div style={card({ padding: '6px 14px', marginBottom: 8 })}>
        <SettingRow label="System Audio">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: sysAudioActive ? C.green : C.t4 }}>
              {sysAudioActive ? 'Active' : 'Off'}
            </span>
            <button
              onClick={async () => {
                if (sysAudioActive) { onStopSystemAudio?.(); }
                else { await onStartSystemAudio?.(); }
                // Parent will toggle sysAudioActive via state update
              }}
              style={{
                background: sysAudioActive ? C.redBg : C.accentBg,
                color: sysAudioActive ? C.red : C.accentL,
                border: `1px solid ${sysAudioActive ? C.red : C.accentL}40`,
                borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
              }}>
              {sysAudioActive ? 'Stop' : 'Start'}
            </button>
          </div>
        </SettingRow>
        <SettingRow label={`Gain: ${gainValue.toFixed(1)}×`}>
          <input
            type="range" min={0} max={3} step={0.1} value={gainValue}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onSetGain?.(v);
            }}
            style={{ width: 100, accentColor: C.accent }}
          />
        </SettingRow>
        <SettingRow label={`Noise Gate: ${(noiseGateThreshold * 100).toFixed(0)}%`}>
          <input
            type="range" min={0} max={0.2} step={0.005} value={noiseGateThreshold}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onSetNoiseGate?.(v);
            }}
            style={{ width: 100, accentColor: C.accent }}
          />
        </SettingRow>
      </div>

      <SectionHeader icon="📡" title="Sensors" />
      <div style={card({ padding: '6px 14px', marginBottom: 8 })}>
        {sensorList.map(([sensor, cfg]) => (
          <div key={sensor} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 0', borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 14, width: 20 }}>{SENSOR_ICONS[sensor] ?? '📊'}</span>
            <span style={{ flex: 1, fontSize: 13, color: C.t2, textTransform: 'capitalize' }}>{sensor}</span>
            <Select value={cfg.intervalMs} onChange={(v) => setSensor(sensor, { intervalMs: v })}
              options={rateOptions} />
            <Toggle value={cfg.enabled} onChange={(v) => setSensor(sensor, { enabled: v })} />
          </div>
        ))}
      </div>

      <SectionHeader icon="📷" title="Virtual Drivers" />
      <div style={card({ padding: '10px 14px', marginBottom: 8 })}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DriverBadge ready={driverStatus.softcamReady} label="Virtual Webcam (Softcam)" />
          <DriverBadge ready={driverStatus.vbCableReady} label="Virtual Mic (VB-Cable)" />
        </div>
        {(!driverStatus.softcamReady || !driverStatus.vbCableReady) && (
          <div style={{ fontSize: 11, color: C.t4, lineHeight: 1.6, marginTop: 10 }}>
            {!driverStatus.softcamReady && (
              <div>• Softcam: build the addon and run the app to install the DirectShow filter.</div>
            )}
            {!driverStatus.vbCableReady && (
              <div>• VB-Cable: install from vb-audio.com/Cable then restart PhoneBridge.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── NFC TAB ─────────────────────────────────────────────────────────────────

import type { NFCTag, NFCNdefRecord } from '@phonebridge/shared';

function NFCTagRow({ tag, onStartScan, onReplay }: {
  tag: NFCTag;
  onStartScan: () => void;
  onReplay: (tag: NFCTag) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 0' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => setExpanded((e) => !e)}
      >
        <div style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
          background: C.accentBg, color: C.accentL, border: `1px solid ${C.accentL}30`,
        }}>{tag.tagType}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{tag.name}</div>
          <div style={{ fontSize: 11, color: C.t4, fontFamily: C.mono }}>{tag.uid}</div>
        </div>
        {tag.canEmulate && (
          <button onClick={(e) => { e.stopPropagation(); onReplay(tag); }} style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: C.accentBg, color: C.accentL,
          }}>Replay</button>
        )}
        <span style={{ color: C.t4, fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: C.bg, borderRadius: 6 }}>
          {tag.ndefRecords?.map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: C.t2, fontFamily: C.mono, marginBottom: 4 }}>
              [{r.type}] {r.uri ?? r.payload}
            </div>
          ))}
          {tag.mifareData && (
            <div style={{ fontSize: 11, color: C.t3 }}>
              MIFARE: {tag.mifareData.sectorCount} sectors
            </div>
          )}
          {tag.rawData && (
            <div style={{ fontSize: 11, color: C.t3, fontFamily: C.mono }}>{tag.rawData}</div>
          )}
          <div style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>
            Saved: {new Date(tag.savedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

function NFCTab() {
  const [tags, setTags] = React.useState<NFCTag[]>([]);
  const [lastScanned, setLastScanned] = React.useState<NFCTag | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [replayStatus, setReplayStatus] = React.useState<{ active: boolean; tagName?: string }>({ active: false });
  const [writeText, setWriteText] = React.useState('');
  const [writeResult, setWriteResult] = React.useState<{ ok: boolean; msg: string } | null>(null);

  const bridge = (window as any).phoneBridge;

  React.useEffect(() => {
    bridge?.nfcGetTags().then((t: NFCTag[]) => setTags(t ?? []));
    bridge?.onNFCTagScanned?.((tag: NFCTag) => {
      setLastScanned(tag);
      setTags((prev) => {
        const exists = prev.find((t) => t.id === tag.id);
        return exists ? prev : [tag, ...prev];
      });
      setScanning(false);
    });
    bridge?.onNFCSavedTags?.((t: NFCTag[]) => setTags(t ?? []));
    bridge?.onNFCWriteResult?.((r: { success: boolean; error?: string }) => {
      setWriteResult({ ok: r.success, msg: r.success ? 'Written!' : r.error ?? 'Failed' });
    });
    bridge?.onNFCReplayStatus?.((s: { active: boolean; tagName?: string }) => setReplayStatus(s));
  }, []);

  const startScan = () => {
    bridge?.nfcSendCommand({ cmd: 'nfcStartScan' });
    setScanning(true);
  };
  const stopScan = () => {
    bridge?.nfcSendCommand({ cmd: 'nfcStopScan' });
    setScanning(false);
  };
  const writeNdef = () => {
    if (!writeText.trim()) return;
    const record: NFCNdefRecord = { tnf: 1, type: 'T', payload: writeText.trim(), languageCode: 'en' };
    bridge?.nfcSendCommand({ cmd: 'nfcWrite', records: [record] });
    setWriteResult(null);
  };
  const startReplay = (tag: NFCTag) => {
    bridge?.nfcSendCommand({ cmd: 'nfcReplay', tagId: tag.id });
  };
  const stopReplay = () => {
    bridge?.nfcSendCommand({ cmd: 'nfcStopReplay' });
  };

  return (
    <div style={{ padding: '4px 8px', overflowY: 'auto', maxHeight: '100%' }}>
      {/* Scan control */}
      <SectionHeader icon="📡" title="Live Scan" />
      <div style={card({ padding: '10px 14px', marginBottom: 8 })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: lastScanned ? 10 : 0 }}>
          {!scanning ? (
            <button onClick={startScan} style={{
              background: C.accent, color: '#fff', border: 'none', borderRadius: 6,
              padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Start Scan on Phone</button>
          ) : (
            <button onClick={stopScan} style={{
              background: C.surface3, color: C.t2, border: `1px solid ${C.border}`, borderRadius: 6,
              padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Stop Scan</button>
          )}
          {scanning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.accentL }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.accentL, boxShadow: `0 0 4px ${C.accentL}` }} />
              Waiting for tag…
            </div>
          )}
        </div>
        {lastScanned && (
          <div style={{ fontSize: 12, color: C.t2, background: C.bg, borderRadius: 6, padding: '8px 10px' }}>
            <span style={{ color: C.green }}>✓</span> Last scanned: <strong style={{ color: C.t1 }}>{lastScanned.name}</strong>
            <span style={{ color: C.t4, marginLeft: 8 }}>{lastScanned.uid}</span>
          </div>
        )}
      </div>

      {/* HCE Replay status */}
      {replayStatus.active && (
        <>
          <SectionHeader icon="▶" title="Replay Active" />
          <div style={card({ padding: '10px 14px', background: C.greenBg, border: `1px solid ${C.green}40`, marginBottom: 8 })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.green }}>Emulating: {replayStatus.tagName}</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>Hold phone near NFC reader</div>
              </div>
              <button onClick={stopReplay} style={{
                background: C.redBg, color: C.red, border: `1px solid ${C.red}40`,
                borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
              }}>Stop</button>
            </div>
          </div>
        </>
      )}

      {/* Write NDEF */}
      <SectionHeader icon="✍" title="Write to Tag" />
      <div style={card({ padding: '10px 14px', marginBottom: 8 })}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={writeText}
            onChange={(e) => setWriteText(e.target.value)}
            placeholder="Text or URL to write…"
            style={{
              flex: 1, background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '7px 10px', color: C.t1, fontSize: 12, outline: 'none',
            }}
          />
          <button onClick={writeNdef} style={{
            background: C.accent, color: '#fff', border: 'none', borderRadius: 6,
            padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Write</button>
        </div>
        {writeResult && (
          <div style={{ marginTop: 8, fontSize: 12, color: writeResult.ok ? C.green : C.red }}>
            {writeResult.ok ? '✓ ' : '✗ '}{writeResult.msg}
          </div>
        )}
        <div style={{ fontSize: 11, color: C.t4, marginTop: 6 }}>
          Tap "Write" then hold phone near a writable NFC tag.
        </div>
      </div>

      {/* Saved tags list */}
      <SectionHeader icon="🏷" title={`Saved Tags (${tags.length})`} />
      <div style={card({ padding: '4px 14px', marginBottom: 8 })}>
        {tags.length === 0 ? (
          <div style={{ padding: '12px 0', fontSize: 12, color: C.t4, textAlign: 'center' }}>
            No tags yet — scan your first NFC tag on the phone.
          </div>
        ) : (
          tags.map((tag) => (
            <NFCTagRow key={tag.id} tag={tag} onStartScan={startScan} onReplay={startReplay} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── API TAB ─────────────────────────────────────────────────────────────────

function APITab({ ip }: { ip: string }) {
  const host = ip || 'localhost';
  const endpoints = [
    { method: 'GET', path: '/api/sensors', desc: 'All latest sensor values' },
    { method: 'GET', path: '/api/sensors/{sensor}', desc: 'Single sensor latest value' },
    { method: 'GET', path: '/api/sensors/{sensor}/history?limit=100', desc: 'Ring buffer history' },
  ];
  const wsEvents = [
    { event: 'sensor', desc: 'Real-time sensor reading' },
    { event: 'sensorBatch', desc: 'Batched high-freq readings' },
    { event: 'deviceInfo', desc: 'Camera/mic/sensor list' },
  ];

  const CodeBlock = ({ children }: { children: string }) => (
    <pre style={{
      background: C.bg, borderRadius: 6, padding: '8px 10px', margin: '6px 0 0',
      fontSize: 11, fontFamily: C.mono, color: C.accentL,
      border: `1px solid ${C.border}`, overflowX: 'auto',
    }}>{children}</pre>
  );

  return (
    <div style={{ padding: '4px 8px', overflowY: 'auto' }}>
      <SectionHeader icon="🌐" title="REST API — port 8420" />
      <div style={card({ padding: '8px 14px', marginBottom: 8 })}>
        {endpoints.map((e, i) => (
          <div key={i} style={{ padding: '7px 0', borderBottom: i < endpoints.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.green, fontFamily: C.mono }}>{e.method}</span>
              <span style={{ fontSize: 12, fontFamily: C.mono, color: C.t1 }}>http://{host}:8420{e.path}</span>
            </div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{e.desc}</div>
          </div>
        ))}
      </div>

      <SectionHeader icon="⚡" title="WebSocket — port 8421" />
      <div style={card({ padding: '8px 14px', marginBottom: 8 })}>
        <CodeBlock>{`const ws = new WebSocket('ws://${host}:8421');\nws.onmessage = (e) => console.log(JSON.parse(e.data));`}</CodeBlock>
        <div style={{ marginTop: 10 }}>
          {wsEvents.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12 }}>
              <span style={{ fontFamily: C.mono, color: C.accentL, minWidth: 90 }}>"{e.event}"</span>
              <span style={{ color: C.t3 }}>{e.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <SectionHeader icon="🔗" title="Named Pipe (planned)" />
      <div style={card({ padding: '8px 14px', marginBottom: 8 })}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.t3 }}>
          {`\\\\.\\pipe\\phonebridge-sensors`}<br />
          <span style={{ color: C.t4, marginTop: 4, display: 'block' }}>Binary MessagePack — for Unity / Unreal Engine</span>
        </div>
      </div>

      <SectionHeader icon="🧠" title="Quick Example (Python)" />
      <div style={card({ padding: '6px 14px', marginBottom: 8 })}>
        <CodeBlock>{`import requests
r = requests.get('http://${host}:8420/api/sensors/gps')
gps = r.json()  # {lat, lon, alt, speed, heading}

import websocket, json
ws = websocket.create_connection('ws://${host}:8421')
print(json.loads(ws.recv()))  # live sensor stream`}</CodeBlock>
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────

interface Props {
  state: AppState;
  settings: AppSettings;
  videoRef: React.RefObject<HTMLVideoElement>;
  onSwitchCamera: (id: string) => void;
  onSwitchMic: (id: string) => void;
  onSettingsChange: (s: AppSettings) => void;
  onTorch: (enabled: boolean) => void;
  onZoom: (level: number) => void;
  onCommand?: (cmd: object) => void; // generic command sender for Phase 6+
  onStartSystemAudio?: () => Promise<void>;
  onStopSystemAudio?: () => void;
  onSetGain?: (value: number) => void;
  onSetNoiseGate?: (threshold: number) => void;
  videoEffects?: import('../video/VideoProcessor').VideoEffects;
  onVideoEffects?: (effects: Partial<import('../video/VideoProcessor').VideoEffects>) => void;
  onSnapshot?: () => void;
  notifications?: AppNotification[];
  onClearNotifications?: () => void;
  themeMode?: 'dark' | 'light';
  onThemeToggle?: () => void;
}

type BottomTab = 'sensors' | 'settings' | 'api' | 'nfc';

export default function Dashboard({ state, settings, videoRef, onSwitchCamera, onSwitchMic, onSettingsChange, onTorch, onZoom, onCommand, onStartSystemAudio, onStopSystemAudio, onSetGain, onSetNoiseGate, videoEffects, onVideoEffects, onSnapshot, notifications, onClearNotifications, themeMode, onThemeToggle }: Props) {
  const [bottomTab, setBottomTab] = useState<BottomTab>('sensors');
  const [bottomHeight, setBottomHeight] = useState(260);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [privacyModeActive, setPrivacyModeActive] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [nightModeEnabled, setNightModeEnabled] = useState(false);
  const [exposureComp, setExposureCompState] = useState(0);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  // Phase 7: audio pipeline
  const [sysAudioActive, setSysAudioActive] = useState(false);
  const [gainValue, setGainValue] = useState(1.0);
  const [noiseGateThreshold, setNoiseGateThresholdState] = useState(0.02);
  const isConnected = state.connectionState !== 'disconnected';

  // Capture remote MediaStream for VU meter from the video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const obs = new MutationObserver(() => {
      const ms = (video as any).srcObject as MediaStream | null;
      setRemoteStream(ms);
    });
    obs.observe(video, { attributes: true, attributeFilter: ['src'] });
    // Also detect via loadedmetadata
    const onLoaded = () => setRemoteStream((video as any).srcObject as MediaStream | null);
    video.addEventListener('loadedmetadata', onLoaded);
    return () => { obs.disconnect(); video.removeEventListener('loadedmetadata', onLoaded); };
  }, [videoRef]);
  const sensorCount = Object.keys(state.sensorData).length;

  const tabBtn = (tab: BottomTab, icon: string, label: string, badge?: number) => (
    <button onClick={() => setBottomTab(tab)} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '0 16px', height: 36, borderRadius: 6, border: 'none', cursor: 'pointer',
      background: bottomTab === tab ? C.accentBg : 'transparent',
      color: bottomTab === tab ? C.accentL : C.t3,
      fontSize: 13, fontWeight: bottomTab === tab ? 600 : 400,
      transition: 'all 0.12s',
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{
          background: bottomTab === tab ? C.accent : C.surface3,
          color: bottomTab === tab ? '#fff' : C.t3,
          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
        }}>{badge}</span>
      )}
    </button>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, color: C.t1, overflow: 'hidden', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>

      {/* ── SIDEBAR ── */}
      <div style={{
        width: 270, flexShrink: 0, background: C.surface,
        borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{
          padding: '16px 18px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: `linear-gradient(135deg, ${C.accent}, #4f46e5)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
          }}>📱</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.t1, letterSpacing: '-0.3px' }}>PhoneBridge</div>
            <div style={{ fontSize: 10, color: C.t4 }}>v0.1.0</div>
          </div>
          {/* Notification bell + theme toggle */}
          <div style={{ display: 'flex', gap: 4 }}>
            {notifications !== undefined && onClearNotifications && (
              <NotificationPanel notifications={notifications} onClear={onClearNotifications} />
            )}
            {onThemeToggle && (
              <button onClick={onThemeToggle} title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`} style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: C.t1, padding: '6px 8px', cursor: 'pointer', fontSize: 14,
              }}>
                {themeMode === 'dark' ? '☀️' : '🌙'}
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>

          {/* Connection */}
          <div style={card()}>
            <SectionLabel>Connection</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <StatusBadge connected={isConnected} />
              {isConnected && (
                <div title="WebRTC uses DTLS-SRTP end-to-end encryption" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                  border: '1px solid rgba(34,197,94,0.3)', cursor: 'default',
                }}>
                  🔒 E2E Encrypted
                </div>
              )}
            </div>
            {isConnected && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {state.phoneModel && (
                  <div style={row({ justifyContent: 'space-between' })}>
                    <span style={{ fontSize: 12, color: C.t3 }}>Device</span>
                    <span style={{ fontSize: 12, color: C.t1, fontWeight: 500 }}>{state.phoneModel}</span>
                  </div>
                )}
                {state.phonePlatform && (
                  <div style={row({ justifyContent: 'space-between' })}>
                    <span style={{ fontSize: 12, color: C.t3 }}>Platform</span>
                    <span style={{ fontSize: 12, color: C.t1, textTransform: 'capitalize' }}>{state.phonePlatform}</span>
                  </div>
                )}
                {state.batteryLevel > 0 && (
                  <div style={row({ justifyContent: 'space-between' })}>
                    <span style={{ fontSize: 12, color: C.t3 }}>Battery</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: state.batteryLevel < 0.2 ? C.red : state.batteryLevel < 0.5 ? C.amber : C.green }}>
                      {(state.batteryLevel * 100).toFixed(0)}%{state.isCharging ? ' ⚡' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* QR Code — show when disconnected */}
          {!isConnected && state.qrCode && (
            <div style={card()}>
              <SectionLabel>Scan to Connect</SectionLabel>
              <div style={{
                background: '#fff', borderRadius: 8, padding: 10,
                display: 'flex', justifyContent: 'center', marginBottom: 8,
              }}>
                <img src={state.qrCode} alt="QR" width={190} height={190} />
              </div>
              <div style={{
                fontFamily: C.mono, fontSize: 11, color: C.accentL,
                textAlign: 'center', padding: '4px 0',
              }}>
                {state.ip}:{state.port}
              </div>
              <div style={{ fontSize: 11, color: C.t4, textAlign: 'center', marginTop: 2 }}>
                Open PhoneBridge on your phone
              </div>
            </div>
          )}

          {/* Cameras */}
          {isConnected && state.cameras.length > 0 && (
            <div style={card()}>
              <SectionLabel>Cameras ({state.cameras.length})</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {state.cameras.map((cam) => (
                  <DeviceBtn key={cam.id} active={cam.id === state.activeCameraId} onClick={() => onSwitchCamera(cam.id)}>
                    {cam.name}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'inherit', opacity: 0.6 }}>
                      {cam.position}
                    </span>
                  </DeviceBtn>
                ))}
              </div>
            </div>
          )}

          {/* Microphones */}
          {isConnected && state.microphones.length > 0 && (
            <div style={card()}>
              <SectionLabel>Microphones ({state.microphones.length})</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {state.microphones.map((mic) => (
                  <DeviceBtn key={mic.id} active={mic.id === state.activeMicId} onClick={() => onSwitchMic(mic.source)}>
                    {mic.name}
                  </DeviceBtn>
                ))}
              </div>
            </div>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Active sensors indicator */}
          {isConnected && (
            <div style={{
              ...card({ padding: '10px 14px' }),
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 14,
            }}>
              <span style={{ fontSize: 12, color: C.t3 }}>Active Sensors</span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: sensorCount > 0 ? C.green : C.t4,
                fontFamily: C.mono,
              }}>{sensorCount} / {Object.keys(settings.sensors).length}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          height: 44, background: C.surface, borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, color: C.t3 }}>Live Feed</span>
          <div style={{ flex: 1 }} />
          {/* Driver status badges — always visible */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
              padding: '2px 8px', borderRadius: 12,
              background: state.driverStatus.softcamReady ? C.greenBg : C.surface3,
              color: state.driverStatus.softcamReady ? C.green : C.t4,
              border: `1px solid ${state.driverStatus.softcamReady ? C.green + '40' : C.border}`,
            }}>
              <span>📷</span> CAM
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
              padding: '2px 8px', borderRadius: 12,
              background: state.driverStatus.vbCableReady ? C.greenBg : C.surface3,
              color: state.driverStatus.vbCableReady ? C.green : C.t4,
              border: `1px solid ${state.driverStatus.vbCableReady ? C.green + '40' : C.border}`,
            }}>
              <span>🎙</span> MIC
            </div>
          </div>
          {isConnected && (
            <>
              <div style={{ width: 1, height: 20, background: C.border }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.t3 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, boxShadow: `0 0 4px ${C.green}` }} />
                Streaming
              </div>
              <div style={{ width: 1, height: 20, background: C.border }} />
              <span style={{ fontSize: 11, color: C.t4, fontFamily: C.mono }}>
                {settings.video.resolution} · {settings.video.fps}fps · {settings.video.codec}
              </span>
              <div style={{ width: 1, height: 20, background: C.border }} />
              {/* Stats toggle */}
              <button onClick={() => setShowStats((s) => !s)} style={{
                background: showStats ? C.accentBg : 'transparent',
                color: showStats ? C.accentL : C.t3,
                border: `1px solid ${showStats ? C.accentL + '30' : 'transparent'}`,
                borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
              }}>Stats</button>

              <div style={{ width: 1, height: 20, background: C.border }} />

              {/* Blur */}
              <button onClick={() => onVideoEffects?.({ blur: !videoEffects?.blur })} title="Toggle background blur" style={{
                background: videoEffects?.blur ? C.accentBg : 'transparent',
                color: videoEffects?.blur ? C.accentL : C.t3,
                border: `1px solid ${videoEffects?.blur ? C.accentL + '30' : 'transparent'}`,
                borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
              }}>Blur</button>

              {/* Filter picker */}
              <select
                value={videoEffects?.filter ?? 'none'}
                onChange={(e) => onVideoEffects?.({ filter: e.target.value as any })}
                style={{ background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 6px', color: C.t1, fontSize: 11, cursor: 'pointer' }}
              >
                {['none', 'grayscale', 'sepia', 'vivid', 'warm', 'cool'].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>

              {/* Record */}
              <button onClick={() => onVideoEffects?.({ recording: !videoEffects?.recording })} title={videoEffects?.recording ? 'Stop recording' : 'Start recording'} style={{
                background: videoEffects?.recording ? C.redBg : 'transparent',
                color: videoEffects?.recording ? C.red : C.t3,
                border: `1px solid ${videoEffects?.recording ? C.red + '40' : 'transparent'}`,
                borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
              }}>{videoEffects?.recording ? '⏹ Stop' : '⏺ Rec'}</button>

              {/* Snapshot */}
              <button onClick={onSnapshot} title="Save snapshot" style={{
                background: 'transparent', color: C.t3,
                border: `1px solid transparent`,
                borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
              }}>📷 Snap</button>
            </>
          )}
        </div>

        {/* Video */}
        <div style={{
          flex: 1, background: '#000', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 0, overflow: 'hidden',
        }}>
          {isConnected ? (
            <video
              ref={videoRef}
              style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair' }}
              autoPlay playsInline muted
              onClick={(e) => {
                if (!onCommand) return;
                const rect = (e.currentTarget as HTMLVideoElement).getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                onCommand({ cmd: 'setFocus', x, y });
              }}
            />
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 16px',
                background: C.surface2, border: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
              }}>📷</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.t2, marginBottom: 6 }}>No camera feed</div>
              <div style={{ fontSize: 13, color: C.t4 }}>
                {state.qrCode ? 'Scan the QR code in the sidebar to connect' : 'Starting services…'}
              </div>
            </div>
          )}

          {/* Recording dot + VU meter */}
          {isConnected && (
            <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.red, boxShadow: `0 0 6px ${C.red}`, animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>LIVE</span>
              </div>
              <VUMeter stream={remoteStream} />
            </div>
          )}

          {/* Stats overlay */}
          <StatsOverlay videoRef={videoRef} visible={showStats && isConnected} />

          {/* Camera feature controls (top-left, below LIVE) */}
          {isConnected && (
            <div style={{ position: 'absolute', top: 50, left: 12, display: 'flex', gap: 5 }}>
              {/* Grid toggle */}
              <button
                onClick={() => { const next = !gridEnabled; setGridEnabled(next); onCommand?.({ cmd: 'setGrid', enabled: next }); }}
                title="Toggle rule-of-thirds grid"
                style={{
                  padding: '3px 8px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: gridEnabled ? 'rgba(124,58,237,0.7)' : 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(4px)', color: '#fff', fontSize: 10, fontWeight: 600,
                }}>
                Grid
              </button>
              {/* Night mode */}
              <button
                onClick={() => { const next = !nightModeEnabled; setNightModeEnabled(next); onCommand?.({ cmd: 'setNightMode', enabled: next }); }}
                title="Toggle night mode"
                style={{
                  padding: '3px 8px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: nightModeEnabled ? 'rgba(99,102,241,0.7)' : 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(4px)', color: '#fff', fontSize: 10, fontWeight: 600,
                }}>
                🌙 Night
              </button>
              {/* Take photo */}
              <button
                onClick={() => onCommand?.({ cmd: 'takePhoto' })}
                title="Capture photo"
                style={{
                  padding: '3px 8px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                  color: '#fff', fontSize: 10, fontWeight: 600,
                }}>
                📷 Capture
              </button>
              {/* Exposure */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <button
                  onClick={() => { const next = Math.max(-3, exposureComp - 1); setExposureCompState(next); onCommand?.({ cmd: 'setExposure', compensation: next }); }}
                  style={{ padding: '3px 7px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11 }}>
                  −EV
                </button>
                <span style={{ color: '#fff', fontSize: 10, background: 'rgba(0,0,0,0.6)', padding: '3px 6px', borderRadius: 8 }}>
                  {exposureComp > 0 ? `+${exposureComp}` : exposureComp} EV
                </span>
                <button
                  onClick={() => { const next = Math.min(3, exposureComp + 1); setExposureCompState(next); onCommand?.({ cmd: 'setExposure', compensation: next }); }}
                  style={{ padding: '3px 7px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11 }}>
                  +EV
                </button>
              </div>
            </div>
          )}

          {/* Last photo preview (small thumbnail) */}
          {lastPhoto && (
            <div style={{ position: 'absolute', bottom: 60, left: 12, cursor: 'pointer' }}
              onClick={() => setLastPhoto(null)} title="Click to dismiss">
              <img src={lastPhoto} alt="Last capture"
                style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6, border: `2px solid ${C.accent}`, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }} />
            </div>
          )}

          {/* Camera / torch / zoom controls overlay */}
          {isConnected && (
            <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {/* Privacy mode button */}
              <button
                onClick={() => {
                  const next = !privacyModeActive;
                  setPrivacyModeActive(next);
                  onCommand?.({ cmd: 'setPrivacyMode', enabled: next });
                }}
                title={privacyModeActive ? 'Disable privacy mode' : 'Enable privacy mode (pauses camera/mic)'}
                style={{
                  padding: '5px 10px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  background: privacyModeActive ? 'rgba(220,38,38,0.8)' : 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(4px)',
                  color: '#fff', fontSize: 11, fontWeight: 600, transition: 'all 0.12s',
                }}>
                🔒 {privacyModeActive ? 'Private' : 'Privacy'}
              </button>

              {/* Torch + Zoom row */}
              <div style={{ display: 'flex', gap: 6 }}>
                {/* Torch toggle */}
                <button
                  onClick={() => { const next = !torchEnabled; setTorchEnabled(next); onTorch(next); }}
                  title={torchEnabled ? 'Turn off torch' : 'Turn on torch'}
                  style={{
                    padding: '5px 10px', borderRadius: 16, border: 'none', cursor: 'pointer',
                    background: torchEnabled ? 'rgba(245,158,11,0.8)' : 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(4px)',
                    color: '#fff', fontSize: 11, fontWeight: 600, transition: 'all 0.12s',
                  }}>
                  🔦 {torchEnabled ? 'On' : 'Off'}
                </button>
                {/* Zoom out */}
                <button
                  onClick={() => { const next = parseFloat(Math.max(1.0, zoomLevel - 0.5).toFixed(1)); setZoomLevel(next); onZoom(next); }}
                  disabled={zoomLevel <= 1.0}
                  style={{
                    padding: '5px 9px', borderRadius: 16, border: 'none', cursor: zoomLevel > 1.0 ? 'pointer' : 'default',
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    color: zoomLevel > 1.0 ? '#fff' : 'rgba(255,255,255,0.3)',
                    fontSize: 13, fontWeight: 700, transition: 'all 0.12s',
                  }}>−</button>
                {/* Zoom level */}
                <div style={{
                  padding: '5px 10px', borderRadius: 16,
                  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                  color: '#fff', fontSize: 11, fontWeight: 600, minWidth: 44, textAlign: 'center',
                }}>{zoomLevel.toFixed(1)}×</div>
                {/* Zoom in */}
                <button
                  onClick={() => { const next = parseFloat(Math.min(10.0, zoomLevel + 0.5).toFixed(1)); setZoomLevel(next); onZoom(next); }}
                  disabled={zoomLevel >= 10.0}
                  style={{
                    padding: '5px 9px', borderRadius: 16, border: 'none', cursor: zoomLevel < 10.0 ? 'pointer' : 'default',
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    color: zoomLevel < 10.0 ? '#fff' : 'rgba(255,255,255,0.3)',
                    fontSize: 13, fontWeight: 700, transition: 'all 0.12s',
                  }}>+</button>
              </div>
              {/* Camera switcher row */}
              {state.cameras.length > 1 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {state.cameras.map((cam) => (
                    <button key={cam.id} onClick={() => onSwitchCamera(cam.id)} style={{
                      padding: '5px 10px', borderRadius: 16, border: 'none', cursor: 'pointer',
                      background: cam.id === state.activeCameraId ? C.accent : 'rgba(0,0,0,0.6)',
                      backdropFilter: 'blur(4px)',
                      color: '#fff', fontSize: 11, fontWeight: 600, transition: 'all 0.12s',
                    }}>{cam.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom panel */}
        <div style={{
          height: bottomHeight, flexShrink: 0,
          background: C.surface, borderTop: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Resize handle */}
          <div
            onMouseDown={(e) => {
              const startY = e.clientY;
              const startH = bottomHeight;
              const move = (ev: MouseEvent) => setBottomHeight(Math.max(140, Math.min(600, startH - (ev.clientY - startY))));
              const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up);
            }}
            style={{ height: 4, cursor: 'row-resize', background: C.border, flexShrink: 0 }}
          />

          {/* Tab bar */}
          <div style={{
            height: 40, display: 'flex', alignItems: 'center',
            padding: '0 12px', gap: 4, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
          }}>
            {tabBtn('sensors', '📊', 'Sensors', sensorCount)}
            {tabBtn('nfc', '📡', 'NFC')}
            {tabBtn('settings', '⚙️', 'Settings')}
            {tabBtn('api', '🔗', 'API')}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
            {bottomTab === 'sensors' && <SensorsTab sensorData={state.sensorData} />}
            {bottomTab === 'nfc' && <NFCTab />}
            {bottomTab === 'settings' && (
              <SettingsTab
                settings={settings}
                onChange={onSettingsChange}
                driverStatus={state.driverStatus}
                sysAudioActive={sysAudioActive}
                gainValue={gainValue}
                noiseGateThreshold={noiseGateThreshold}
                onStartSystemAudio={async () => {
                  await onStartSystemAudio?.();
                  setSysAudioActive(true);
                }}
                onStopSystemAudio={() => {
                  onStopSystemAudio?.();
                  setSysAudioActive(false);
                }}
                onSetGain={(v) => { setGainValue(v); onSetGain?.(v); }}
                onSetNoiseGate={(v) => { setNoiseGateThresholdState(v); onSetNoiseGate?.(v); }}
              />
            )}
            {bottomTab === 'api' && <APITab ip={state.ip} />}
          </div>
        </div>
      </div>
    </div>
  );
}
