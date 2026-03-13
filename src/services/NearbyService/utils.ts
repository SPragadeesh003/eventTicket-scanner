import AsyncStorage from '@react-native-async-storage/async-storage';
import { nearbyConnect, nearbyGetDevices } from '@/src/native/NearbyConnections';
import { NearbyDevice } from '@/src/types/Nearby.types';
import { GATE_NUMBER_KEY } from './constants';
import { discoveredPeers, isRunning, localDeviceName } from './state';

export async function setGateNumber(number: number): Promise<void> {
  await AsyncStorage.setItem(GATE_NUMBER_KEY, String(number));
}

export async function getGateNumber(): Promise<number> {
  const stored = await AsyncStorage.getItem(GATE_NUMBER_KEY);
  return stored ? parseInt(stored, 10) : 1;
}

export async function connectToDevice(endpointId: string, deviceName: string): Promise<boolean> {
  return await nearbyConnect(endpointId, deviceName);
}

export function getDiscoveredDevices(): NearbyDevice[] {
  return [...discoveredPeers];
}

export async function getConnectedDevices(): Promise<NearbyDevice[]> {
  const devices = await nearbyGetDevices();
  return devices.filter(d => d.deviceName !== localDeviceName);
}

export function getLocalDeviceName(): string {
  return localDeviceName;
}

export function isServiceRunning(): boolean {
  return isRunning;
}
