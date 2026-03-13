import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { supabase }    from '@/src/lib/supabase';
import { getDeviceId } from '@/src/utils/DeviceID';
import { ROUTES }      from '@/constants/routes';
import {
  isEventSynced,
  syncEventTickets,
  getLocalEventStats,
  formatLastSync,
  type SyncProgress,
  type EventStats,
} from '@/src/services/TicketSync';
import {
  startNearbyService,
  stopListening,
  getConnectedDevices,
  type NearbyCallbacks,
} from '@/src/services/NearbyConnectionServices';
import type { NearbyDevice } from '@/src/native/NearbyConnections';
import { styles } from '@/src/styles/main/EventDetailScreenStyles';
import { SafeAreaView } from 'react-native-safe-area-context';

interface EventInfo {
  name:       string;
  venue:      string;
  event_date: string;
}

const StatCard = ({
  label, value, highlight,
}: {
  label: string; value: string; highlight?: boolean;
}) => (
  <View style={[styles.statCard, highlight && styles.statCardHighlight]}>
    <Text style={[styles.statLabel, highlight && styles.statLabelHighlight]}>{label}</Text>
    <Text style={[styles.statValue, highlight && styles.statValueHighlight]}>{value}</Text>
  </View>
);

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function EventDetailScreen() {
  const router                 = useRouter();
  const { eventId, eventName } = useLocalSearchParams<{ eventId: string; eventName: string }>();

  const [eventInfo,    setEventInfo]    = useState<EventInfo | null>(null);
  const [stats,        setStats]        = useState<EventStats | null>(null);
  const [isOnline,     setIsOnline]     = useState(true);
  const [isSynced,     setIsSynced]     = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [peers,        setPeers]        = useState<NearbyDevice[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef  = useRef(true);
  const isOnlineRef = useRef(true);
  const deviceIdRef = useRef('');

  // ── Sync handler ─────────────────────────────────────────
  const handleSync = useCallback(async () => {
    if (!isOnlineRef.current) {
      Alert.alert('Offline', 'Internet connection required to sync tickets.');
      return;
    }
    setSyncing(true);
    setSyncProgress({ downloaded: 0, total: 0, percent: 0 });
    try {
      await syncEventTickets(eventId, eventName, (p) => {
        if (mountedRef.current) setSyncProgress({ ...p });
      });
      if (!mountedRef.current) return;
      setIsSynced(true);
      const s = await getLocalEventStats(eventId, deviceIdRef.current);
      if (mountedRef.current) setStats(s);
    } catch (err: any) {
      console.log('Sync Failed', err?.message ?? 'Please try again.');
    } finally {
      if (mountedRef.current) { setSyncing(false); setSyncProgress(null); }
    }
  }, [eventId, eventName]);

  // ── Bootstrap ─────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      const id = await getDeviceId();
      if (!mountedRef.current) return;
      deviceIdRef.current = id;

      // Start Nearby mesh — peer list updates on connect/disconnect
      const callbacks: NearbyCallbacks = {
        onDeviceConnected: async () => {
          const d = await getConnectedDevices();
          if (mountedRef.current) setPeers(d);
        },
        onDeviceDisconnected: async () => {
          const d = await getConnectedDevices();
          if (mountedRef.current) setPeers(d);
        },
      };
      await startNearbyService(callbacks);

      // Load event info from Supabase
      const { data } = await supabase
        .from('events')
        .select('name, venue, event_date')
        .eq('id', eventId)
        .single();
      if (mountedRef.current && data) setEventInfo(data);

      // Check sync status, load stats or auto-sync
      const synced = await isEventSynced(eventId);
      if (!mountedRef.current) return;
      setIsSynced(synced);

      if (synced) {
        const s = await getLocalEventStats(eventId, id);
        if (mountedRef.current) setStats(s);
      } else if (isOnlineRef.current) {
        await handleSync();
      }
    };

    init();

    const unsubNet = NetInfo.addEventListener(state => {
      const connected = !!state.isConnected;
      isOnlineRef.current = connected;
      if (mountedRef.current) setIsOnline(connected);
    });

    // Refresh stats every 5s from WatermelonDB
    intervalRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      const s = await getLocalEventStats(eventId, deviceIdRef.current);
      if (mountedRef.current) setStats(s);
    }, 5000);

    return () => {
      mountedRef.current = false;
      unsubNet();
      stopListening();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [eventId]);

  const handleScanTickets = () => {
    if (!isSynced) {
      Alert.alert('Not Synced', 'Please sync ticket data before scanning.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sync Now', onPress: handleSync },
      ]);
      return;
    }
    router.push({ pathname: `/${ROUTES.SCANNER}`, params: { eventId, eventName } } as any);
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#141414" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <View style={styles.backArrow} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{eventName}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        <View style={styles.badgeRow}>
          <View style={[styles.badge, isSynced ? styles.badgeGreen : styles.badgeGray]}>
            <Text style={[styles.badgeText, !isSynced && styles.badgeGray]}>
              {isSynced ? 'Ready to Scan' : 'Not Synced'}
            </Text>
          </View>
        </View>

        <View style={styles.onlineRow}>
          <View style={[styles.onlineDot, isOnline ? styles.dotGreen : styles.dotGray]} />
          <Text style={[styles.onlineText, isOnline ? styles.textGreen : styles.textGray]}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
          {peers.length > 0 && (
            <>
              <Text style={{ color: '#555', marginHorizontal: 8 }}>|</Text>
              <View style={[styles.onlineDot, { backgroundColor: '#00C896' }]} />
              <Text style={[styles.onlineText, { color: '#00C896' }]}>
                {peers.length} {peers.length === 1 ? 'Peer' : 'Peers'}
              </Text>
            </>
          )}
          <Text style={styles.lastSyncText}>
            {'   '}Last sync: {formatLastSync(stats?.lastSyncedAt ?? null)}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{eventInfo?.name ?? eventName}</Text>
          {eventInfo && (
            <>
              <View style={styles.infoRow}>
                <View style={styles.locationPin} />
                <Text style={styles.infoText}>{eventInfo.venue}</Text>
              </View>
              <View style={styles.infoRow}>
                <View style={styles.calendarIcon} />
                <Text style={styles.infoText}>{formatDate(eventInfo.event_date)}</Text>
              </View>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Statistics</Text>

        <View style={styles.statsGrid}>
          <StatCard
            label="Tickets"
            value={stats ? `${stats.regularScannedCount.toLocaleString()} / ${stats.regularCount.toLocaleString()}` : '— / —'}
          />
          <StatCard
            label="Guest List"
            value={stats ? `${stats.guestListScannedCount.toLocaleString()} / ${stats.guestListCount.toLocaleString()}` : '— / —'}
          />
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            label="Total Scanned"
            value={stats ? `${stats.totalScanned.toLocaleString()} / ${stats.totalTickets.toLocaleString()}` : '— / —'}
            highlight
          />
          <StatCard
            label="Scanned by Device"
            value={stats ? `${stats.scannedByDevice}` : '—'}
          />
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardFull]}>
            <Text style={styles.statLabel}>External Tickets</Text>
            <Text style={styles.statValue}>
              {stats ? `${stats.externalScannedCount.toLocaleString()} / ${stats.externalCount.toLocaleString()}` : '— / —'}
            </Text>
          </View>
        </View>

      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.scanBtn, !isSynced && styles.scanBtnDim]}
          onPress={handleScanTickets}
          activeOpacity={0.85}
        >
          <View style={styles.scanIcon} />
          <Text style={styles.scanBtnText}>Scan Tickets</Text>
        </TouchableOpacity>

        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
            <Text style={styles.actionText}>$ Sales</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
            <Text style={styles.actionText}>📊 Statistics</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.syncStatusBtn}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: `/${ROUTES.SYNC_STATUS}`, params: { eventId } } as any)}
        >
          <Text style={styles.syncStatusText}>⇅ Sync Status</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={syncing} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ActivityIndicator color="#00C896" size="large" />
            <Text style={styles.modalTitle}>Syncing Tickets</Text>
            {syncProgress && (
              <>
                <Text style={styles.modalSub}>
                  {syncProgress.downloaded.toLocaleString()} / {syncProgress.total.toLocaleString()} tickets
                </Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${syncProgress.percent}%` as any }]} />
                </View>
                <Text style={styles.progressPercent}>{syncProgress.percent}%</Text>
              </>
            )}
            <Text style={styles.modalHint}>Do not close the app</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}