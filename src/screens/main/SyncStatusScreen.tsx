import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { Q } from '@nozbe/watermelondb';
import { supabase } from '@/src/lib/supabase';
import { database } from '@/src/db/database';
import { getDeviceId } from '@/src/utils/DeviceID';
import { formatLastSync, syncEventTickets } from '@/src/services/TicketSync';
import { useNearbyMesh } from '@/src/hooks/useNearbyMesh';
import type { Ticket, ScanLog, SyncedEvent } from '@/src/db/models';
import { styles } from '@/src/styles/main/SyncStatusScreenStyles';
import { nearbyStop } from '@/src/native/NearbyConnections';

// ─── Types ────────────────────────────────────────────────────
interface LocalStats {
  ticketsDownloaded: number;
  pendingUploads: number;
  lastSyncedAt: number | null;
}

type SyncPhase = 'idle' | 'syncing' | 'done' | 'error';

// ─── Upload pending scan logs to Supabase ─────────────────────
async function uploadPendingScans(
  eventId: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  const pending = await database
    .get<ScanLog>('scan_logs')
    .query(
      Q.where('event_id', eventId),
      Q.where('uploaded', false),
    )
    .fetch();

  if (pending.length === 0) { onProgress(100); return; }

  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) throw new Error('Not authenticated. Cannot sync scan records.');

  const CHUNK = 50;
  let uploaded = 0;

  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);

    const rows = chunk.map(log => ({
      ticket_id: log.ticket_id,
      event_id: log.event_id,
      scanned_by: userId,
      gate_number: log.gate_number,
      device_name: log.device_name,
      scanned_at: new Date(log.scanned_at).toISOString(),
      is_duplicate: log.is_duplicate ?? false,
      synced: true,
    }));

    const { error } = await supabase.from('scan_events').insert(rows);
    if (error) throw new Error(error.message);

    await database.write(async () => {
      const updates = chunk.map(log =>
        log.prepareUpdate((l: ScanLog) => { l.uploaded = true; })
      );
      await database.batch(updates);
    });

    uploaded += chunk.length;
    onProgress(Math.round((uploaded / pending.length) * 100));
  }
}

