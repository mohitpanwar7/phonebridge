import React, { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  icon?: string;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, icon?: string) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_DURATION = 3000;
let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info', icon?: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-3), { id, message, type, icon }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999,
        pointerEvents: 'none',
      }}>
        {toasts.map((t) => (
          <ToastBubble key={t.id} item={t} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastBubble({ item }: { item: ToastItem }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const colors: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
    success: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.25)', text: '#4ade80', icon: '\u2713' },
    error:   { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', text: '#f87171', icon: '\u2717' },
    info:    { bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.25)', text: '#a78bfa', icon: '\u2139' },
  };
  const c = colors[item.type];

  return (
    <div style={{
      padding: '10px 20px', borderRadius: 12,
      background: c.bg, border: `1px solid ${c.border}`,
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      color: c.text, fontSize: 13, fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: 8,
      whiteSpace: 'nowrap',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(8px)',
      transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
    }}>
      <span style={{ fontSize: 14 }}>{item.icon || c.icon}</span>
      {item.message}
    </div>
  );
}
