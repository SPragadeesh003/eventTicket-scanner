import React from 'react';
import { View } from 'react-native';
import styles from '@/src/styles/auth/LoginScreenStyles';

const ScanIcon = () => (
  <View style={styles.iconInner}>
    {/* Top-left */}
    <View style={[styles.corner, styles.cornerTL]} />
    {/* Top-right */}
    <View style={[styles.corner, styles.cornerTR]} />
    {/* Bottom-left */}
    <View style={[styles.corner, styles.cornerBL]} />
    {/* Bottom-right */}
    <View style={[styles.corner, styles.cornerBR]} />
  </View>
);

export default ScanIcon;
