import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { Camera } from 'react-native-vision-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

interface PermissionStep {
  key: string;
  title: string;
  description: string;
  icon: string;
  request: () => Promise<boolean>;
}

export default function OnboardingScreen({ navigation }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const fadeAnim = useState(new Animated.Value(1))[0];

  const steps: PermissionStep[] = [
    {
      key: 'camera',
      title: 'Camera Access',
      description:
        'PhoneBridge uses your camera to stream video to your PC as a wireless webcam. All processing stays on your device.',
      icon: '📷',
      request: async () => {
        const perm = await Camera.requestCameraPermission();
        return perm === 'granted';
      },
    },
    {
      key: 'microphone',
      title: 'Microphone Access',
      description:
        'Your phone microphone becomes a wireless mic for your PC — use it in Zoom, Discord, OBS, or any app.',
      icon: '🎙',
      request: async () => {
        const perm = await Camera.requestMicrophonePermission();
        return perm === 'granted';
      },
    },
    {
      key: 'location',
      title: 'Location (GPS Sensor)',
      description:
        'GPS data is streamed as a sensor to your PC. Useful for mapping, fitness tracking, and development. Data never leaves your network.',
      icon: '📍',
      request: async () => {
        if (Platform.OS === 'android') {
          const { PermissionsAndroid } = require('react-native');
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Permission',
              message: 'PhoneBridge needs location access for GPS sensor data.',
              buttonPositive: 'Allow',
            },
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
        return true;
      },
    },
    {
      key: 'activity',
      title: 'Activity Recognition',
      description:
        'Used for the pedometer (step counter) sensor. Counts your steps and streams the data to your PC.',
      icon: '🚶',
      request: async () => {
        if (Platform.OS === 'android') {
          const { PermissionsAndroid } = require('react-native');
          try {
            const granted = await PermissionsAndroid.request(
              'android.permission.ACTIVITY_RECOGNITION',
              {
                title: 'Activity Recognition',
                message: 'PhoneBridge needs this for the pedometer sensor.',
                buttonPositive: 'Allow',
              },
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
          } catch {
            return false;
          }
        }
        return true;
      },
    },
  ];

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  const animateTransition = useCallback(
    (next: () => void) => {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
      setTimeout(next, 150);
    },
    [fadeAnim],
  );

  const handleAllow = async () => {
    const granted = await step.request();
    setResults((prev) => ({ ...prev, [step.key]: granted }));

    if (isLast) {
      finishOnboarding();
    } else {
      animateTransition(() => setCurrentStep((s) => s + 1));
    }
  };

  const handleSkip = () => {
    setResults((prev) => ({ ...prev, [step.key]: false }));
    if (isLast) {
      finishOnboarding();
    } else {
      animateTransition(() => setCurrentStep((s) => s + 1));
    }
  };

  const finishOnboarding = async () => {
    try {
      const AsyncStorage =
        require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('@phonebridge/onboarded', 'true');
    } catch {}
    navigation.replace('Home');
  };

  const grantedCount = Object.values(results).filter(Boolean).length;

  return (
    <View style={styles.container}>
      {/* Progress */}
      <View style={styles.progressContainer}>
        {steps.map((s, i) => (
          <View
            key={s.key}
            style={[
              styles.progressDot,
              i === currentStep && styles.progressDotActive,
              i < currentStep && styles.progressDotDone,
            ]}
          />
        ))}
      </View>

      <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{step.icon}</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{step.title}</Text>

        {/* Description */}
        <Text style={styles.description}>{step.description}</Text>

        {/* Status for already-handled permissions */}
        {results[step.key] !== undefined && (
          <View
            style={[
              styles.statusBadge,
              results[step.key] ? styles.statusGranted : styles.statusDenied,
            ]}
          >
            <Text style={styles.statusText}>
              {results[step.key] ? 'Granted' : 'Denied'}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.allowBtn} onPress={handleAllow}>
          <Text style={styles.allowBtnText}>
            {isLast ? 'Finish Setup' : 'Allow'}
          </Text>
        </TouchableOpacity>

        {!isLast && (
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Step {currentStep + 1} of {steps.length}
          {grantedCount > 0 ? ` · ${grantedCount} granted` : ''}
        </Text>
        <Text style={styles.footerHint}>
          You can change these later in Settings
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f13',
    padding: 24,
    justifyContent: 'center',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 40,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#27272a',
  },
  progressDotActive: {
    backgroundColor: '#7c3aed',
    width: 24,
  },
  progressDotDone: {
    backgroundColor: '#4ade80',
  },
  card: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 42,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#e4e4e7',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#71717a',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  statusGranted: {
    backgroundColor: 'rgba(74,222,128,0.15)',
  },
  statusDenied: {
    backgroundColor: 'rgba(248,113,113,0.15)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a1a1aa',
  },
  buttonContainer: {
    gap: 12,
    marginTop: 32,
  },
  allowBtn: {
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  allowBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  skipBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipBtnText: {
    color: '#52525b',
    fontSize: 14,
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
  },
  footerText: {
    color: '#3f3f46',
    fontSize: 12,
  },
  footerHint: {
    color: '#27272a',
    fontSize: 11,
    marginTop: 4,
  },
});
