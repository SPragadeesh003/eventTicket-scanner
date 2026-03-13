import { ProtocolCallbacks } from './types';

export let activeTransportIsBLE = false;
export const setActiveTransportIsBLE = (val: boolean) => { activeTransportIsBLE = val; };

export const pendingPings = new Map<string, number>();
export const rttMap = new Map<string, number>();

export const pendingAcks = new Map<string, { handle: ReturnType<typeof setTimeout>; retryCount: number }>();

export let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
export let pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
export let heartbeatDeviceId: string = '';
export let lastPongReceivedAt: number = 0;
export let peerDeviceIdForHeartbeat: string = '';
export let heartbeatRoleAssigned: boolean = false;
export let heartbeatIsSender: boolean = false;

export const setHeartbeatTimer = (val: ReturnType<typeof setInterval> | null) => { heartbeatTimer = val; };
export const setPongTimeoutTimer = (val: ReturnType<typeof setTimeout> | null) => { pongTimeoutTimer = val; };
export const setHeartbeatDeviceId = (val: string) => { heartbeatDeviceId = val; };
export const setLastPongReceivedAt = (val: number) => { lastPongReceivedAt = val; };
export const setPeerDeviceIdForHeartbeat = (val: string) => { peerDeviceIdForHeartbeat = val; };
export const setHeartbeatRoleAssigned = (val: boolean) => { heartbeatRoleAssigned = val; };
export const setHeartbeatIsSender = (val: boolean) => { heartbeatIsSender = val; };


export const pingSentAt = new Map<string, number>();

export const seenMsgIds = new Map<string, number>();

export let _forceReconnect: (() => Promise<void>) | null = null;
export const setForceReconnectFn = (fn: () => Promise<void>) => { _forceReconnect = fn; };

export let callbacks: ProtocolCallbacks | null = null;
export const setCallbacks = (cb: ProtocolCallbacks | null) => { callbacks = cb; };

export let flushInProgress = false;
export let lastFlushAt = 0;
export const setFlushInProgress = (val: boolean) => { flushInProgress = val; };
export const setLastFlushAt = (val: number) => { lastFlushAt = val; };

export let _registry = {
    flushOutbox: null as any,
    broadcastMessage: null as any,
    startAckTimeout: null as any,
    continueAckTimeout: null as any,
};

export const registerFlushOutbox = (fn: any) => { _registry.flushOutbox = fn; };
export const registerBroadcastMessage = (fn: any) => { _registry.broadcastMessage = fn; };
export const registerStartAckTimeout = (fn: any) => { _registry.startAckTimeout = fn; };
export const registerContinueAckTimeout = (fn: any) => { _registry.continueAckTimeout = fn; };

export let reconnectInProgress = false;
export const setReconnectInProgress = (val: boolean) => { reconnectInProgress = val; };