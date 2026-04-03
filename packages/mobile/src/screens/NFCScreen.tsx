import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Alert, ActivityIndicator, Animated, Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import type { NFCTag, NFCNdefRecord } from '@phonebridge/shared';
import { nfcManager } from '../nfc/NFCManager';
import { nfcStorage } from '../nfc/NFCStorage';
import { hceService } from '../nfc/HCEService';

type Props = NativeStackScreenProps<RootStackParamList, 'NFC'>;
type Tab = 'scan' | 'saved' | 'write' | 'replay';

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#0f0f13', surface: '#18181b', surface2: '#27272a',
  border: '#3f3f46', accent: '#7c3aed', accentL: '#a78bfa',
  accentBg: 'rgba(124,58,237,0.15)', green: '#22c55e', greenBg: 'rgba(34,197,94,0.1)',
  red: '#ef4444', redBg: 'rgba(239,68,68,0.1)', amber: '#f59e0b',
  t1: '#e4e4e7', t2: '#a1a1aa', t3: '#71717a', t4: '#52525b',
};

// ── Pulse animation ──────────────────────────────────────────────────────────
function PulseIcon({ active, icon }: { active: boolean; icon: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!active) { scale.setValue(1); opacity.setValue(0.3); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.3, duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.0, duration: 800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.0, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.3, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active]);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 120, height: 120 }}>
      <Animated.View style={{
        position: 'absolute', width: 120, height: 120, borderRadius: 60,
        backgroundColor: C.accentBg, transform: [{ scale }], opacity,
      }} />
      <Text style={{ fontSize: 56 }}>{icon}</Text>
    </View>
  );
}

