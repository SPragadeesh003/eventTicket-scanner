import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '@/src/styles/main/EventDetailScreenStyles';
import { formatLastSync } from '@/src/services/TicketSync';
import type { NearbyDevice } from '@/src/types/Nearby.types';
import { COLORS } from '@/constants/color';

interface OnlineStatusRowProps {
  isOnline: boolean;
  peers: NearbyDevice[];
  lastSyncedAt: number | null | undefined;
}

export const OnlineStatusRow: React.FC<OnlineStatusRowProps> = ({
  isOnline,
  peers,
  lastSyncedAt,
}) => (
  <View style={styles.onlineRow}>
    <View style={[styles.onlineDot, isOnline ? styles.dotGreen : styles.dotGray]} />
    <Text style={[styles.onlineText, isOnline ? styles.textGreen : styles.textGray]}>
      {isOnline ? 'Online' : 'Offline'}
    </Text>
    
    {peers.length > 0 && (
      <>
        <Text style={{ color: COLORS.MUTED, marginHorizontal: 8 }}>|</Text>
        <View style={[styles.onlineDot, { backgroundColor: COLORS.SUCCESS }]} />
        <Text style={[styles.onlineText, { color: COLORS.SUCCESS }]}>
          {peers.length} {peers.length === 1 ? 'Peer' : 'Peers'}
        </Text>
      </>
    )}
    
    <Text style={styles.lastSyncText}>
      {'   '}Last sync: {formatLastSync(lastSyncedAt ?? null)}
    </Text>
  </View>
);
