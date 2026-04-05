import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  RefreshControl,
  Linking,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
} from 'react-native-vision-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { DiscoveryService, type DiscoveredDevice } from '../services/DiscoveryService';
import { connectionHistory, type ConnectionRecord } from '../utils/ConnectionHistory';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [manualIP, setManualIP] = useState('');
  const [manualPort, setManualPort] = useState('8765');
  const [showManual, setShowManual] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [remoteURL, setRemoteURL] = useState('');
  const [mode, setMode] = useState<'list' | 'qr'>('list');
  const [cameraPermission, setCameraPermission] = useState<string>('not-determined');
  const [recentConnections, setRecentConnections] = useState<ConnectionRecord[]>([]);
  const qrHandled = useRef(false);

  const discovery = React.useRef(new DiscoveryService()).current;
  const backCamera = useCameraDevice('back');

  useEffect(() => {
    discovery.onDevicesChanged((found) => setDevices([...found]));
    startScan();
    connectionHistory.load().then(setRecentConnections).catch(() => {});
    return () => { discovery.destroy(); };
  }, []);

  const startScan = useCallback(() => {
    setScanning(true);
    discovery.startScan();
    setTimeout(() => setScanning(false), 10000);
  }, [discovery]);

  const connectToDevice = (ip: string, port: number) => {
    navigation.navigate('Stream', { ip, port });
  };

  const connectRemote = () => {
    let url = remoteURL.trim();
    if (!url) { Alert.alert('Error', 'Please enter a tunnel URL'); return; }
    // Strip protocol if present for parsing
    let host = url.replace(/^wss?:\/\//, '').replace(/\/+$/, '');
    if (!host) { Alert.alert('Error', 'Please enter a valid tunnel URL'); return; }
    // Extract hostname and optional port
    const parts = host.split(':');
    const hostname = parts[0];
    const port = parts[1] ? parseInt(parts[1], 10) : 443;
    // Build full WebSocket URL
    const wsUrl = url.startsWith('ws://') || url.startsWith('wss://') ? url : `wss://${host}`;
    navigation.navigate('Stream', { ip: hostname, port, wsUrl });
  };

  const connectManual = () => {
    const ip = manualIP.trim();
    const port = parseInt(manualPort.trim(), 10);
    if (!ip) { Alert.alert('Error', 'Please enter an IP address'); return; }
    if (isNaN(port)) { Alert.alert('Error', 'Please enter a valid port'); return; }
    connectToDevice(ip, port);
  };

  const openQRScanner = async () => {
    const perm = await Camera.requestCameraPermission();
    setCameraPermission(perm);
    if (perm !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to scan QR codes.');
      return;
    }
    qrHandled.current = false;
    setMode('qr');
  };

  // VisionCamera v4 built-in code scanner
  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (qrHandled.current || codes.length === 0) return;
      const value = codes[0].value;
      if (!value) return;
      try {
        const data = JSON.parse(value);
        if (data.ip && data.port) {
          qrHandled.current = true;
          setMode('list');
          connectToDevice(data.ip, Number(data.port));
        }
      } catch {
        // not a PhoneBridge QR, ignore
      }
    },
  });

  // ── QR Scanner View ────────────────────────────────────────────────────────
  if (mode === 'qr') {
    const { width, height } = Dimensions.get('window');
    const boxSize = Math.min(width, height) * 0.6;

    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {backCamera ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={backCamera}
            isActive={mode === 'qr'}
            codeScanner={codeScanner}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff' }}>No back camera found</Text>
          </View>
        )}

        {/* Overlay */}
        <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
          {/* Dimmed corners */}
          <View style={{ width: boxSize, height: boxSize, position: 'relative' }}>
            {/* Corner brackets */}
            {[
              { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
              { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
              { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
              { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
            ].map((s, i) => (
              <View key={i} style={[{
                position: 'absolute', width: 28, height: 28,
                borderColor: '#a78bfa', borderRadius: 3,
              }, s as any]} />
            ))}
            <View style={{ flex: 1, borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)', margin: 0 }} />
          </View>
          <Text style={{ color: '#fff', marginTop: 24, fontSize: 14, fontWeight: '500', textShadowColor: '#000', textShadowRadius: 4 }}>
            Point at the QR code on your PC
          </Text>
          <TouchableOpacity
            onPress={() => setMode('list')}
            style={{ marginTop: 20, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, borderWidth: 1, borderColor: '#3f3f46' }}>
            <Text style={{ color: '#e4e4e7', fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main List View ─────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={scanning}
          onRefresh={startScan}
          tintColor="#a78bfa"
          colors={['#7c3aed']}
        />
      }
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.iconBg}>
          <Text style={{ fontSize: 32 }}>📱</Text>
        </View>
        <Text style={styles.heroTitle}>PhoneBridge</Text>
        <Text style={styles.heroSubtitle}>
          Turn your phone into a wireless camera, mic, speaker, and sensor hub for your PC.
        </Text>
      </View>

      {/* Device Discovery */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Nearby PCs</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={openQRScanner} style={styles.qrBtn}>
              <Text style={styles.qrBtnText}>📷 Scan QR</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={startScan} style={styles.scanBtn}>
              {scanning ? (
                <ActivityIndicator size="small" color="#a78bfa" />
              ) : (
                <Text style={styles.scanBtnText}>Scan</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {devices.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 24, marginBottom: 8 }}>🔍</Text>
            <Text style={styles.emptyText}>
              {scanning
                ? 'Searching for PhoneBridge desktops on your network…'
                : 'No PCs found. Try scanning, use QR code, or enter IP manually.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={devices}
            keyExtractor={(item) => item.name}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.deviceItem}
                onPress={() => connectToDevice(item.ip, item.port)}
                activeOpacity={0.7}
              >
                <View style={styles.deviceIconBg}>
                  <Text style={{ fontSize: 18 }}>🖥</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{item.name}</Text>
                  <Text style={styles.deviceIP}>{item.ip}:{item.port}</Text>
                </View>
                <Text style={styles.connectArrow}>→</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* Manual Connection */}
      <View style={styles.section}>
        <TouchableOpacity onPress={() => setShowManual(!showManual)} style={styles.manualToggle}>
          <Text style={styles.manualToggleText}>
            {showManual ? '▲ Hide manual entry' : '▼ Enter IP manually'}
          </Text>
        </TouchableOpacity>

        {showManual && (
          <View style={styles.manualForm}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="PC IP Address (e.g. 192.168.1.5)"
              placeholderTextColor="#52525b"
              value={manualIP}
              onChangeText={setManualIP}
              keyboardType="decimal-pad"
              autoCapitalize="none"
              returnKeyType="done"
            />
            <TextInput
              style={[styles.input, { width: 80 }]}
              placeholder="Port"
              placeholderTextColor="#52525b"
              value={manualPort}
              onChangeText={setManualPort}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={styles.connectBtn} onPress={connectManual}>
              <Text style={styles.connectBtnText}>Go</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Remote Connect (Internet) */}
      <View style={styles.section}>
        <TouchableOpacity onPress={() => setShowRemote(!showRemote)} style={styles.manualToggle}>
          <Text style={styles.manualToggleText}>
            {showRemote ? '▲ Hide remote connect' : '🌐 Connect over Internet'}
          </Text>
        </TouchableOpacity>

        {showRemote && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ color: '#71717a', fontSize: 11, marginBottom: 8, lineHeight: 16 }}>
              Enter the tunnel URL shown on your PC's desktop app to connect over the internet.
            </Text>
            <View style={styles.manualForm}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Tunnel URL (e.g. abc123.trycloudflare.com)"
                placeholderTextColor="#52525b"
                value={remoteURL}
                onChangeText={setRemoteURL}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={connectRemote}
              />
              <TouchableOpacity style={[styles.connectBtn, { backgroundColor: '#2563eb' }]} onPress={connectRemote}>
                <Text style={styles.connectBtnText}>Go</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Recent Connections */}
      {recentConnections.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent</Text>
          {recentConnections.slice(0, 5).map((rec) => (
            <TouchableOpacity
              key={`${rec.ip}:${rec.port}`}
              style={styles.deviceItem}
              onPress={() => connectToDevice(rec.ip, rec.port)}
              activeOpacity={0.7}
            >
              <View style={styles.deviceIconBg}>
                <Text style={{ fontSize: 16 }}>🕐</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName}>{rec.name || rec.ip}</Text>
                <Text style={styles.deviceIP}>
                  {rec.ip}:{rec.port} · {new Date(rec.lastConnected).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.connectArrow}>→</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* NFC entry point */}
      <TouchableOpacity
        style={styles.nfcCard}
        onPress={() => navigation.navigate('NFC')}
        activeOpacity={0.75}
      >
        <View style={styles.nfcCardIcon}><Text style={{ fontSize: 22 }}>📡</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nfcCardTitle}>NFC Tags</Text>
          <Text style={styles.nfcCardSubtitle}>Read, write, save & replay NFC tags</Text>
        </View>
        <Text style={{ color: '#a78bfa', fontSize: 18 }}>→</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Make sure your phone and PC are on the same WiFi network</Text>
        <Text style={{ color: '#52525b', fontSize: 10, marginTop: 12, fontWeight: '500' }}>
          Designed & Developed by
        </Text>
        <Text
          style={{ color: '#a78bfa', fontSize: 11, fontWeight: '600', marginTop: 2 }}
          onPress={() => Linking.openURL('https://www.trexinfotech.com')}
        >
          Trex Infotech
        </Text>
        <Text style={{ color: '#3f3f46', fontSize: 9, marginTop: 2 }}>
          &copy; {new Date().getFullYear()} All rights reserved
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f13',
    padding: 20,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  iconBg: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 26, fontWeight: '700', color: '#a78bfa', letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 13, color: '#71717a', textAlign: 'center', marginTop: 6, lineHeight: 20,
    maxWidth: 300,
  },
  section: { marginTop: 18 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#e4e4e7' },
  qrBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
  },
  qrBtnText: { color: '#a78bfa', fontSize: 12, fontWeight: '600' },
  scanBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14,
    backgroundColor: '#27272a',
  },
  scanBtnText: { color: '#a1a1aa', fontSize: 12, fontWeight: '600' },
  emptyState: {
    padding: 24, alignItems: 'center', backgroundColor: '#18181b',
    borderRadius: 12, borderWidth: 1, borderColor: '#27272a',
  },
  emptyText: { color: '#52525b', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  deviceItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, backgroundColor: '#18181b',
    borderRadius: 12, borderWidth: 1, borderColor: '#27272a', marginBottom: 8,
  },
  deviceIconBg: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center',
  },
  deviceName: { fontSize: 14, fontWeight: '600', color: '#e4e4e7' },
  deviceIP: { fontSize: 12, color: '#71717a', fontFamily: 'monospace', marginTop: 2 },
  connectArrow: { fontSize: 20, color: '#a78bfa' },
  manualToggle: { alignItems: 'center', paddingVertical: 10 },
  manualToggleText: { color: '#52525b', fontSize: 12 },
  manualForm: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    backgroundColor: '#18181b', borderRadius: 8,
    borderWidth: 1, borderColor: '#27272a',
    padding: 12, color: '#e4e4e7', fontSize: 13,
  },
  connectBtn: {
    backgroundColor: '#7c3aed', paddingHorizontal: 18,
    paddingVertical: 12, borderRadius: 8,
  },
  connectBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  nfcCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16,
    padding: 14, backgroundColor: '#18181b',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)',
  },
  nfcCardIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: 'rgba(124,58,237,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  nfcCardTitle: { fontSize: 14, fontWeight: '700', color: '#e4e4e7' },
  nfcCardSubtitle: { fontSize: 12, color: '#71717a', marginTop: 2 },
  footer: { marginTop: 'auto', paddingTop: 24, alignItems: 'center' },
  footerText: { color: '#3f3f46', fontSize: 11, textAlign: 'center' },
});