// ── Tag card ─────────────────────────────────────────────────────────────────
function TagCard({ tag, onPress, onDelete, showDelete = false }: {
  tag: NFCTag; onPress?: () => void; onDelete?: () => void; showDelete?: boolean;
}) {
  const typeColor: Record<string, string> = {
    Ndef: C.green, MifareClassic: C.amber, IsoDep: C.accentL,
    MifareUltralight: '#06b6d4', NfcA: C.t3,
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.tagCard}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tagName}>{tag.name}</Text>
          <Text style={styles.tagUID}>{tag.uid}</Text>
          {tag.ndefRecords && tag.ndefRecords.length > 0 && (
            <Text style={styles.tagPayload} numberOfLines={1}>
              {tag.ndefRecords[0].uri ?? tag.ndefRecords[0].payload}
            </Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={[styles.typeBadge, { backgroundColor: (typeColor[tag.tagType] ?? C.t4) + '22', borderColor: (typeColor[tag.tagType] ?? C.t4) + '55' }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor[tag.tagType] ?? C.t4 }]}>{tag.tagType}</Text>
          </View>
          {tag.canEmulate && (
            <Text style={{ fontSize: 10, color: C.accentL }}>HCE ✓</Text>
          )}
        </View>
      </View>
      <Text style={styles.tagDate}>{new Date(tag.savedAt).toLocaleString()}</Text>
      {showDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ── SCAN TAB ─────────────────────────────────────────────────────────────────
function ScanTab({ onTagScanned }: { onTagScanned: (tag: NFCTag) => void }) {
  const [scanning, setScanning] = useState(false);
  const [lastTag, setLastTag] = useState<NFCTag | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [nfcEnabled, setNfcEnabled] = useState(true);

  const startScan = async () => {
    const enabled = await nfcManager.isEnabled();
    if (!enabled) {
      setNfcEnabled(false);
      Alert.alert('NFC Disabled', 'Please enable NFC in your phone settings and try again.');
      return;
    }
    setNfcEnabled(true);
    setScanning(true);
    setLastTag(null);

    try {
      const tag = await nfcManager.readTag();
      if (tag) {
        setLastTag(tag);
        setSaveName(tag.name);
        onTagScanned(tag);
      }
    } catch {
      // cancelled or error — ignore
    } finally {
      setScanning(false);
    }
  };

  const cancelScan = async () => {
    await nfcManager.cancel();
    setScanning(false);
  };

  const saveTag = async () => {
    if (!lastTag) return;
    setSaving(true);
    const tagToSave = { ...lastTag, name: saveName.trim() || lastTag.name };
    await nfcStorage.addTag(tagToSave);
    setSaving(false);
    setLastTag(null);
    setSaveName('');
    Alert.alert('Saved', `"${tagToSave.name}" saved to your collection.`);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabContent}>
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        <PulseIcon active={scanning} icon="📡" />
        <Text style={styles.scanStatus}>
          {scanning ? 'Hold tag near the back of your phone…' : 'Ready to scan NFC tags'}
        </Text>

        {!scanning ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={startScan}>
            <Text style={styles.primaryBtnText}>Tap to Scan</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.cancelBtn} onPress={cancelScan}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {lastTag && (
        <View style={styles.resultCard}>
          <Text style={styles.sectionTitle}>Tag Detected</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>UID</Text>
            <Text style={styles.infoValue}>{lastTag.uid}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type</Text>
            <Text style={styles.infoValue}>{lastTag.tagType}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tech</Text>
            <Text style={styles.infoValue} numberOfLines={2}>{lastTag.technologies.map((t) => t.split('.').pop()).join(', ')}</Text>
          </View>
          {lastTag.ndefRecords?.map((r, i) => (
            <View key={i} style={styles.infoRow}>
              <Text style={styles.infoLabel}>NDEF #{i + 1}</Text>
              <Text style={styles.infoValue} numberOfLines={2}>{r.uri ?? r.payload}</Text>
            </View>
          ))}
          {lastTag.mifareData && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>MIFARE</Text>
              <Text style={styles.infoValue}>{lastTag.mifareData.sectorCount} sectors</Text>
            </View>
          )}

          <View style={{ marginTop: 16, gap: 8 }}>
            <TextInput
              style={styles.nameInput}
              value={saveName}
              onChangeText={setSaveName}
              placeholder="Tag name…"
              placeholderTextColor={C.t4}
            />
            <TouchableOpacity style={[styles.primaryBtn, saving && { opacity: 0.5 }]} onPress={saveTag} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save Tag</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ── SAVED TAB ────────────────────────────────────────────────────────────────
function SavedTab({ tags, onTagsChange }: { tags: NFCTag[]; onTagsChange: (tags: NFCTag[]) => void }) {
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const filtered = search.trim()
    ? tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.uid.toLowerCase().includes(search.toLowerCase()))
    : tags;

  const deleteTag = async (id: string) => {
    Alert.alert('Delete Tag', 'Remove this tag from your collection?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { onTagsChange(await nfcStorage.deleteTag(id)); },
      },
    ]);
  };

  const saveEdit = async (id: string) => {
    onTagsChange(await nfcStorage.updateTag(id, { name: editName }));
    setEditId(null);
  };

  if (tags.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🏷</Text>
        <Text style={styles.emptyText}>No saved tags yet.</Text>
        <Text style={styles.emptySubtext}>Scan your first NFC tag to start your collection.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or UID…"
          placeholderTextColor={C.t4}
        />
      </View>
      <ScrollView style={{ flex: 1 }}>
        {filtered.map((tag) => (
          <View key={tag.id}>
            {editId === tag.id ? (
              <View style={[styles.tagCard, { gap: 8 }]}>
                <TextInput
                  style={styles.nameInput}
                  value={editName}
                  onChangeText={setEditName}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => saveEdit(tag.id)}>
                    <Text style={styles.primaryBtnText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setEditId(null)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TagCard
                tag={tag}
                showDelete
                onPress={() => { setEditId(tag.id); setEditName(tag.name); }}
                onDelete={() => deleteTag(tag.id)}
              />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ── WRITE TAB ────────────────────────────────────────────────────────────────
function WriteTab() {
  const [mode, setMode] = useState<'text' | 'uri'>('text');
  const [textValue, setTextValue] = useState('');
  const [uriValue, setUriValue] = useState('https://');
  const [writing, setWriting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const write = async () => {
    const value = mode === 'text' ? textValue.trim() : uriValue.trim();
    if (!value) { Alert.alert('Empty', 'Please enter a value to write.'); return; }

    setWriting(true);
    setStatus(null);

    const record: NFCNdefRecord =
      mode === 'text'
        ? { tnf: 1, type: 'T', payload: value, languageCode: 'en' }
        : { tnf: 1, type: 'U', payload: value, uri: value };

    const result = await nfcManager.writeNdef([record]);
    setWriting(false);
    setStatus({ ok: result.success, msg: result.success ? 'Written successfully!' : result.error ?? 'Write failed' });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabContent}>
      <Text style={styles.sectionTitle}>Write NDEF</Text>

      {/* Mode selector */}
      <View style={styles.segmented}>
        {(['text', 'uri'] as const).map((m) => (
          <TouchableOpacity
            key={m} onPress={() => setMode(m)}
            style={[styles.segment, mode === m && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
              {m === 'text' ? '📝 Text' : '🔗 URI'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'text' ? (
        <TextInput
          style={[styles.nameInput, { minHeight: 80, textAlignVertical: 'top' }]}
          multiline
          value={textValue}
          onChangeText={setTextValue}
          placeholder="Text to write to tag…"
          placeholderTextColor={C.t4}
        />
      ) : (
        <TextInput
          style={styles.nameInput}
          value={uriValue}
          onChangeText={setUriValue}
          placeholder="https://example.com"
          placeholderTextColor={C.t4}
          keyboardType="url"
          autoCapitalize="none"
        />
      )}

      <TouchableOpacity style={[styles.primaryBtn, writing && { opacity: 0.5 }]} onPress={write} disabled={writing}>
        {writing
          ? <><ActivityIndicator color="#fff" style={{ marginRight: 8 }} /><Text style={styles.primaryBtnText}>Hold tag near phone…</Text></>
          : <Text style={styles.primaryBtnText}>Write to Tag</Text>
        }
      </TouchableOpacity>

      {status && (
        <View style={[styles.statusBanner, { backgroundColor: status.ok ? C.greenBg : C.redBg, borderColor: status.ok ? C.green : C.red }]}>
          <Text style={{ color: status.ok ? C.green : C.red, fontWeight: '600' }}>
            {status.ok ? '✓ ' : '✗ '}{status.msg}
          </Text>
        </View>
      )}

      <View style={styles.warningBanner}>
        <Text style={{ color: C.amber, fontSize: 12, lineHeight: 18 }}>
          ⚠ The tag must be writable and NDEF-compatible. MIFARE Classic tags require formatting first.
        </Text>
      </View>
    </ScrollView>
  );
}

// ── REPLAY TAB ───────────────────────────────────────────────────────────────
function ReplayTab({ tags }: { tags: NFCTag[] }) {
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const emulableTags = tags.filter((t) => t.canEmulate);

  const startReplay = async (tag: NFCTag) => {
    if (activeTagId) await hceService.stopEmulation();
    const ok = await hceService.startEmulation(tag);
    if (ok) setActiveTagId(tag.id);
    else Alert.alert('Replay Failed', 'Could not start HCE emulation. Make sure NFC is enabled and this device supports HCE.');
  };

  const stopReplay = async () => {
    await hceService.stopEmulation();
    setActiveTagId(null);
  };

  if (!hceService.isAvailable()) {
    return (
      <View style={styles.emptyState}>
        <Text style={{ fontSize: 36, marginBottom: 12 }}>📵</Text>
        <Text style={styles.emptyText}>HCE Not Available</Text>
        <Text style={styles.emptySubtext}>Host Card Emulation requires Android with NFC HCE support.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabContent}>
      {activeTagId && (
        <View style={[styles.statusBanner, { backgroundColor: C.greenBg, borderColor: C.green, marginBottom: 16 }]}>
          <PulseIcon active icon="📡" />
          <Text style={{ color: C.green, fontWeight: '700', marginTop: 8 }}>
            Emulating: {tags.find((t) => t.id === activeTagId)?.name}
          </Text>
          <Text style={{ color: C.t3, fontSize: 12, marginTop: 4 }}>
            Hold your phone near an NFC reader to transmit
          </Text>
          <TouchableOpacity style={[styles.cancelBtn, { marginTop: 12 }]} onPress={stopReplay}>
            <Text style={styles.cancelBtnText}>Stop Replay</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.warningBanner, { marginBottom: 16 }]}>
        <Text style={{ color: C.amber, fontSize: 12, lineHeight: 18 }}>
          ⚠ HCE replay only works with NDEF / ISO-DEP readers. MIFARE Classic UID cloning is NOT possible.
        </Text>
      </View>

      {emulableTags.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No replayable tags</Text>
          <Text style={styles.emptySubtext}>Save NDEF or ISO-DEP tags from the Scan tab.</Text>
        </View>
      ) : (
        emulableTags.map((tag) => (
          <View key={tag.id} style={styles.tagCard}>
            <TagCard tag={tag} />
            <TouchableOpacity
              style={[styles.primaryBtn, activeTagId === tag.id && { backgroundColor: C.red }]}
              onPress={() => activeTagId === tag.id ? stopReplay() : startReplay(tag)}
            >
              <Text style={styles.primaryBtnText}>
                {activeTagId === tag.id ? 'Stop Replay' : 'Start Replay'}
              </Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function NFCScreen({ navigation }: Props) {
  const [tab, setTab] = useState<Tab>('scan');
  const [tags, setTags] = useState<NFCTag[]>([]);
  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const ok = await nfcManager.initialize();
      setNfcSupported(ok);
      if (ok) {
        setTags(await nfcStorage.loadTags());
      }
    })();
    return () => { nfcManager.destroy(); hceService.stopEmulation(); };
  }, []);

  const onTagScanned = useCallback((tag: NFCTag) => {
    // Tag is available in Scan tab for saving; we don't auto-add
  }, []);

  if (nfcSupported === null) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={C.accentL} size="large" />
    </View>;
  }

  if (!nfcSupported) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📵</Text>
        <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>NFC Not Supported</Text>
        <Text style={[styles.emptySubtext, { textAlign: 'center', marginTop: 8 }]}>
          This device does not have NFC hardware or NFC is disabled in Settings.
        </Text>
      </View>
    );
  }

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: 'scan',   icon: '📡', label: 'Scan'   },
    { key: 'saved',  icon: '🏷',  label: 'Saved'  },
    { key: 'write',  icon: '✍',  label: 'Write'  },
    { key: 'replay', icon: '▶',  label: 'Replay' },
  ];

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={{ fontSize: 16 }}>{t.icon}</Text>
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {tab === 'scan'   && <ScanTab  onTagScanned={onTagScanned} />}
        {tab === 'saved'  && <SavedTab tags={tags} onTagsChange={setTags} />}
        {tab === 'write'  && <WriteTab />}
        {tab === 'replay' && <ReplayTab tags={tags} />}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: C.bg },
  tabBar:           { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tabItem:          { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabItemActive:    { borderBottomWidth: 2, borderBottomColor: C.accentL },
  tabLabel:         { fontSize: 11, color: C.t3, fontWeight: '500' },
  tabLabelActive:   { color: C.accentL, fontWeight: '700' },
  tabContent:       { padding: 16, gap: 12 },
  scanStatus:       { color: C.t2, fontSize: 13, textAlign: 'center', marginVertical: 16, lineHeight: 20 },
  primaryBtn:       { backgroundColor: C.accent, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 24, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  primaryBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn:        { backgroundColor: C.surface2, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelBtnText:    { color: C.t2, fontWeight: '600', fontSize: 14 },
  deleteBtn:        { alignSelf: 'flex-end', marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: C.redBg, borderWidth: 1, borderColor: C.red + '40' },
  deleteBtnText:    { color: C.red, fontSize: 12, fontWeight: '600' },
  resultCard:       { backgroundColor: C.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  tagCard:          { backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  tagName:          { fontSize: 15, fontWeight: '700', color: C.t1, marginBottom: 2 },
  tagUID:           { fontSize: 11, color: C.t3, fontFamily: 'monospace' },
  tagPayload:       { fontSize: 12, color: C.accentL, marginTop: 4 },
  tagDate:          { fontSize: 10, color: C.t4, marginTop: 6 },
  typeBadge:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  typeBadgeText:    { fontSize: 10, fontWeight: '700' },
  infoRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  infoLabel:        { fontSize: 12, color: C.t3, fontWeight: '600' },
  infoValue:        { fontSize: 12, color: C.t1, flex: 1, textAlign: 'right', marginLeft: 12 },
  sectionTitle:     { fontSize: 14, fontWeight: '700', color: C.t1, marginBottom: 8 },
  nameInput:        { backgroundColor: C.surface, borderRadius: 8, padding: 12, color: C.t1, fontSize: 14, borderWidth: 1, borderColor: C.border },
  searchRow:        { padding: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  searchInput:      { backgroundColor: C.surface2, borderRadius: 8, padding: 10, color: C.t1, fontSize: 14 },
  emptyState:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText:        { fontSize: 16, color: C.t2, fontWeight: '600' },
  emptySubtext:     { fontSize: 13, color: C.t4, marginTop: 8, textAlign: 'center', lineHeight: 19 },
  segmented:        { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 8, padding: 3, marginBottom: 12 },
  segment:          { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  segmentActive:    { backgroundColor: C.accent },
  segmentText:      { color: C.t3, fontWeight: '600', fontSize: 13 },
  segmentTextActive:{ color: '#fff', fontWeight: '700', fontSize: 13 },
  statusBanner:     { borderRadius: 10, padding: 14, borderWidth: 1, alignItems: 'center' },
  warningBanner:    { backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
});
