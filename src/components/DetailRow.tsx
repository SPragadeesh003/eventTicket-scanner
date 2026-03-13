import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/color';

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  bold?: boolean;
}

/**
 * A reusable row for displaying a label and value pair with an icon.
 */
export const DetailRow: React.FC<DetailRowProps> = ({
  icon,
  label,
  value,
  bold,
}) => (
  <View style={styles.detailRow}>
    <View style={styles.detailIcon}>{icon}</View>
    <View style={{ flex: 1 }}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, bold && styles.detailValueBold]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  detailIcon: {
    width: 20,
    height: 20,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.GRAY,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    color: COLORS.WHITE,
  },
  detailValueBold: {
    fontWeight: '700',
    fontSize: 15,
  },
});
