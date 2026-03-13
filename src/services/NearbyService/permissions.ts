import { Alert, Platform, PermissionsAndroid, type Permission } from 'react-native';

export async function checkWifiEnabled(): Promise<void> {
  try {
    const NetInfo = require('@react-native-community/netinfo').default;
    const state = await NetInfo.fetch('wifi');
    const wifiEnabled = state.isWifiEnabled ?? true;

    if (!wifiEnabled) {
      console.warn('[Nearby] ⚠️ WiFi radio is OFF — Nearby will fall back to BLE only');
      Alert.alert(
        '⚠️ Turn On WiFi for Best Performance',
        'WiFi is currently off. Turn it ON (you don\'t need to connect to any network).\n\nThis enables WiFi Direct — much faster peer-to-peer sync between gates.',
        [{ text: 'Got it' }]
      );
    } else {
      console.log('[Nearby] ✅ WiFi radio is ON — WiFi Direct transport available');
    }
  } catch (e) {
    console.log('[Nearby] NetInfo not available — skipping WiFi preflight check');
  }
}

export function getNearbyPermissions(): Permission[] {
  const api = parseInt(String(Platform.Version), 10);
  const perms: Permission[] = [];

  if (api >= 31) {
    perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
    perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  }

  if (api >= 32) {
    perms.push('android.permission.NEARBY_WIFI_DEVICES' as Permission);
  }

  if (api <= 31) {
    perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }

  return perms;
}

export async function checkNearbyPermissions(): Promise<string[]> {
  const denied: string[] = [];
  for (const perm of getNearbyPermissions()) {
    if (!(await PermissionsAndroid.check(perm))) denied.push(perm);
  }
  return denied;
}

export async function requestNearbyPermissions(): Promise<string[]> {
  const perms = getNearbyPermissions();
  if (perms.length === 0) return [];
  const results = await PermissionsAndroid.requestMultiple(perms);
  return Object.entries(results)
    .filter(([, status]) => status !== PermissionsAndroid.RESULTS.GRANTED)
    .map(([perm]) => perm);
}
