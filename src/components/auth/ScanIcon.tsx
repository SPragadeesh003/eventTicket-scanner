import React from 'react';
import { View } from 'react-native';
import styles from '@/src/styles/auth/LoginScreenStyles';

const ScanIcon = () => (
  <View style={styles.iconInner}>
    <View style={[styles.corner, styles.cornerTL]} />
    <View style={[styles.corner, styles.cornerTR]} />
    <View style={[styles.corner, styles.cornerBL]} />
    <View style={[styles.corner, styles.cornerBR]} />
  </View>
);

export default ScanIcon;
