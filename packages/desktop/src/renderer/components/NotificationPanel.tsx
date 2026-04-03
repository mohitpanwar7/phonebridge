import React, { useState, useCallback, useRef } from 'react';

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
}

export function NotificationPanel({ notifications, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const unread = notifications.length;

  const severityColor = (s: AppNotification['severity']) =>
    s === 'error' ? '#dc2626' : s === 'warn' ? '#d97706' : '#7c3aed';

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        style={{
          background: unread > 0 ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          color: '#e8e8f0',
          padding: '6px 10px',
          cursor: 'pointer',
          fontSize: 14,
          position: 'relative',
        }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#dc2626', color: '#fff',
            borderRadius: '50%', width: 16, height: 16,
            fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 8,
          width: 340, maxHeight: 400, overflowY: 'auto',
          background: '#1a1a24', border: '1px solid #2d2d3d',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 1000,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid #2d2d3d',
          }}>
            <span style={{ color: '#e8e8f0', fontWeight: 600 }}>Notifications</span>
            <button onClick={onClear} style={{
              background: 'none', border: 'none', color: '#8888aa', cursor: 'pointer', fontSize: 12,
            }}>Clear all</button>
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#8888aa', fontSize: 13 }}>
              No notifications
            </div>
          ) : (
            [...notifications].reverse().map((n) => (
              <div key={n.id} style={{
                padding: '10px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 16 }}>{n.icon ?? (n.severity === 'error' ? '❌' : n.severity === 'warn' ? '⚠️' : 'ℹ️')}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#e8e8f0', fontSize: 13 }}>{n.message}</div>
                  <div style={{ color: '#8888aa', fontSize: 11, marginTop: 2 }}>
                    {new Date(n.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <div style={{ width: 4, borderRadius: 2, background: severityColor(n.severity), alignSelf: 'stretch' }} />
              </div>
            ))
          )}
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
