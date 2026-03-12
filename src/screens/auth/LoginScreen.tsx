import React from 'react';
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
} from 'react-native';
import { Colors } from '@/constants/color';
import styles from '@/src/styles/auth/LoginScreenStyles';
import ScanIcon from '@/src/components/auth/ScanIcon';
import { useLogin } from '@/src/hooks/auth/useLogin';

export interface LoginScreenProps {
  onLoginSuccess: (isFirstLogin: boolean) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const {
    email,
    setEmail,
    password,
    setPassword,
    loading,
    emailError,
    validateEmail,
    handleLogin,
    handleForgotPassword,
  } = useLogin({ onLoginSuccess });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── App Icon ─────────────────────────────────── */}
          <View style={styles.iconContainer}>
            <View style={styles.iconBox}>
              <ScanIcon />
            </View>
          </View>

          {/* ── App Title ────────────────────────────────── */}
          <Text style={styles.appTitle}>Event Horizon</Text>
          <Text style={styles.appSubtitle}>Scanner</Text>

          {/* ── Form ─────────────────────────────────────── */}
          <View style={styles.form}>

            {/* Email */}
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="your.email@example.com"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={email}
              onChangeText={(val) => {
                setEmail(val);
                validateEmail(val);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
            {emailError ? (
              <Text style={styles.errorText}>{emailError}</Text>
            ) : null}

            {/* Password */}
            <View style={styles.labelRow}>
              <Text style={styles.label}>Password</Text>
              <Text style={styles.required}>*</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Login</Text>
              )}
            </TouchableOpacity>

            {/* Forgot Password */}
            <TouchableOpacity
              onPress={handleForgotPassword}
              activeOpacity={0.7}
              style={styles.forgotBtn}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

          </View>

          {/* ── Footer ───────────────────────────────────── */}
          <Text style={styles.footer}>
            Login using your Event Horizon account
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}