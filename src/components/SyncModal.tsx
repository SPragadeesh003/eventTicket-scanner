import React from 'react';
import { View, Text, Modal, ActivityIndicator } from 'react-native';
import { styles } from '@/src/styles/main/EventDetailScreenStyles';
import type { SyncProgress } from '@/src/services/TicketSync';
import { COLORS } from '@/constants/color';

interface SyncModalProps {
  visible: boolean;
  syncProgress: SyncProgress | null;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  visible,
  syncProgress,
}) => (
  <Modal visible={visible} transparent animationType="fade">
    <View style={styles.modalOverlay}>
      <View style={styles.modalBox}>
        <ActivityIndicator color={COLORS.SUCCESS} size="large" />
        <Text style={styles.modalTitle}>Syncing Tickets</Text>

        {syncProgress && (
          <>
            <Text style={styles.modalSub}>
              {syncProgress.downloaded.toLocaleString()} / {syncProgress.total.toLocaleString()} tickets
            </Text>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${syncProgress.percent}%` as any }
                ]}
              />
            </View>
            <Text style={styles.progressPercent}>{syncProgress.percent}%</Text>
          </>
        )}

        <Text style={styles.modalHint}>Do not close the app</Text>
      </View>
    </View>
  </Modal>
);
