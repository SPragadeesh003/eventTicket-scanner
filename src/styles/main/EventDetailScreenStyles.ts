import { StyleSheet, Platform, Dimensions } from 'react-native';
import { COLORS } from '@/constants/color';

const { width } = Dimensions.get('window');

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.DARK_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    width: 10,
    height: 10,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: COLORS.WHITE,
    transform: [{ rotate: '45deg' }],
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.WHITE,
    letterSpacing: 0.2,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 180,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  badgeGreen: { backgroundColor: COLORS.DARK_MIST },
  badgeGray: { backgroundColor: COLORS.BORDER },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.SUCCESS,
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotGreen: {
    backgroundColor: COLORS.SUCCESS
  },
  dotGray: {
    backgroundColor: COLORS.GRAY
  },
  onlineText: {
    fontSize: 13,
    fontWeight: '600',
  },
  textGreen: { color: COLORS.SUCCESS },
  textGray: { color: COLORS.GRAY },
  lastSyncText: {
    fontSize: 12,
    color: COLORS.GRAY,
    marginLeft: 4,
  },

  infoCard: {
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 14,
    padding: 18,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.WHITE,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.GRAY,
    marginLeft: 8,
  },

  locationPin: {
    width: 10,
    height: 12,
    borderWidth: 1.5,
    borderColor: COLORS.GRAY,
    borderRadius: 5,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },

  calendarIcon: {
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderColor: COLORS.GRAY,
    borderRadius: 2,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.WHITE,
    marginBottom: 12,
  },

  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 12,
    padding: 16,
    minHeight: 80,
  },
  statCardHighlight: {
    backgroundColor: COLORS.DARK_MIST,
    borderWidth: 1,
    borderColor: COLORS.HIGHLIGHT_GREEN,
  },
  statCardFull: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.GRAY,
    marginBottom: 8,
  },
  statLabelHighlight: {
    color: COLORS.LIGHT_GREEN,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.WHITE,
  },
  statValueHighlight: {
    color: COLORS.SUCCESS,
  },

  bottomBar: {
    backgroundColor: COLORS.DARK_BG,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'android' ? 20 : 34,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
  },

  scanBtn: {
    backgroundColor: COLORS.SUCCESS,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 10,
  },
  scanBtnDim: {
    opacity: 0.5,
  },
  scanIcon: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: COLORS.DARK_BG,
    borderRadius: 4,
  },
  scanBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.DARK_BG,
  },

  bottomActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.WHITE,
  },

  syncStatusBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  syncStatusText: {
    fontSize: 14,
    color: COLORS.GRAY,
    fontWeight: '500',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBox: {
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 20,
    padding: 32,
    width: width - 64,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.WHITE,
    marginTop: 16,
    marginBottom: 8,
  },
  modalSub: {
    fontSize: 14,
    color: COLORS.GRAY,
    marginBottom: 16,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: COLORS.BORDER,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.SUCCESS,
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 13,
    color: COLORS.SUCCESS,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalHint: {
    fontSize: 12,
    color: COLORS.MUTED,
  },
});