// ─── Component ───────────────────────────────────────────────
export default function SyncStatusScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const [isOnline, setIsOnline] = useState(true);
  const [localStats, setLocalStats] = useState<LocalStats>({
    ticketsDownloaded: 0,
    pendingUploads: 0,
    lastSyncedAt: null,
  });
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [syncPct, setSyncPct] = useState(0);
  const [deviceId, setDeviceId] = useState('');
  const { startMesh, peers, isMeshActive } = useNearbyMesh();

  const mountedRef = useRef(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const loadStats = useCallback(async () => {
    if (!eventId) return;
    try {
      const ticketsCount = await database.get<Ticket>('tickets')
        .query(Q.where('event_id', eventId))
        .fetchCount();

      const pendingCount = await database.get<ScanLog>('scan_logs')
        .query(
          Q.where('event_id', eventId),
          Q.where('uploaded', false)
        )
        .fetchCount();

      const syncRecords = await database.get<SyncedEvent>('synced_events')
        .query(Q.where('event_id', eventId))
        .fetch();

      const lastSync = syncRecords[0]?.last_synced_at ?? null;

      if (mountedRef.current) {
        setLocalStats({
          ticketsDownloaded: ticketsCount,
          pendingUploads: pendingCount,
          lastSyncedAt: lastSync ? new Date(lastSync).getTime() : null,
        });
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, [eventId]);

  useEffect(() => {
    mountedRef.current = true;
    getDeviceId().then(setDeviceId);
    loadStats();

    // Start mesh (using gate 1 as default for now, or could be dynamic)
    startMesh(1);

    const unsubNet = NetInfo.addEventListener(state => {
      if (mountedRef.current) setIsOnline(!!state.isConnected);
    });

    return () => {
      mountedRef.current = false;
      unsubNet();
      // nearbyStop(); // ✨ REMOVED: Keep mesh active in background for persistence
    };
  }, []);

  // ── Animate progress bar ───────────────────────────────────
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: syncPct / 100,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [syncPct]);

  // ── Sync Now ───────────────────────────────────────────────
  const handleSyncNow = async () => {
    if (!isOnline || phase === 'syncing') return;
    setPhase('syncing');
    setSyncPct(0);

    try {
      // Phase 1: upload scan logs (0 → 50%)
      await uploadPendingScans(eventId, (pct) => {
        if (mountedRef.current) setSyncPct(Math.round(pct * 0.5));
      });

      // Phase 2: re-download tickets (50 → 100%)
      const syncRecords = await database
        .get<SyncedEvent>('synced_events')
        .query(Q.where('event_id', eventId))
        .fetch();

      const eventName = syncRecords[0]?.event_name ?? 'Event';

      await syncEventTickets(eventId, eventName, (progress) => {
        if (mountedRef.current) setSyncPct(50 + Math.round(progress.percent * 0.5));
      });

      if (mountedRef.current) {
        setPhase('done');
        await loadStats();
        setTimeout(() => { if (mountedRef.current) setPhase('idle'); }, 2000);
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      Alert.alert('Sync Failed', err.message ?? 'An unknown error occurred.');
      if (mountedRef.current) setPhase('error');
    }
  };

  // ── Derived ────────────────────────────────────────────────
  const isSyncing = phase === 'syncing';
  const btnLabel = isSyncing
    ? `Syncing... ${syncPct}%`
    : phase === 'done'
      ? '✓  Sync Complete'
      : '⇅  Sync Now';
  const btnDisabled = isSyncing || !isOnline;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#141414" />

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <View style={styles.backArrow} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device Status</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Online badge ───────────────────────────────────── */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, isOnline ? styles.badgeOnline : styles.badgeOffline]}>
            <View style={[styles.badgeDot, isOnline ? styles.dotGreen : styles.dotGray]} />
            <Text style={[styles.badgeText, isOnline ? styles.badgeTextGreen : styles.badgeTextGray]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        {/* ── Mesh Network card ──────────────────────────────── */}
        <View style={styles.card}>
          <View style={[styles.cardIconWrap, { backgroundColor: isMeshActive ? '#1A3D5A' : '#2A2A2A' }]}>
            <View style={[styles.badgeDot, { backgroundColor: isMeshActive ? '#4A7FA5' : '#888888' }]} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Mesh Network</Text>
            <Text style={styles.cardSub}>
              {isMeshActive
                ? `Active • ${peers.length} device${peers.length !== 1 ? 's' : ''} connected nearby`
                : 'Starting...'}
            </Text>
          </View>
        </View>

        {/* ── Connected devices list ─────────────────────────── */}
        {peers.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Connected Devices</Text>
            {peers.map(peer => (
              <View key={peer.endpointId} style={styles.dataRow}>
                <View style={[styles.dataIconWrap, { backgroundColor: '#1A3D2E' }]}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#00C896' }} />
                </View>
                <View style={styles.dataText}>
                  <Text style={styles.dataTitle}>{peer.deviceName}</Text>
                  <Text style={styles.dataSub}>Connected via Nearby</Text>
                </View>
                <View style={styles.checkCircle}>
                  <View style={styles.checkMark} />
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Offline mode card ──────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardIconWrap}>
            <View style={styles.wifiBase} />
            <View style={styles.wifiSlash} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Offline Mode</Text>
            <Text style={styles.cardSub}>
              The app can work offline. Data will be synced when connection is restored.
            </Text>
          </View>
        </View>

        {/* ── Data Stored Locally ────────────────────────────── */}
        <Text style={styles.sectionTitle}>Data Stored Locally</Text>

        <View style={styles.dataRow}>
          <View style={styles.dataIconWrap}>
            <View style={styles.downloadArrow} />
          </View>
          <View style={styles.dataText}>
            <Text style={styles.dataTitle}>Tickets Downloaded</Text>
            <Text style={styles.dataSub}>{localStats.ticketsDownloaded.toLocaleString()} records</Text>
          </View>
          <View style={styles.checkCircle}>
            <View style={styles.checkMark} />
          </View>
        </View>

        <View style={styles.dataRow}>
          <View style={styles.dataIconWrap}>
            <View style={styles.uploadArrow} />
          </View>
          <View style={styles.dataText}>
            <Text style={styles.dataTitle}>Scans Recorded Offline</Text>
            <Text style={styles.dataSub}>
              {localStats.pendingUploads} pending upload{localStats.pendingUploads !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={[styles.checkCircle, localStats.pendingUploads > 0 && styles.checkCircleOrange]}>
            <View style={styles.checkMark} />
          </View>
        </View>

        {/* ── Sync button ────────────────────────────────────── */}
        <TouchableOpacity
          style={[
            styles.syncBtn,
            isSyncing && styles.syncBtnActive,
            btnDisabled && !isSyncing && styles.syncBtnDisabled,
          ]}
          onPress={handleSyncNow}
          disabled={btnDisabled}
          activeOpacity={0.85}
        >
          <Text style={styles.syncBtnText}>{btnLabel}</Text>
        </TouchableOpacity>

        {/* ── Progress card ──────────────────────────────────── */}
        {isSyncing && (
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Syncing Data</Text>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.progressSub}>Uploading scan records to server...</Text>
          </View>
        )}

        {/* ── Last Successful Sync ───────────────────────────── */}
        <View style={styles.lastSyncRow}>
          <Text style={styles.lastSyncLabel}>Last Successful Sync</Text>
          <Text style={styles.lastSyncValue}>{formatLastSync(localStats.lastSyncedAt)}</Text>
        </View>

      </ScrollView>
    </View>
  );
}