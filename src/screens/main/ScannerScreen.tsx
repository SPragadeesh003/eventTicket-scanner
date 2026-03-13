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
import { Q }           from '@nozbe/watermelondb';
import { database }    from '@/src/db/database';
import { getDeviceId } from '@/src/utils/DeviceID';
import { validateTicket, type ScanResult } from '@/src/services/ScanService';
import {
  startNearbyService,
  stopListening,
  broadcastScan,
  getConnectedDevices,
  type NearbyCallbacks,
} from '@/src/services/NearbyConnectionServices';
import type { NearbyDevice } from '@/src/native/NearbyConnections';
import { ROUTES } from '@/constants/routes';
import { styles } from '@/src/styles/main/ScannerScreenStyles';
import { Ticket } from '@/src/db/models';

const RESULT_DISPLAY_MS = 2500;

// ─── Result Overlay ──────────────────────────────────────────
const ResultOverlay = ({
  result,
  onDismiss,
}: {
  result:    ScanResult;
  onDismiss: () => void;
}) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onDismiss());
    }, RESULT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const isValid = result.status === 'valid';
  const isDup   = result.status === 'duplicate';
  const isError = !isValid;

  const bgStyle = isValid ? styles.resultValid : isDup ? styles.resultDuplicate : styles.resultInvalid;
  const title   = isValid ? 'Ticket Valid' : isDup ? 'Ticket Already\nScanned' : 'Invalid Ticket';

  return (
    <Animated.View style={[styles.resultOverlay, bgStyle, { opacity }]}>
      <View style={styles.resultIconWrap}>
        {isValid ? (
          <View style={styles.checkMark} />
        ) : (
          <View style={styles.crossMark}>
            <View style={styles.crossLine1} />
            <View style={styles.crossLine2} />
          </View>
        )}
      </View>
      <Text style={[styles.resultTitle, isError && styles.resultTitleWhite]}>{title}</Text>
      <Text style={[styles.resultName,  isError && styles.resultNameWhite]}>{result.name}</Text>
      <Text style={[styles.resultType,  isError && styles.resultTypeWhite]}>{result.ticketType}</Text>
      <Text style={[styles.resultId,    isError && styles.resultIdWhite]}>#{result.ticketId}</Text>
    </Animated.View>
  );
};

