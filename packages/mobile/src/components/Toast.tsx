import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

// ── Types ───────────────────────────────────────────────────────────────────
type ToastVariant = 'success' | 'error' | 'info';

interface ToastConfig {
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  show: (config: ToastConfig) => void;
}

// ── Constants ───────────────────────────────────────────────────────────────
const DEFAULT_DURATION = 2500;

const VARIANT_COLORS: Record<ToastVariant, string> = {
  success: '#22c55e',
  error: '#ef4444',
  info: '#7c3aed',
};

const VARIANT_ICONS: Record<ToastVariant, string> = {
  success: '\u2713', // checkmark
  error: '!',
  info: 'i',
};

// ── Context ─────────────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

// ── Provider ────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [variant, setVariant] = useState<ToastVariant>('info');

  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (config: ToastConfig) => {
      const v = config.variant ?? 'info';
      const dur = config.duration ?? DEFAULT_DURATION;

      // Clear any pending dismiss
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }

      setMessage(config.message);
      setVariant(v);
      setVisible(true);

      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      // Reset and animate in (slide up + fade in)
      translateY.setValue(80);
      opacity.setValue(0);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss
      hideTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 80,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setVisible(false);
        });
      }, dur);
    },
    [translateY, opacity],
  );

  const accentColor = VARIANT_COLORS[variant];
  const icon = VARIANT_ICONS[variant];

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {visible && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.container,
            {
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.toast}>
            <View style={[styles.iconCircle, { backgroundColor: accentColor }]}>
              <Text style={styles.iconText}>{icon}</Text>
            </View>
            <Text style={styles.message} numberOfLines={2}>
              {message}
            </Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(23, 23, 23, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    color: '#f4f4f5',
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
});
