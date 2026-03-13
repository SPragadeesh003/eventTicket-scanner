import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/src/lib/supabase';
import { styles } from '@/src/styles/main/HomeScreenStyles';
import { ROUTES } from '@/constants/routes';
import {
  startNearbyService,
  stopListening,
  getConnectedDevices,
} from '@/src/services/NearbyService';
import type { NearbyDevice } from '@/src/types/Nearby.types';
import { Event } from '@/src/types/Event.types';

import { EventCard } from '@/src/components/EventCard';
import { OnlineStatusRow } from '@/src/components/OnlineStatusRow';
import { getLocalEventStats } from '@/src/services/TicketSync';

type Tab = 'current' | 'past';


const UserIcon = () => (
  <View style={styles.userIconWrap}>
    <View style={styles.userHead} />
    <View style={styles.userBody} />
  </View>
);

const LogoutIcon = () => (
  <View style={styles.logoutWrap}>
    <View style={styles.logoutBox} />
    <View style={styles.logoutArrow} />
  </View>
);

export default function HomeScreen() {
  const router               = useRouter();
  const [activeTab, setTab]    = useState<Tab>('current');
  const [events,    setEvents] = useState<Event[]>([]);
  const [loading,   setLoading] = useState(true);
  const [userName,  setUserName] = useState('');
  const [isOnline,  setIsOnline] = useState(true);
  const [lastSync,  setLastSync] = useState<number | null>(null);
  const [peers,     setPeers]    = useState<NearbyDevice[]>([]);

  const mountedRef = React.useRef(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (profile) setUserName(profile.full_name);

      const { data: eventsData, error } = await supabase
        .from('events')
        .select('id, name, venue, event_date, status')
        .eq('status', activeTab)
        .order('event_date', { ascending: true });

      if (error) throw error;
      setEvents(eventsData ?? []);

    } catch (err) {
      Alert.alert('Error', 'Could not load events. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { 
    mountedRef.current = true;
    loadData();

    const unsubNet = NetInfo.addEventListener(state => {
      if (mountedRef.current) setIsOnline(!!state.isConnected);
    });

    const initNearby = async () => {
      await startNearbyService({
        onDeviceConnected: async () => {
          const d = await getConnectedDevices();
          if (mountedRef.current) setPeers(d);
        },
        onDeviceDisconnected: async () => {
          const d = await getConnectedDevices();
          if (mountedRef.current) setPeers(d);
        },
      });
    };

    initNearby();

    return () => {
      mountedRef.current = false;
      unsubNet();
      stopListening();
    };
  }, [loadData]);

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace(`/${ROUTES.LOGIN}`);
          },
        },
      ]
    );
  };

  const handleEventPress = (event: Event) => {
    router.push({
      pathname: `/${ROUTES.EVENT_DETAIL}`,
      params: { eventId: event.id, eventName: event.name }
    });
  };

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyText}>
        {activeTab === 'current'
          ? 'No current events'
          : 'No past events yet'}
      </Text>
      <Text style={styles.emptySubText}>
        {activeTab === 'current'
          ? 'Events will appear here once added'
          : 'Completed events will appear here'}
      </Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#141414" />
      <View style={styles.topBar}>
        <TouchableOpacity 
          style={styles.topBarBtn} 
          activeOpacity={0.7}
          onPress={() => router.push(`/${ROUTES.PROFILE}`)}
        >
          <UserIcon />
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>My Events</Text>

        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <LogoutIcon />
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        {(['current', 'past'] as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={styles.tabBtn}
            onPress={() => setTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'current' ? 'Current Events' : 'Past Events'}
            </Text>
            {activeTab === tab && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#00C896" size="large" />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <EventCard item={item} onPress={() => handleEventPress(item)} />
          )}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
