import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '@/src/styles/main/EventDetailScreenStyles';

interface StatCardProps {
  label: string;
  value: string;
  highlight?: boolean;
  fullWidth?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  highlight,
  fullWidth,
}) => (
  <View style={[
    styles.statCard,
    highlight && styles.statCardHighlight,
    fullWidth && styles.statCardFull
  ]}>
    <Text style={[styles.statLabel, highlight && styles.statLabelHighlight]}>
      {label}
    </Text>
    <Text style={[styles.statValue, highlight && styles.statValueHighlight]}>
      {value}
    </Text>
  </View>
);
