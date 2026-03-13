export interface NearbyDevice {
  endpointId: string;
  deviceName: string;
}

export interface NearbyPayloadEvent {
  endpointId: string;
  payload: string;
}

export interface NearbyReconnectEvent {
  endpointId: string;
  attempt: number;
}

export interface NearbyPermissionError {
  missing: string;
}

export interface NearbyDiagnostics {
  device_model: string;
  android_api: number;
  local_name: string;
  connected_devices: number;
  connecting_devices: number;
  exhausted_ids: number;
  cached_names: number;
  service_id: string;
  strategy: string;
  permissions: string;
  all_perms_ok: boolean;
}
