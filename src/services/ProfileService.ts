/**
 * ProfileService.ts
 *
 * Caches the logged-in user's profile to AsyncStorage after login.
 * Used by the mesh to get the correct device name without hitting Supabase.
 *
 * Storage key: @profile
 * Shape: { fullName, scannerNumber, deviceName, userId }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = '@profile';

export interface CachedProfile {
  userId:        string;
  fullName:      string;
  scannerNumber: number;
  deviceName:    string;  // physical device name e.g. "Galaxy A52s"
  meshName:      string;  // e.g. "Gatekeeper 1 - Gate 1"
}

// ─── Save after login ─────────────────────────────────────────────────────────
export async function saveProfile(
  userId:        string,
  fullName:      string,
  scannerNumber: number,
  deviceName:    string,
): Promise<void> {
  const profile: CachedProfile = {
    userId,
    fullName,
    scannerNumber,
    deviceName,
    meshName: `${fullName} - Gate ${scannerNumber}`,
  };
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  console.log(`[ProfileService] Saved profile: ${profile.meshName}`);
}

// ─── Get cached profile (works fully offline) ─────────────────────────────────
export async function getProfile(): Promise<CachedProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedProfile;
  } catch {
    return null;
  }
}

// ─── Get just the mesh name (used by startMesh) ───────────────────────────────
export async function getMeshName(): Promise<string> {
  const profile = await getProfile();
  if (!profile) {
    console.warn('[ProfileService] No cached profile — falling back to unknown');
    return 'Unknown-Gate';
  }
  return profile.meshName;
}

// ─── Clear on logout ──────────────────────────────────────────────────────────
export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_KEY);
  console.log('[ProfileService] Profile cleared');
}