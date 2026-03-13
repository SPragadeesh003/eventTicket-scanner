import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DetailRow } from './DetailRow';
import { formatTicketType, formatTicketDateTime } from '@/src/utils/TicketUtils';
import { COLORS } from '@/constants/color';

interface TicketDetail {
  ticket_id: string;
  name: string;
  ticket_type: string;
  status: string;
  synced_at: number;
}

interface ScanInfo {
  scanned_at: number;
  device_name: string;
}

interface TicketDetailCardProps {
  ticket: TicketDetail;
  scanInfo: ScanInfo | null;
  isUsed: boolean;
}

/**
 * A component that displays the main information card for a ticket.
 */
export const TicketDetailCard: React.FC<TicketDetailCardProps> = ({
  ticket,
  scanInfo,
  isUsed,
}) => (
  <View style={styles.card}>
    <Text style={styles.cardName}>{ticket.name}</Text>
    <Text style={styles.cardType}>{formatTicketType(ticket.ticket_type)}</Text>

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
      value={formatTicketType(ticket.ticket_type)}
    />

    <DetailRow
      icon={<View style={styles.calIcon} />}
      label="Synced At"
      value={formatTicketDateTime(ticket.synced_at)}
    />

    {isUsed && scanInfo && (
      <>
        <View style={styles.divider} />
        <DetailRow
          icon={<View style={[styles.checkIcon, styles.checkIconGreen]} />}
          label="Scanned At"
          value={formatTicketDateTime(scanInfo.scanned_at)}
        />
        <DetailRow
          icon={<View style={[styles.checkIcon, styles.checkIconGreen]} />}
          label="Scanned By"
          value={scanInfo.device_name}
        />
      </>
    )}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  cardName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.WHITE,
    marginBottom: 4,
  },
  cardType: {
    fontSize: 14,
    color: COLORS.GRAY,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.BORDER,
    marginVertical: 16,
  },
  hashIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hashText: {
    fontSize: 16,
    color: COLORS.GRAY,
    fontWeight: '700',
  },
  typeIcon: {
    width: 16,
    height: 12,
    borderWidth: 1.5,
    borderColor: COLORS.GRAY,
    borderRadius: 2,
    borderLeftWidth: 4,
  },
  calIcon: {
    width: 15,
    height: 14,
    borderWidth: 1.5,
    borderColor: COLORS.GRAY,
    borderRadius: 2,
  },
  checkIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  checkIconGreen: {
    borderColor: COLORS.SUCCESS,
  },
});
