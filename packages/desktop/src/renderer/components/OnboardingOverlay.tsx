import React, { useState, useEffect } from 'react';

const STEPS = [
  {
    title: 'Install PhoneBridge on your phone',
    body: 'Download the PhoneBridge app on your Android or iOS device from the app store.',
    icon: '📱',
  },
  {
    title: 'Scan the QR code',
    body: 'Open PhoneBridge on your phone and tap "Connect to PC". Scan the QR code shown on your desktop, or enter the IP address manually.',
    icon: '📷',
  },
  {
    title: 'Select PhoneBridge Camera',
    body: 'In Zoom, Teams, OBS or any video app, open your camera settings and select "PhoneBridge Camera" as your webcam.',
    icon: '🎬',
  },
];

export function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      if (dontShow) localStorage.setItem('phonebridge-onboarded', '1');
      onDone();
    }
  };

  const s = STEPS[step];

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        background: '#1a1a24',
        border: '1px solid #2d2d3d',
        borderRadius: 16,
        padding: 40,
        maxWidth: 480,
        width: '90%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{s.icon}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8, height: 8,
              borderRadius: 4,
              background: i === step ? '#7c3aed' : '#2d2d3d',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>
        <h2 style={{ color: '#e8e8f0', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{s.title}</h2>
        <p style={{ color: '#8888aa', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>{s.body}</p>
        {step === STEPS.length - 1 && (
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, cursor: 'pointer', color: '#8888aa', fontSize: 13 }}>
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            Don't show this again
          </label>
        )}
        <button onClick={next} style={{
          background: '#7c3aed',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '12px 32px',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
        }}>
          {step < STEPS.length - 1 ? 'Next' : 'Get Started'}
        </button>
      </div>
    </div>
  );
}

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    const done = localStorage.getItem('phonebridge-onboarded');
    if (!done) setShowOnboarding(true);
  }, []);
  return { showOnboarding, dismissOnboarding: () => setShowOnboarding(false) };
}
