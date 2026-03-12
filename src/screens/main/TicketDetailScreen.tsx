import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Q }           from '@nozbe/watermelondb';
import { database }    from '@/src/db/database';
import { getDeviceId } from '@/src/utils/DeviceID';
import { broadcastScan } from '@/src/services/NearbyConnectionServices';
import type { Ticket, ScanLog } from '@/src/db/models';
import { styles } from '@/src/styles/main/TicketDetailScreenStyles';

// ─── Types ────────────────────────────────────────────────────
interface TicketDetail {
  ticket_id:   string;
  name:        string;
  ticket_type: string;
  status:      string;
  synced_at:   number;
}

interface ScanInfo {
  scanned_at:  number;
  device_name: string;
}

function formatType(t: string): string {
  if (t === 'regular')    return 'General Admission';
  if (t === 'guest_list') return 'Guest List';
  if (t === 'external')   return 'External';
  return t;
}

function formatDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString('en-GB', {
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(',', '');
}

// ─── Detail Row ───────────────────────────────────────────────
const DetailRow = ({
  icon,
  label,
  value,
  bold,
}: {
  icon:  React.ReactNode;
  label: string;
  value: string;
  bold?: boolean;
}) => (
  <View style={styles.detailRow}>
    <View style={styles.detailIcon}>{icon}</View>
    <View style={{ flex: 1 }}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, bold && styles.detailValueBold]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  </View>
);

// ─── Component ───────────────────────────────────────────────
export default function TicketDetailScreen() {
  const router = useRouter();
  const { ticketId, eventId } = useLocalSearchParams<{
    ticketId: string;
    eventId:  string;
  }>();

  const [ticket,    setTicket]    = useState<TicketDetail | null>(null);
  const [scanInfo,  setScanInfo]  = useState<ScanInfo | null>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    loadTicket();
  }, [ticketId]);

  const loadTicket = async () => {
    setLoading(true);
    try {
      const tickets = await database
        .get<Ticket>('tickets')
        .query(Q.where('ticket_id', ticketId), Q.where('event_id', eventId))
        .fetch();

      if (tickets.length === 0) return;
      const t = tickets[0];

      setTicket({
        ticket_id:   t.ticket_id,
        name:        t.name,
        ticket_type: t.ticket_type,
        status:      t.status,
        synced_at:   t.synced_at,
      });

      // If already scanned, load most recent scan log
      if (t.status === 'used') {
        const logs = await database
          .get<ScanLog>('scan_logs')
          .query(Q.where('ticket_id', ticketId), Q.where('event_id', eventId))
          .fetch();

        if (logs.length > 0) {
          const latest = logs.reduce((a, b) => a.scanned_at > b.scanned_at ? a : b);
          setScanInfo({ scanned_at: latest.scanned_at, device_name: latest.device_name });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Validate ticket ───────────────────────────────────────
  const handleValidate = async () => {
    if (!ticket) return;

    Alert.alert(
      'Validate Ticket',
      `Mark ${ticket.name}'s ticket as used?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Validate',
          onPress: async () => {
            const deviceId = await getDeviceId();
            const now      = Date.now();

            const tickets = await database
              .get<Ticket>('tickets')
              .query(Q.where('ticket_id', ticketId), Q.where('event_id', eventId))
              .fetch();

            if (tickets.length === 0) return;

            await database.write(async () => {
              await tickets[0].update((t: Ticket) => { t.status = 'used'; });
              await database.get<ScanLog>('scan_logs').create((log: ScanLog) => {
                log.ticket_id   = ticketId;
                log.event_id    = eventId;
                log.device_id   = deviceId;
                log.gate_number = 1;
                log.device_name = `Gate-${deviceId.slice(-4).toUpperCase()}`;
                log.scanned_at  = now;
                log.uploaded    = false;
                log.is_duplicate = false;
              });
            });

            setTicket(prev => prev ? { ...prev, status: 'used' } : null);
            setScanInfo({ scanned_at: now, device_name: `Gate-${deviceId.slice(-4).toUpperCase()}` });

            // Broadcast manual validation to all nearby peers
            await broadcastScan(ticketId, eventId, deviceId);
          },
        },
      ]
    );
  };

  // ── Loading / not found ───────────────────────────────────
  if (loading || !ticket) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="#141414" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <View style={styles.backArrow} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ticket Details</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centerWrap}>
          <Text style={styles.notFoundText}>
            {loading ? 'Loading...' : 'Ticket not found'}
          </Text>
        </View>
      </View>
    );
  }

  const isUsed = ticket.status === 'used';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#141414" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <View style={styles.backArrow} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ticket Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Status badge */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, isUsed ? styles.badgeUsed : styles.badgeValid]}>
            <Text style={[styles.badgeText, isUsed ? styles.badgeTextUsed : styles.badgeTextValid]}>
              {isUsed ? 'Already Scanned' : 'Valid'}
            </Text>
          </View>
        </View>

        {/* Ticket info card */}
        <View style={styles.card}>
          <Text style={styles.cardName}>{ticket.name}</Text>
          <Text style={styles.cardType}>{formatType(ticket.ticket_type)}</Text>

          <View style={styles.divider} />

          <DetailRow
            icon={<View style={styles.hashIcon}><Text style={styles.hashText}>#</Text></View>}
            label="Ticket ID"
            value={ticket.ticket_id}
            bold
          />

          <DetailRow
            icon={<View style={styles.typeIcon} />}
            label="Ticket Type"
            value={formatType(ticket.ticket_type)}
          />

          <DetailRow
            icon={<View style={styles.calIcon} />}
            label="Synced At"
            value={formatDateTime(ticket.synced_at)}
          />

          {/* Scan info — only shown if ticket is used */}
          {isUsed && scanInfo && (
            <>
              <View style={styles.divider} />
              <DetailRow
                icon={<View style={[styles.checkIcon, styles.checkIconGreen]} />}
                label="Scanned At"
                value={formatDateTime(scanInfo.scanned_at)}
              />
              <DetailRow
                icon={<View style={[styles.checkIcon, styles.checkIconGreen]} />}
                label="Scanned By"
                value={scanInfo.device_name}
              />
            </>
          )}
        </View>

      </ScrollView>

      {/* Bottom action */}
      <View style={styles.bottomBar}>
        {isUsed ? (
          <View style={styles.alreadyScannedBanner}>
            <Text style={styles.alreadyScannedText}>This ticket has already been scanned</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.validateBtn} onPress={handleValidate} activeOpacity={0.85}>
            <Text style={styles.validateBtnText}>Validate Ticket</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}