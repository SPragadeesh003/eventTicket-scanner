import { StyleSheet, Platform } from 'react-native';

const DARK_BG = '#141414';
const CARD_BG = '#1E1E1E';
const WHITE   = '#FFFFFF';
const GRAY    = '#888888';
const GREEN   = '#00C896';
const BLUE    = '#4A7FA5';
const ORANGE  = '#FFA040';
const BORDER  = '#2A2A2A';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DARK_BG,
  },

  // ── Header ──
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal:  16,
    paddingTop:        Platform.OS === 'android' ? 48 : 56,
    paddingBottom:      14,
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: {
    width: 10, height: 10,
    borderLeftWidth: 2, borderBottomWidth: 2,
    borderColor: WHITE,
    transform: [{ rotate: '45deg' }],
  },
  headerTitle: {
    fontSize: 18, fontWeight: '700', color: WHITE,
  },

  scroll: {
    paddingHorizontal: 16,
    paddingBottom:     48,
  },

  // ── Online badge ──
  badgeRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  badge: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal:  16,
    paddingVertical:     8,
    borderRadius:       20,
    gap:                 6,
  },
  badgeOnline:  { backgroundColor: '#1A3D2E' },
  badgeOffline: { backgroundColor: '#2A2A2A' },
  badgeDot: {
    width: 7, height: 7, borderRadius: 4,
  },
  dotGreen: { backgroundColor: GREEN },
  dotGray:  { backgroundColor: GRAY },
  badgeText: { fontSize: 13, fontWeight: '600' },
  badgeTextGreen: { color: GREEN },
  badgeTextGray:  { color: GRAY },

  // ── Offline mode card ──
  card: {
    backgroundColor:  CARD_BG,
    borderRadius:     14,
    padding:          16,
    flexDirection:    'row',
    alignItems:       'flex-start',
    marginBottom:     24,
    gap:              14,
  },
  cardIconWrap: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: '#2A2A2A',
    alignItems:      'center',
    justifyContent:  'center',
    position:        'relative',
  },
  // Wifi-off icon (simplified)
  wifiBase: {
    width:        18,
    height:       10,
    borderWidth:   2,
    borderColor:   GRAY,
    borderRadius:  10,
    borderBottomWidth: 0,
  },
  wifiSlash: {
    position:        'absolute',
    width:            22,
    height:            2,
    backgroundColor:  GRAY,
    borderRadius:      1,
    transform:        [{ rotate: '45deg' }],
  },
  cardText: { flex: 1 },
  cardTitle: {
    fontSize:   15,
    fontWeight: '700',
    color:      WHITE,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 13,
    color:    GRAY,
    lineHeight: 18,
  },
  meshActionWrap: {
    marginTop: 12,
    alignItems: 'flex-start',
  },
  meshActionBtn: {
    backgroundColor: '#3A3A3A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  meshActionBtnActive: {
    backgroundColor: '#4A7FA5',
  },
  meshActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: WHITE,
  },

  // ── Section title ──
  sectionTitle: {
    fontSize:     16,
    fontWeight:   '700',
    color:        WHITE,
    marginBottom: 12,
  },

  // ── Data rows ──
  dataRow: {
    backgroundColor:  CARD_BG,
    borderRadius:     14,
    padding:          16,
    flexDirection:    'row',
    alignItems:       'center',
    marginBottom:     10,
    gap:              14,
  },
  dataIconWrap: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: '#2A2A2A',
    alignItems:      'center',
    justifyContent:  'center',
  },
  // Download arrow ↓
  downloadArrow: {
    width:        2,
    height:       14,
    backgroundColor: GREEN,
    borderRadius: 1,
    // Arrow head via border trick done with View below
  },
  // Upload arrow ↑
  uploadArrow: {
    width:        2,
    height:       14,
    backgroundColor: BLUE,
    borderRadius: 1,
  },
  dataText: { flex: 1 },
  dataTitle: {
    fontSize:   14,
    fontWeight: '600',
    color:      WHITE,
    marginBottom: 2,
  },
  dataSub: {
    fontSize: 12,
    color:    GRAY,
  },
  // Check circle
  checkCircle: {
    width:          26,
    height:         26,
    borderRadius:   13,
    borderWidth:     2,
    borderColor:    GREEN,
    alignItems:     'center',
    justifyContent: 'center',
  },
  checkCircleOrange: {
    borderColor: ORANGE,
  },
  checkMark: {
    width:         10,
    height:         6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor:   GREEN,
    transform:     [{ rotate: '-45deg' }],
    marginTop:      2,
  },

  // ── Sync button ──
  syncBtn: {
    backgroundColor:  CARD_BG,
    borderRadius:     14,
    paddingVertical:  16,
    alignItems:       'center',
    marginTop:         8,
    marginBottom:     12,
    borderWidth:       1,
    borderColor:       BORDER,
  },
  syncBtnActive: {
    backgroundColor: '#1A3D5A',
    borderColor:     BLUE,
  },
  syncBtnDisabled: {
    opacity: 0.4,
  },
  syncBtnText: {
    fontSize:   15,
    fontWeight: '700',
    color:      WHITE,
    letterSpacing: 0.3,
  },

  // ── Progress card ──
  progressCard: {
    backgroundColor: CARD_BG,
    borderRadius:    14,
    padding:         16,
    marginBottom:    12,
  },
  progressTitle: {
    fontSize:   15,
    fontWeight: '700',
    color:      WHITE,
    marginBottom: 12,
  },
  progressBarBg: {
    height:          8,
    backgroundColor: '#2A2A2A',
    borderRadius:    4,
    overflow:        'hidden',
    marginBottom:    10,
  },
  progressBarFill: {
    height:          '100%',
    backgroundColor:  GREEN,
    borderRadius:     4,
  },
  progressSub: {
    fontSize: 12,
    color:    GRAY,
  },

  // ── Last sync row ──
  lastSyncRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingVertical:  16,
    borderTopWidth:    1,
    borderTopColor:   BORDER,
    marginTop:         4,
  },
  lastSyncLabel: {
    fontSize: 14,
    color:    GRAY,
  },
  lastSyncValue: {
    fontSize:   14,
    fontWeight: '700',
    color:      WHITE,
  },
});
