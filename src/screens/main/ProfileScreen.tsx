import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '@/src/styles/main/ProfileScreenStyles';
import { COLORS } from '@/constants/color';
import { getProfile, CachedProfile } from '@/src/services/ProfileService';
import { supabase } from '@/src/lib/supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<CachedProfile | null>(null);
  const [email, setEmail] = useState<string>('—');

  useEffect(() => {
    async function loadData() {
      const p = await getProfile();
      setProfile(p);

      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setEmail(user.email);
      }
    }
    loadData();
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name={"arrow-back" as any} size={24} color={COLORS.WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <View style={styles.card}>
            {/* Name */}
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons name={"person-outline" as any} size={20} color={COLORS.GRAY} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Name</Text>
                <Text style={styles.rowValue}>{profile?.fullName || '—'}</Text>
              </View>
            </View>
            <View style={styles.divider} />

            {/* Email */}
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons name={"mail-outline" as any} size={20} color={COLORS.GRAY} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Email</Text>
                <Text style={styles.rowValue}>{email}</Text>
              </View>
            </View>
            <View style={styles.divider} />

            {/* Role */}
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons name={"shield-outline" as any} size={20} color={COLORS.GRAY} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Role</Text>
                <Text style={styles.rowValue}>Event Staff</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Device Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DEVICE</Text>
          <View style={styles.card}>
            {/* Device Name */}
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons name={"phone-portrait-outline" as any} size={20} color={COLORS.GRAY} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Device Name</Text>
                <Text style={styles.rowValue}>{profile?.deviceName || '—'}</Text>
              </View>
            </View>
            <View style={styles.divider} />

            {/* Scanner Status */}
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons name={"barcode-outline" as any} size={20} color={COLORS.GRAY} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Scanner Status</Text>
                <Text style={[styles.rowValue, styles.statusActive]}>Active</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
