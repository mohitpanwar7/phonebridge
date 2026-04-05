import React, { useState, useCallback, useRef, useEffect } from 'react';
import { getTokens, cssGlass } from '../theme';
import { Bell, X, Info, AlertTriangle, AlertCircle } from 'lucide-react';

export interface AppNotification {
  id: string;
  message: string;
  severity: 'info' | 'warn' | 'error';
  timestamp: number;
  icon?: string;
}

interface Props {
  notifications: AppNotification[];
  onClear: () => void;
  themeMode?: 'dark' | 'light';
}

export function NotificationPanel({ notifications, onClear, themeMode = 'dark' }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = notifications.length;
  const C = getTokens(themeMode);
  const glass = cssGlass(themeMode);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const severityIcon = (s: AppNotification['severity']) => {
    if (s === 'error') return <AlertCircle size={14} color={C.red} />;
    if (s === 'warn') return <AlertTriangle size={14} color={C.amber} />;
    return <Info size={14} color={C.accent} />;
  };

  const severityColor = (s: AppNotification['severity']) =>
    s === 'error' ? C.red : s === 'warn' ? C.amber : C.accent;

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        style={{
          background: unread > 0 ? C.accentBgSubtle : 'transparent',
          border: `1px solid ${unread > 0 ? C.accent + '30' : C.border}`,
          borderRadius: 8,
          color: C.t1,
          padding: '6px 8px',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          transition: 'all 0.15s ease',
        }}
      >
        <Bell size={14} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            background: C.red, color: '#fff',
            borderRadius: '50%', width: 16, height: 16,
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 6px ${C.red}60`,
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          top: 50,
          right: 16,
          width: 360, maxHeight: 420,
          ...glass,
          borderRadius: 14,
          boxShadow: '0 12px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
          zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          animation: 'slideUp 0.2s ease',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}>
            <span style={{ color: C.t1, fontWeight: 600, fontSize: 14 }}>Notifications</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {notifications.length > 0 && (
                <button onClick={() => { onClear(); setOpen(false); }} style={{
                  background: 'none', border: 'none', color: C.t3, cursor: 'pointer',
                  fontSize: 12, padding: '2px 6px', borderRadius: 4,
                  transition: 'color 0.15s',
                }}>
                  Clear all
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{
                background: 'none', border: 'none', color: C.t4, cursor: 'pointer',
                padding: 2, display: 'flex', borderRadius: 4,
              }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: 32, textAlign: 'center', color: C.t4, fontSize: 13,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              }}>
                <Bell size={24} strokeWidth={1.5} />
                No notifications
              </div>
            ) : (
              [...notifications].reverse().map((n, i) => (
                <div key={n.id} style={{
                  padding: '12px 16px',
                  borderBottom: i < notifications.length - 1 ? `1px solid ${C.borderSubtle}` : 'none',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  animation: `fadeIn 0.15s ease ${i * 0.03}s both`,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: severityColor(n.severity) + '18',
                  }}>
                    {severityIcon(n.severity)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: 13, lineHeight: 1.4 }}>{n.message}</div>
                    <div style={{ color: C.t4, fontSize: 11, marginTop: 3 }}>
                      {new Date(n.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Hook to manage notifications state
export function useNotifications(maxItems = 200) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const counterRef = useRef(0);

  const addNotification = useCallback((message: string, severity: AppNotification['severity'] = 'info', icon?: string) => {
    counterRef.current++;
    const notif: AppNotification = {
      id: `${Date.now()}-${counterRef.current}`,
      message, severity, icon,
      timestamp: Date.now(),
    };
    setNotifications((prev) => {
      const next = [...prev, notif];
      return next.length > maxItems ? next.slice(next.length - maxItems) : next;
    });
  }, [maxItems]);

  const clearNotifications = useCallback(() => setNotifications([]), []);

  return { notifications, addNotification, clearNotifications };
}
