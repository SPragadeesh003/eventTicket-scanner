import { EmitterSubscription } from 'react-native';
import { NearbyDevice } from '@/src/types/Nearby.types';
import { NearbyCallbacks } from './types';

export let subscriptions: EmitterSubscription[] = [];
export let callbacks: NearbyCallbacks = {};
export let isRunning = false;
export let localDeviceName = '';
export let localDeviceId = '';
export let discoveredPeers: NearbyDevice[] = [];
export let listenersAttached = false;
export const handshakeCompletedFor = new Set<string>();

export const setIsRunning = (val: boolean) => { isRunning = val; };
export const setLocalDeviceName = (val: string) => { localDeviceName = val; };
export const setLocalDeviceId = (val: string) => { localDeviceId = val; };
export const setDiscoveredPeers = (val: NearbyDevice[]) => { discoveredPeers = val; };
export const setListenersAttached = (val: boolean) => { listenersAttached = val; };
export const setCallbacks = (val: NearbyCallbacks) => { callbacks = val; };
export const setSubscriptions = (val: EmitterSubscription[]) => { subscriptions = val; };

export let forceReconnectInProgress = false;
export let startInProgress = false;

export const setForceReconnectInProgress = (val: boolean) => { forceReconnectInProgress = val; };
export const setStartInProgress = (val: boolean) => { startInProgress = val; };

export let _registry = {
  forceReconnect: null as any,
};

export const registerForceReconnect = (fn: any) => { _registry.forceReconnect = fn; };
