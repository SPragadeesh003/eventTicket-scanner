export const RTT_WIFI_THRESHOLD_MS = 400;

export const ACK_TIMEOUT_WIFI  = 2_500;
export const ACK_BACKOFF_WIFI  = [4_000, 6_000];

export const ACK_TIMEOUT_BLE   = 5_000;
export const ACK_BACKOFF_BLE   = [8_000, 12_000];

export const ACK_MAX_RETRIES   = 2;               

export const FLUSH_DELAY_WIFI  = 50;
export const FLUSH_DELAY_BLE   = 150;

export const HEARTBEAT_INTERVAL_MS  = 2_500;
export const PONG_TIMEOUT_MS_WIFI   = 4_000; 
export const PONG_TIMEOUT_MS_BLE    = 5_000;

export const SEEN_MSG_TTL_MS  = 30_000;
export const SEEN_MSG_MAX     = 200;

export const FLUSH_COOLDOWN_MS = 2_000;

export const RECONNECT_JITTER_MS = 400; 