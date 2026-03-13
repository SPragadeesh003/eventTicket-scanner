import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/src/lib/supabase';
import { getDeviceId } from '@/src/utils/DeviceID';
import { ROUTES } from '@/constants/routes';
import {
  isEventSynced,
  syncEventTickets,
  getLocalEventStats,
  type SyncProgress,
  type EventStats,
} from '@/src/services/TicketSync';
import {
  startNearbyService,
  stopListening,
  getConnectedDevices,
  type NearbyCallbacks,
} from '@/src/services/NearbyService';
import type { NearbyDevice } from '@/src/types/Nearby.types';
import { styles } from '@/src/styles/main/EventDetailScreenStyles';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EventInfo } from '@/src/types/Event.types';
import { StatCard } from '@/src/components/StatCard';
import { SyncModal } from '@/src/components/SyncModal';
import { OnlineStatusRow } from '@/src/components/OnlineStatusRow';
import { EventInfoCard } from '@/src/components/EventInfoCard';

export default function EventDetailScreen() {
  const router = useRouter();
  const { eventId, eventName } = useLocalSearchParams<{ eventId: string; eventName: string }>();

  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isSynced, setIsSynced] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [peers, setPeers] = useState<NearbyDevice[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const isOnlineRef = useRef(true);
  const deviceIdRef = useRef('');

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

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      const id = await getDeviceId();
      if (!mountedRef.current) return;
      deviceIdRef.current = id;

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

      const { data } = await supabase
        .from('events')
        .select('name, venue, event_date')
        .eq('id', eventId)
        .single();
      if (mountedRef.current && data) setEventInfo(data);

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
  }, [eventId, handleSync]);

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

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <View style={styles.backArrow} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{eventName}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Status Badge */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, isSynced ? styles.badgeGreen : styles.badgeGray]}>
            <Text style={[styles.badgeText, !isSynced && styles.badgeGray]}>
              {isSynced ? 'Ready to Scan' : 'Not Synced'}
            </Text>
          </View>
        </View>

        {/* Connectivity Status */}
        <OnlineStatusRow
          isOnline={isOnline}
          peers={peers}
          lastSyncedAt={stats?.lastSyncedAt}
        />

        {/* Event Details */}
        <EventInfoCard
          eventInfo={eventInfo}
          eventName={eventName}
        />

        <Text style={styles.sectionTitle}>Statistics</Text>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Regular Tickets"
            value={stats ? `${stats.regularScannedCount.toLocaleString()} / ${stats.regularCount.toLocaleString()}` : '— / —'}
          />
          <StatCard
            label="Guest Tickets"
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
          <StatCard
            label="External Tickets"
            value={stats ? `${stats.externalScannedCount.toLocaleString()} / ${stats.externalCount.toLocaleString()}` : '— / —'}
            fullWidth
          />
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

        <TouchableOpacity
          style={styles.syncStatusBtn}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: `/${ROUTES.SYNC_STATUS}`, params: { eventId } } as any)}
        >
          <Text style={styles.syncStatusText}>⇅ Sync Status</Text>
        </TouchableOpacity>
      </View>

      <SyncModal visible={syncing} syncProgress={syncProgress} />
    </SafeAreaView>
  );
}