import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import StreamScreen from './screens/StreamScreen';
import SettingsScreen from './screens/SettingsScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import NFCScreen from './screens/NFCScreen';

export type RootStackParamList = {
  Onboarding: undefined;
  Home: undefined;
  Stream: { ip: string; port: number; sessionId?: string; wsUrl?: string };
  Settings: undefined;
  NFC: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const onboarded = await AsyncStorage.getItem('@phonebridge/onboarded');
        setInitialRoute(onboarded === 'true' ? 'Home' : 'Onboarding');
      } catch {
        setInitialRoute('Onboarding');
      }
    })();
  }, []);

  if (!initialRoute) return null; // loading

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: { backgroundColor: '#0f0f13' },
          headerTintColor: '#e4e4e7',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#0f0f13' },
        }}
      >
        <Stack.Screen
          name="Onboarding"
          component={OnboardingScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'PhoneBridge' }}
        />
        <Stack.Screen
          name="Stream"
          component={StreamScreen}
          options={{ title: 'Streaming', headerBackVisible: false }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
        <Stack.Screen
          name="NFC"
          component={NFCScreen}
          options={{ title: 'NFC Tags' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
