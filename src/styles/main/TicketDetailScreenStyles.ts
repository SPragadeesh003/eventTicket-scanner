import { StyleSheet, Platform } from 'react-native';
import { COLORS } from '@/constants/color';

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.DARK_BG },

  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: 14,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow: {
    width: 10, height: 10,
    borderLeftWidth: 2, borderBottomWidth: 2, borderColor: COLORS.WHITE,
    transform: [{ rotate: '45deg' }],
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.WHITE },

  scroll: { paddingHorizontal: 16, paddingBottom: 160 },

  // ── Badge ──
  badgeRow: { flexDirection: 'row', marginBottom: 16 },
  badge: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  badgeValid: { backgroundColor: COLORS.DARK_MIST },
  badgeUsed:  { backgroundColor: COLORS.BORDER },
  badgeText:  { fontSize: 13, fontWeight: '600' },
  badgeTextValid: { color: COLORS.SUCCESS },
  badgeTextUsed:  { color: COLORS.GRAY },

  // ── Bottom bar ──
  bottomBar: {
    backgroundColor: COLORS.DARK_BG,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'android' ? 24 : 38,
    paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.BORDER,
    gap: 10,
  },

  // Already scanned banner
  alreadyScannedBanner: {
    borderWidth: 1.5, borderColor: COLORS.SUCCESS,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  alreadyScannedText: {
    color: COLORS.SUCCESS, fontSize: 14, fontWeight: '600',
  },

  // Validate button
  validateBtn: {
    backgroundColor: COLORS.SUCCESS,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  validateBtnText: {
    color: COLORS.DARK_BG, fontSize: 16, fontWeight: '700',
  },

  // Mark entry button
  markEntryBtn: {
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  markEntryBtnText: {
    color: COLORS.WHITE, fontSize: 16, fontWeight: '600',
  },

  // Loading / not found
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: COLORS.GRAY, fontSize: 15 },
});
