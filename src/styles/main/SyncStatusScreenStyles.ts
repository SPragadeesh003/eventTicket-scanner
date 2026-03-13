import { StyleSheet, Platform } from 'react-native';
import { COLORS } from '@/constants/color';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.DARK_BG,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: 14,
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: {
    width: 10, height: 10,
    borderLeftWidth: 2, borderBottomWidth: 2,
    borderColor: COLORS.WHITE,
    transform: [{ rotate: '45deg' }],
  },
  headerTitle: {
    fontSize: 18, fontWeight: '700', color: COLORS.WHITE,
  },

  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },

  // ── Online badge ──
  badgeRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  badgeOnline: { backgroundColor: COLORS.DARK_MIST },
  badgeOffline: { backgroundColor: COLORS.BORDER },
  badgeDot: {
    width: 7, height: 7, borderRadius: 4,
  },
  dotGreen: { backgroundColor: COLORS.SUCCESS },
  dotGray: { backgroundColor: COLORS.GRAY },
  badgeText: { fontSize: 13, fontWeight: '600' },
  badgeTextGreen: { color: COLORS.SUCCESS },
  badgeTextGray: { color: COLORS.GRAY },

  // ── Offline mode card ──
  card: {
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
    gap: 14,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // Wifi-off icon (simplified)
  wifiBase: {
    width: 18,
    height: 10,
    borderWidth: 2,
    borderColor: COLORS.GRAY,
    borderRadius: 10,
    borderBottomWidth: 0,
  },
  wifiSlash: {
    position: 'absolute',
    width: 22,
    height: 2,
    backgroundColor: COLORS.GRAY,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  cardText: { flex: 1 },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.WHITE,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 13,
    color: COLORS.GRAY,
    lineHeight: 18,
  },
  meshActionWrap: {
    marginTop: 12,
    alignItems: 'flex-start',
  },
  meshActionBtn: {
    backgroundColor: COLORS.MID_GRAY,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  meshActionBtnActive: {
    backgroundColor: COLORS.BTN_BLUE,
  },
  meshActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.WHITE,
  },

  // ── Section title ──
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.WHITE,
    marginBottom: 12,
  },

  // ── Data rows ──
  dataRow: {
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 14,
  },
  dataIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Download arrow ↓
  downloadArrow: {
    width: 2,
    height: 14,
    backgroundColor: COLORS.SUCCESS,
    borderRadius: 1,
  },
  uploadArrow: {
    width: 2,
    height: 14,
    backgroundColor: COLORS.BTN_BLUE,
    borderRadius: 1,
  },
  dataText: { flex: 1 },
  dataTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.WHITE,
    marginBottom: 2,
  },
  dataSub: {
    fontSize: 12,
    color: COLORS.GRAY,
  },
  // Check circle
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.SUCCESS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleOrange: {
    borderColor: COLORS.WARNING,
  },
  checkMark: {
    width: 10,
    height: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: COLORS.SUCCESS,
    transform: [{ rotate: '-45deg' }],
    marginTop: 2,
  },

  // ── Sync button ──
  syncBtn: {
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  syncBtnActive: {
    backgroundColor: COLORS.BLUE_MIST,
    borderColor: COLORS.BTN_BLUE,
  },
  syncBtnDisabled: {
    opacity: 0.4,
  },
  syncBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.WHITE,
    letterSpacing: 0.3,
  },

  // ── Progress card ──
  progressCard: {
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.WHITE,
    marginBottom: 12,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: COLORS.BORDER,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.SUCCESS,
    borderRadius: 4,
  },
  progressSub: {
    fontSize: 12,
    color: COLORS.GRAY,
  },

  // ── Last sync row ──
  lastSyncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
    marginTop: 4,
  },
  lastSyncLabel: {
    fontSize: 14,
    color: COLORS.GRAY,
  },
  lastSyncValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.WHITE,
  },
});
