import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SectionList,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/src/db/database';
import { getDeviceId } from '@/src/utils/DeviceID';
import sectionListGetItemLayout from 'react-native-section-list-get-item-layout';
import type { Ticket } from '@/src/db/models';
import { styles } from '@/src/styles/main/TicketSearchScreenStyles';

// ─── Types ────────────────────────────────────────────────────
interface TicketRow {
  id: string;
  ticket_id: string;
  name: string;
  ticket_type: string;
  status: string;
}

interface Section {
  letter: string;
  data: TicketRow[];
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function formatType(t: string): string {
  if (t === 'regular') return 'General Admission';
  if (t === 'guest_list') return 'Guest List';
  if (t === 'external') return 'External';
  return t;
}

function toSections(rows: TicketRow[]): Section[] {
  const map: Record<string, TicketRow[]> = {};
  for (const row of rows) {
    const ch = (row.name?.[0] ?? '#').toUpperCase();
    const key = /[A-Z]/.test(ch) ? ch : '#';
    if (!map[key]) map[key] = [];
    map[key].push(row);
  }
  return Object.keys(map)
    .sort()
    .map(letter => ({ letter, data: map[letter] }));
}

const TicketItem = React.memo(({
  item,
  onPress,
}: {
  item: TicketRow;
  onPress: (item: TicketRow) => void;
}) => {
  const scanned = item.status === 'used';
  return (
    <TouchableOpacity style={styles.ticketItem} onPress={() => onPress(item)} activeOpacity={0.7}>
      <View style={styles.ticketInfo}>
        <Text style={styles.ticketName}>{item.name}</Text>
        <Text style={styles.ticketMeta}>
          {formatType(item.ticket_type)}{'  •  '}#{item.ticket_id}
        </Text>
      </View>
      <View style={[styles.statusBadge, scanned ? styles.badgeScanned : styles.badgeValid]}>
        <Text style={[styles.statusText, scanned ? styles.statusGray : styles.statusGreen]}>
          {scanned ? 'Already Scanned' : 'Valid'}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export default function TicketSearchScreen() {
  const router = useRouter();
  const { eventId, eventName } = useLocalSearchParams<{ eventId: string; eventName: string }>();

  const [query, setQuery] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const searchTimeout = useRef<number | null>(null);

  const listRef = useRef<SectionList<TicketRow, Section>>(null);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
    performSearch(''); 
  }, [eventId]);

  const performSearch = async (text: string) => {
    try {
      setLoading(true);
      const q = text.trim();
      
      let queryConstraints: any[] = [
        Q.where('event_id', eventId),
        Q.sortBy('name', Q.asc),
        Q.take(100)
      ];

      if (q.length > 0) {
        queryConstraints.push(
          Q.or(
            Q.where('name', Q.like(`${Q.sanitizeLikeString(q)}%`)),
            Q.where('ticket_id', Q.like(`${Q.sanitizeLikeString(q)}%`))
          )
        );
      }

      const rows = await database
        .get<Ticket>('tickets')
        .query(...queryConstraints)
        .fetch();

      const mapped: TicketRow[] = rows.map(t => ({
        id: t.id,
        ticket_id: t.ticket_id,
        name: t.name,
        ticket_type: t.ticket_type,
        status: t.status,
      }));

      setSections(toSections(mapped));
      setLoading(false);
    } catch (err) {
      console.error('Search failed:', err);
      setLoading(false);
    }
  };

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      performSearch(text);
    }, 150);
  };

  const handleAlphaPress = (letter: string) => {
    const idx = sections.findIndex(s => s.letter === letter);
    if (idx < 0) return;
    try {
      listRef.current?.scrollToLocation({
        sectionIndex: idx,
        itemIndex: 0,
        animated: true,
        viewOffset: 0,
      });
    } catch (e) {
      console.log('Scroll to letter failed', e);
    }
  };

  const handleTicketPress = useCallback((item: TicketRow) => {
    router.push({
      pathname: `/routes/main/ticket-detail/[eventId]`,
      params: {
        eventId: eventId,
        ticketId: item.ticket_id,
        eventName: eventName
      }
    });
  }, [eventId, eventName, router]);

  const getItemLayout: any = sectionListGetItemLayout({
    getItemHeight: (rowData, sectionIndex, rowIndex) => 76,
    getSectionHeaderHeight: () => 32,
    getSectionFooterHeight: () => 0,
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#141414" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <View style={styles.backArrow} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ticket Search</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.searchBarWrap}>
        <View style={styles.searchIconWrap}>
          <View style={styles.searchCircle} />
          <View style={styles.searchHandle} />
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or ticket ID"
          placeholderTextColor="#555"
          value={query}
          onChangeText={handleQueryChange}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
        />
        {loading && (
          <ActivityIndicator color="#00C896" size="small" style={{ marginRight: 12 }} />
        )}
      </View>

      <View style={styles.body}>
        <SectionList
          ref={listRef}
          sections={sections}
          getItemLayout={getItemLayout}
          keyExtractor={item => item.ticket_id}
          renderItem={({ item }) => (
            <TicketItem item={item} onPress={handleTicketPress} />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLetter}>{section.letter}</Text>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
          maxToRenderPerBatch={30}
          windowSize={10}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No tickets found</Text>
              </View>
            ) : null
          }
        />

        <View style={styles.sidebar}>
          {ALPHABET.map(letter => (
            <TouchableOpacity
              key={letter}
              onPress={() => handleAlphaPress(letter)}
              activeOpacity={0.4}
              style={styles.sidebarBtn}
            >
              <Text style={styles.sidebarLetter}>{letter}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}
