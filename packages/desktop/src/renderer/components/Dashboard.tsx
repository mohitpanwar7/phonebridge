import React, { useState } from 'react';
import type { AppState, AppSettings } from '../App';

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

// ─── SENSORS TAB ─────────────────────────────────────────────────────────────

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
  const entries = Object.entries(sensorData);
  if (entries.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.t4, fontSize: 13 }}>
        No sensor data yet
      </div>
    );
  }
  return (
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
          <div style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>
            {new Date(entry.timestamp).toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SETTINGS TAB ────────────────────────────────────────────────────────────

function SettingsTab({
  settings,
  onChange,
}: { settings: AppSettings; onChange: (s: AppSettings) => void }) {
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

      <SectionHeader icon="📷" title="Virtual Camera" />
      <div style={card({ padding: '12px 14px', marginBottom: 8 })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: C.amberBg, color: C.amber, border: `1px solid ${C.amber}40`,
          }}>Not Installed</div>
        </div>
        <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.6 }}>
          Virtual webcam requires Softcam (DirectShow filter).<br />
          Run: <code style={{ color: C.accentL }}>cd native/softcam-addon && npm run build</code>
        </div>
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
}

type BottomTab = 'sensors' | 'settings' | 'api';

export default function Dashboard({ state, settings, videoRef, onSwitchCamera, onSwitchMic, onSettingsChange }: Props) {
  const [bottomTab, setBottomTab] = useState<BottomTab>('sensors');
  const [bottomHeight, setBottomHeight] = useState(260);
  const isConnected = state.connectionState !== 'disconnected';
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
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.t1, letterSpacing: '-0.3px' }}>PhoneBridge</div>
            <div style={{ fontSize: 10, color: C.t4 }}>v0.1.0</div>
          </div>
        </div>

        <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>

          {/* Connection */}
          <div style={card()}>
            <SectionLabel>Connection</SectionLabel>
            <StatusBadge connected={isConnected} />
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
          {isConnected && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.t3 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, boxShadow: `0 0 4px ${C.green}` }} />
                Streaming
              </div>
              <div style={{ width: 1, height: 20, background: C.border }} />
              <span style={{ fontSize: 11, color: C.t4, fontFamily: C.mono }}>
                {settings.video.resolution} · {settings.video.fps}fps · {settings.video.codec}
              </span>
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
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              autoPlay playsInline muted
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

          {/* Recording dot */}
          {isConnected && (
            <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.red, boxShadow: `0 0 6px ${C.red}`, animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>LIVE</span>
            </div>
          )}

          {/* Camera switch overlay (when multiple cameras) */}
          {isConnected && state.cameras.length > 1 && (
            <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 6 }}>
              {state.cameras.map((cam) => (
                <button key={cam.id} onClick={() => onSwitchCamera(cam.id)} style={{
                  padding: '5px 10px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  background: cam.id === state.activeCameraId ? C.accent : 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(4px)',
                  color: '#fff', fontSize: 11, fontWeight: 600,
                  transition: 'all 0.12s',
                }}>{cam.name}</button>
              ))}
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
            {tabBtn('settings', '⚙️', 'Settings')}
            {tabBtn('api', '🔗', 'API')}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
            {bottomTab === 'sensors' && <SensorsTab sensorData={state.sensorData} />}
            {bottomTab === 'settings' && <SettingsTab settings={settings} onChange={onSettingsChange} />}
            {bottomTab === 'api' && <APITab ip={state.ip} />}
          </div>
        </div>
      </div>
    </div>
  );
}
