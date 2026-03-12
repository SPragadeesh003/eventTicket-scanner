import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { styles, eyeStyles } from '@/src/styles/auth/SetNewPasswordScreenStyles';

// ─── Password rules ───────────────────────────────────────────
const RULES = [
  { label: 'At least 8 characters',       test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter (A–Z)',   test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One number (0–9)',             test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character (!@#…)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

// ─── Eye icon (show/hide password) ───────────────────────────
const EyeIcon = ({ visible }: { visible: boolean }) => (
  <View style={eyeStyles.container}>
    <View style={eyeStyles.oval} />
    <View style={eyeStyles.pupil} />
    {!visible && <View style={eyeStyles.slash} />}
  </View>
);

// ─── Rule row ────────────────────────────────────────────────
const RuleRow = ({ label, passed }: { label: string; passed: boolean }) => (
  <View style={styles.ruleRow}>
    <View style={[styles.ruleDot, passed && styles.ruleDotPassed]} />
    <Text style={[styles.ruleText, passed && styles.ruleTextPassed]}>{label}</Text>
  </View>
);

// ─── Types ────────────────────────────────────────────────────
export interface SetNewPasswordScreenProps {
  onPasswordSet: () => void; // navigate to SyncScreen after success
}

// ─── Component ───────────────────────────────────────────────
export default function SetNewPasswordScreen({ onPasswordSet }: SetNewPasswordScreenProps) {
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [loading,         setLoading]         = useState(false);

  const rulesPassed  = RULES.map(r => r.test(newPassword));
  const allRulesMet  = rulesPassed.every(Boolean);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmit    = allRulesMet && passwordsMatch;

  const handleSetPassword = async () => {
    if (!canSubmit) return;

    setLoading(true);
    try {
      // 1. Update password in Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (authError) {
        Alert.alert('Error', authError.message);
        return;
      }

      // 2. Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        return;
      }

      // 3. Mark is_first_login = false in profiles (using profile table if needed, or metadata)
      // Note: Assumes a 'profiles' table exists as in the provided snippet
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_first_login: false })
        .eq('id', user.id);

      if (profileError) {
        Alert.alert('Error', 'Password updated but profile sync failed. Please contact admin.');
        return;
      }

      // 4. Navigate to sync/home screen
      onPasswordSet();

    } catch (err) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#141414" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Header ───────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <View style={styles.lockShackle} />
              <View style={styles.lockBody} />
            </View>
            <Text style={styles.title}>Set New Password</Text>
            <Text style={styles.subtitle}>
              This is your first login.{'\n'}Please set a secure password to continue.
            </Text>
          </View>

          {/* ── Form ─────────────────────────────────────── */}
          <View style={styles.form}>

            {/* New Password */}
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Enter new password"
                placeholderTextColor="#555"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowNew(v => !v)}
                activeOpacity={0.7}
              >
                <EyeIcon visible={showNew} />
              </TouchableOpacity>
            </View>

            {/* Password rules */}
            {newPassword.length > 0 && (
              <View style={styles.rulesBox}>
                {RULES.map((r, i) => (
                  <RuleRow key={i} label={r.label} passed={rulesPassed[i]} />
                ))}
              </View>
            )}

            {/* Confirm Password */}
            <Text style={[styles.label, { marginTop: 20 }]}>Confirm Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Re-enter new password"
                placeholderTextColor="#555"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSetPassword}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowConfirm(v => !v)}
                activeOpacity={0.7}
              >
                <EyeIcon visible={showConfirm} />
              </TouchableOpacity>
            </View>

            {/* Match indicator */}
            {confirmPassword.length > 0 && (
              <Text style={[
                styles.matchText,
                passwordsMatch ? styles.matchOk : styles.matchFail
              ]}>
                {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
              </Text>
            )}

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.btn, (!canSubmit || loading) && styles.btnDisabled]}
              onPress={handleSetPassword}
              activeOpacity={0.85}
              disabled={!canSubmit || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Set Password & Continue</Text>
              )}
            </TouchableOpacity>

          </View>

          {/* ── Footer ───────────────────────────────────── */}
          <Text style={styles.footer}>
            You will not be asked to do this again
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
