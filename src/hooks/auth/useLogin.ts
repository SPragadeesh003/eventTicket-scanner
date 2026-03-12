import { useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { saveProfile } from '@/src/services/ProfileService';

interface UseLoginProps {
  onLoginSuccess: (isFirstLogin: boolean) => void;
}

export const useLogin = ({ onLoginSuccess }: UseLoginProps) => {
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [emailError, setEmailError] = useState('');

  const validateEmail = (val: string) => {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    setEmailError(valid || val === '' ? '' : 'Enter a valid email address');
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      // ── 1. Sign in ───────────────────────────────────────────────────────
      const { data, error } = await supabase.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      });

      if (error) {
        Alert.alert('Login Failed', error.message);
        return;
      }

      if (!data.user) {
        Alert.alert('Login Failed', 'Something went wrong. Please try again.');
        return;
      }

      // ── 2. Fetch profile ─────────────────────────────────────────────────
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_first_login, full_name, scanner_number, device_name')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        Alert.alert('Profile Error', 'Could not load your profile. Contact admin.');
        return;
      }

      // ── 3. Cache profile locally for offline mesh use ────────────────────
      // Saved to AsyncStorage so startMesh() can read it without internet.
      // meshName format: "Gatekeeper 1 - Gate 1"
      await saveProfile(
        data.user.id,
        profile.full_name,
        profile.scanner_number,
        profile.device_name,
      );

      // ── 4. Navigate ──────────────────────────────────────────────────────
      onLoginSuccess(profile.is_first_login);

    } catch (err: any) {
      console.error('[useLogin] Unexpected error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert('Enter Email', 'Please enter your email address first.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Email Sent', 'Check your inbox for a password reset link.');
    }
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    loading,
    emailError,
    validateEmail,
    handleLogin,
    handleForgotPassword,
  };
};