// ─── Component ───────────────────────────────────────────────
export default function ScannerScreen() {
  const router = useRouter();
  const { eventId, eventName } = useLocalSearchParams<{ eventId: string; eventName: string }>();

  const device = useCameraDevice('back');

  const [hasPermission,     setHasPermission]     = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [scanResult,        setScanResult]         = useState<ScanResult | null>(null);
  const [isScanning,        setIsScanning]         = useState(true);
  const [peers,             setPeers]              = useState<NearbyDevice[]>([]);
  const [meshStarted,       setMeshStarted]        = useState(false);

  const processingRef = useRef(false);
  const deviceIdRef   = useRef('');

  // ── Mount: check camera permission + start mesh ───────────
  useEffect(() => {
    // Camera permission
    const status = Camera.getCameraPermissionStatus();
    setHasPermission(status === 'granted');
    setPermissionChecked(true);

    // Start Nearby mesh
    getDeviceId().then(id => {
      deviceIdRef.current = id;

      const callbacks: NearbyCallbacks = {
        onDeviceConnected: async () => {
          const devices = await getConnectedDevices();
          setPeers(devices);
        },
        onDeviceDisconnected: async () => {
          const devices = await getConnectedDevices();
          setPeers(devices);
        },
        onTicketScannedByPeer: (payload) => {
          // Show a brief result when a peer scans a ticket
          setScanResult({
            status:     'duplicate',
            name:       `Peer: ${payload.deviceName}`,
            ticketType: 'Scanned by another device',
            ticketId:   payload.ticketId,
          });
        },
      };

      startNearbyService(callbacks).then(() => setMeshStarted(true));
    });

    return () => { stopListening(); };
  }, []);

  // ── Camera permission request ─────────────────────────────
  const handleRequestPermission = useCallback(async () => {
    const result = await Camera.requestCameraPermission();
    setHasPermission(result === 'granted');
    if (result !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permission is required. Please enable it in settings.');
    }
  }, []);

  // ── Handle QR scan ────────────────────────────────────────
  const handleCodeScanned = useCallback(async (codes: any[]) => {
    if (!isScanning || processingRef.current || !codes?.length) return;
    const value = codes[0]?.value;
    if (!value) return;

    processingRef.current = true;
    setIsScanning(false);

    try {
      const result = await validateTicket(value, eventId, deviceIdRef.current);
      if (result.status === 'valid') {
        await broadcastScan(result.ticketId, eventId);
      }
      setScanResult(result);
    } catch (err: any) {
      Alert.alert('Scan Error', err?.message ?? 'Something went wrong.');
      setIsScanning(true);
    } finally {
      processingRef.current = false;
    }
  }, [isScanning, eventId]);

  // ── Dismiss result ────────────────────────────────────────
  const handleDismissResult = useCallback(() => {
    setScanResult(null);
    setIsScanning(true);
  }, []);

  // ── Demo scan ─────────────────────────────────────────────
  const handleDemoScan = useCallback(async (type: 'valid' | 'duplicate' | 'invalid') => {
    if (!isScanning || processingRef.current) return;
    processingRef.current = true;
    setIsScanning(false);

    try {
      if (type === 'invalid') {
        setScanResult({ status: 'invalid', name: 'Unknown', ticketType: 'N/A', ticketId: '#INVALID' });
        return;
      }
      const tickets = await database
        .get<Ticket>('tickets')
        .query(
          Q.where('event_id', eventId),
          Q.where('status', type === 'valid' ? 'valid' : 'used'),
        )
        .fetch();

      if (tickets.length === 0) {
        setScanResult({ status: 'invalid', name: 'No tickets found', ticketType: 'N/A', ticketId: '#DEMO' });
        return;
      }
      const result = await validateTicket(tickets[0].ticket_id, eventId, deviceIdRef.current);
      if (result.status === 'valid') {
        await broadcastScan(result.ticketId, eventId);
      }
      setScanResult(result);
    } catch (err: any) {
      Alert.alert('Demo Error', err?.message ?? 'Something went wrong.');
    } finally {
      processingRef.current = false;
    }
  }, [isScanning, eventId]);

  // ── Permission gates ──────────────────────────────────────
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
    <View style={styles.root}>
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

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <View style={styles.backArrow} />
          </TouchableOpacity>

          {meshStarted && (
            <View style={styles.meshPill}>
              <View style={[styles.meshDot, { backgroundColor: peers.length > 0 ? '#00C896' : '#FFA040' }]} />
              <Text style={styles.meshText}>
                {peers.length > 0 ? `${peers.length} Nearby` : 'Scanning...'}
              </Text>
            </View>
          )}

          {/* Balance the header */}
          <View style={styles.headerBtn} />
        </View>

        {/* Viewfinder */}
        <View style={styles.viewfinderWrap}>
          <View style={styles.viewfinder}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
            <View style={styles.scanLine} />
          </View>
        </View>

        {/* Bottom */}
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

          <Text style={styles.demoHint}>Demo: Press 1 for Valid, 2 for Duplicate, 3 for Invalid</Text>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            {(['valid', 'duplicate', 'invalid'] as const).map((type, i) => (
              <TouchableOpacity
                key={type}
                onPress={() => handleDemoScan(type)}
                style={{ backgroundColor: '#1E1E1E', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 }}
              >
                <Text style={{ color: type === 'valid' ? '#6BCB77' : '#FF6B6B', fontWeight: '600' }}>
                  {i + 1} {type.charAt(0).toUpperCase() + type.slice(1, 4)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {scanResult && <ResultOverlay result={scanResult} onDismiss={handleDismissResult} />}
    </View>
  );
}