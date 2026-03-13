import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = '@profile';

export interface CachedProfile {
  userId: string;
  fullName: string;
  scannerNumber: number;
  deviceName: string;
  meshName: string;
}
export async function saveProfile(
  userId: string,
  fullName: string,
  scannerNumber: number,
  deviceName: string,
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

export async function getProfile(): Promise<CachedProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedProfile;
  } catch {
    return null;
  }
}

export async function getMeshName(): Promise<string> {
  const profile = await getProfile();
  if (!profile) {
    console.warn('[ProfileService] No cached profile — falling back to unknown');
    return 'Unknown-Gate';
  }
  return profile.meshName;
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_KEY);
  console.log('[ProfileService] Profile cleared');
}