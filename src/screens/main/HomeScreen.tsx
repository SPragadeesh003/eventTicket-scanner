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
import { supabase } from '@/src/lib/supabase';
import { styles } from '@/src/styles/main/HomeScreenStyles';
import { ROUTES } from '@/constants/routes';

// ─── Types ────────────────────────────────────────────────────
interface Event {
  id:         string;
  name:       string;
  venue:      string;
  event_date: string;
  status:     'current' | 'past';
}

type Tab = 'current' | 'past';

// ─── Helpers ──────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day:     '2-digit',
    month:   'short',
    year:    'numeric',
  });
}

// ─── Icons (pure RN — no lib needed) ─────────────────────────
const CalendarIcon = () => (
  <View style={styles.iconWrap}>
    <View style={styles.calendarOuter}>
      <View style={styles.calendarTop} />
      <View style={styles.calendarBody} />
    </View>
  </View>
);

const LocationIcon = () => (
  <View style={styles.iconWrap}>
    <View style={styles.locationPin} />
    <View style={styles.locationDot} />
  </View>
);

const ChevronIcon = () => (
  <View style={styles.chevron} />
);

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

// ─── Event Card ───────────────────────────────────────────────
const EventCard = ({ item, onPress }: { item: Event; onPress: () => void }) => (
  <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
    <View style={styles.cardContent}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <View style={styles.cardMeta}>
        <CalendarIcon />
        <Text style={styles.cardMetaText}>{formatDate(item.event_date)}</Text>
      </View>
      <View style={styles.cardMeta}>
        <LocationIcon />
        <Text style={styles.cardMetaText}>{item.venue}</Text>
      </View>
    </View>
    <ChevronIcon />
  </TouchableOpacity>
);

// ─── Component ───────────────────────────────────────────────
export default function HomeScreen() {
  const router               = useRouter();
  const [activeTab, setTab]    = useState<Tab>('current');
  const [events,    setEvents] = useState<Event[]>([]);
  const [loading,   setLoading] = useState(true);
  const [userName,  setUserName] = useState('');

  // ── Load profile + events ───────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch profile name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (profile) setUserName(profile.full_name);

      // Fetch events by tab
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

  useEffect(() => { loadData(); }, [loadData]);

  // ── Logout ──────────────────────────────────────────────────
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

  // ── Navigate to event detail ────────────────────────────────
  const handleEventPress = (event: Event) => {
    router.push({
      pathname: `/${ROUTES.EVENT_DETAIL}`,
      params: { eventId: event.id, eventName: event.name }
    });
  };

  // ── Empty state ─────────────────────────────────────────────
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

      {/* ── Top Bar ────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBarBtn} activeOpacity={0.7}>
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

      {/* ── Tabs ───────────────────────────────────────────── */}
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

      {/* ── Event List ─────────────────────────────────────── */}
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
