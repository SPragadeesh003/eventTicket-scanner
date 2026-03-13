import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '@/src/styles/main/EventDetailScreenStyles';
import { formatDate } from '@/src/utils/DateUtils';
import { EventInfo } from '@/src/types/Event.types';

interface EventInfoCardProps {
  eventInfo: EventInfo | null;
  eventName: string;
}

/**
 * A card component that displays information about an event,
 * including its name, venue, and date.
 * 
 * @param eventInfo - The detailed event information from the database
 * @param eventName - The fallback event name if detailed info is not available
 */
export const EventInfoCard: React.FC<EventInfoCardProps> = ({
  eventInfo,
  eventName,
}) => (
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
);
