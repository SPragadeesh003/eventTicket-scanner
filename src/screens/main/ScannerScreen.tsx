import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Alert,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import NetInfo from '@react-native-community/netinfo';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/src/db/database';
import { getDeviceId } from '@/src/utils/DeviceID';
import { validateTicket, type ScanResult } from '@/src/services/ScanService';
import {
  startNearbyService,
  stopListening,
  getConnectedDevices,
  type NearbyCallbacks,
} from '@/src/services/NearbyService';
import type { NearbyDevice } from '@/src/types/Nearby.types';
import { sendScan, type ScanPayload } from '@/src/services/MeshProtocols';
import { ROUTES } from '@/constants/routes';
import { styles } from '@/src/styles/main/ScannerScreenStyles';
import { Ticket } from '@/src/db/models';
import { ResultOverlay } from '@/src/components/ResultOverlay';
import { OnlineStatusRow } from '@/src/components/OnlineStatusRow';
import { SafeAreaView } from 'react-native-safe-area-context';


export default function ScannerScreen() {
  const router = useRouter();
  const { eventId, eventName } = useLocalSearchParams<{ eventId: string; eventName: string }>();

  const device = useCameraDevice('back');

  const [hasPermission, setHasPermission] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [peers, setPeers] = useState<NearbyDevice[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [meshStarted, setMeshStarted] = useState(false);

  const processingRef = useRef(false);
  const deviceIdRef = useRef('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const status = Camera.getCameraPermissionStatus();
    setHasPermission(status === 'granted');
    setPermissionChecked(true);

    const unsubNet = NetInfo.addEventListener(state => {
      if (mountedRef.current) setIsOnline(!!state.isConnected);
    });

    getDeviceId().then(id => {
      if (!mountedRef.current) return;
      deviceIdRef.current = id;

      const callbacks: NearbyCallbacks = {
        onDeviceConnected: async () => {
          const devices = await getConnectedDevices();
          if (mountedRef.current) setPeers(devices);
        },
        onDeviceDisconnected: async () => {
          const devices = await getConnectedDevices();
          if (mountedRef.current) setPeers(devices);
        },
        onTicketScannedByPeer: (payload: ScanPayload) => {
          if (mountedRef.current) {
            setScanResult({
              status: 'duplicate',
              name: `Gate ${payload.gateNumber}: ${payload.deviceName}`,
              ticketType: 'Scanned by another gate',
              ticketId: payload.ticketId,
            });
          }
        },
      };

      startNearbyService(callbacks).then(() => {
        if (mountedRef.current) setMeshStarted(true);
      });
    });

    return () => {
      mountedRef.current = false;
      unsubNet();
      stopListening();
    };
  }, []);

  const handleRequestPermission = useCallback(async () => {
    const result = await Camera.requestCameraPermission();
    setHasPermission(result === 'granted');
    if (result !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permission is required. Please enable it in settings.');
    }
  }, []);

  const handleCodeScanned = useCallback(async (codes: any[]) => {
    if (!isScanning || processingRef.current || !codes?.length) return;
    const value = codes[0]?.value;
    if (!value) return;

    processingRef.current = true;
    setIsScanning(false);

    try {
      const result = await validateTicket(value, eventId, deviceIdRef.current);
      setScanResult(result);
    } catch (err: any) {
      Alert.alert('Scan Error', err?.message ?? 'Something went wrong.');
      setIsScanning(true);
    } finally {
      processingRef.current = false;
    }
  }, [isScanning, eventId]);

  const handleDismissResult = useCallback(() => {
    setScanResult(null);
    setIsScanning(true);
  }, []);

  if (!permissionChecked) {
    return (
      <View style={styles.permissionWrap}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
        <Text style={styles.permissionText}>Checking camera permission...</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.permissionWrap}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
        <Text style={styles.permissionText}>Camera access is needed to scan QR codes on tickets.</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={handleRequestPermission}>
          <Text style={styles.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.permissionWrap}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
        <Text style={styles.permissionText}>No camera device found.</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={() => router.back()}>
          <Text style={styles.permissionBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />

      <Camera
        style={styles.camera}
        device={device}
        isActive={isScanning && !scanResult}
        codeScanner={{
          codeTypes: ['qr', 'ean-13', 'ean-8', 'code-128'],
          onCodeScanned: handleCodeScanned,
        }}
        onError={(err) => console.warn('[Camera Error]', err)}
      />

      <View style={styles.overlay}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <View style={styles.backArrow} />
          </TouchableOpacity>

          <OnlineStatusRow
            isOnline={isOnline}
            peers={peers}
            lastSyncedAt={null}
          />

          <View style={styles.headerBtn} />
        </View>

        <View style={styles.viewfinderWrap}>
          <View style={styles.viewfinder}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
          </View>
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={styles.manualBtn}
            activeOpacity={0.7}
            onPress={() => router.push({
              pathname: `/${ROUTES.TICKET_SEARCH}`,
              params: { eventId, eventName },
            } as any)}
          >
            <View style={styles.manualIcon} />
            <Text style={styles.manualText}>Manual Search</Text>
          </TouchableOpacity>
        </View>
      </View>

      {scanResult && <ResultOverlay result={scanResult} onDismiss={handleDismissResult} />}
    </SafeAreaView>
  );
}