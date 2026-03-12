import { StyleSheet, Platform } from 'react-native';

const DARK_BG = '#141414';
const CARD_BG = '#1E1E1E';
const WHITE   = '#FFFFFF';
const GRAY    = '#888888';
const GREEN   = '#00C896';
const BORDER  = '#2A2A2A';

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK_BG },

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
    borderLeftWidth: 2, borderBottomWidth: 2, borderColor: WHITE,
    transform: [{ rotate: '45deg' }],
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: WHITE },

  scroll: { paddingHorizontal: 16, paddingBottom: 160 },

  // ── Badge ──
  badgeRow: { flexDirection: 'row', marginBottom: 16 },
  badge: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  badgeValid: { backgroundColor: '#1A3D2E' },
  badgeUsed:  { backgroundColor: '#2A2A2A' },
  badgeText:  { fontSize: 13, fontWeight: '600' },
  badgeTextValid: { color: GREEN },
  badgeTextUsed:  { color: GRAY },

  // ── Card ──
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  cardName: { fontSize: 22, fontWeight: '800', color: WHITE, marginBottom: 4 },
  cardType: { fontSize: 14, color: GRAY, marginBottom: 4 },

  divider: { height: 1, backgroundColor: BORDER, marginVertical: 16 },

  // ── Detail rows ──
  detailRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginBottom: 16, gap: 12,
  },
  detailIcon: {
    width: 20, height: 20,
    marginTop: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  detailLabel: { fontSize: 12, color: GRAY, marginBottom: 2 },
  detailValue: { fontSize: 14, color: WHITE },
  detailValueBold: { fontWeight: '700', fontSize: 15 },

  // Icons (pure RN)
  emailIcon: {
    width: 16, height: 12,
    borderWidth: 1.5, borderColor: GRAY, borderRadius: 2,
  },
  hashIcon: { alignItems: 'center', justifyContent: 'center' },
  hashText: { fontSize: 16, color: GRAY, fontWeight: '700' },
  typeIcon: {
    width: 16, height: 12,
    borderWidth: 1.5, borderColor: GRAY, borderRadius: 2,
    borderLeftWidth: 4,
  },
  calIcon: {
    width: 15, height: 14,
    borderWidth: 1.5, borderColor: GRAY, borderRadius: 2,
  },
  checkIcon: {
    width: 18, height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  checkIconGreen: { borderColor: GREEN },

  // ── Bottom bar ──
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: DARK_BG,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'android' ? 24 : 38,
    paddingTop: 12,
    borderTopWidth: 1, borderTopColor: BORDER,
    gap: 10,
  },

  // Already scanned banner
  alreadyScannedBanner: {
    borderWidth: 1.5, borderColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  alreadyScannedText: {
    color: GREEN, fontSize: 14, fontWeight: '600',
  },

  // Validate button
  validateBtn: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  validateBtnText: {
    color: DARK_BG, fontSize: 16, fontWeight: '700',
  },

  // Mark entry button
  markEntryBtn: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  markEntryBtnText: {
    color: WHITE, fontSize: 16, fontWeight: '600',
  },

  // Loading / not found
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: GRAY, fontSize: 15 },
});
