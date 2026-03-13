import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '@/src/styles/main/HomeScreenStyles';
import { formatDate } from '@/src/utils/DateUtils';
import { Event } from '@/src/types/Event.types';


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

interface EventCardProps {
  item: Event;
  onPress: () => void;
}

/**
 * A card component that displays an event's name, date, and venue.
 * Used primarily in the HomeScreen event list.
 */
export const EventCard: React.FC<EventCardProps> = ({ item, onPress }) => (
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
