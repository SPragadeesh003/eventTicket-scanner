import { StyleSheet, Platform, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const CARD_W    = (width - 48) / 2;  // two cards per row with padding

const DARK_BG  = '#141414';
const CARD_BG  = '#1E1E1E';
const WHITE    = '#FFFFFF';
const GRAY     = '#888888';
const GREEN    = '#00C896';
const BORDER   = '#2A2A2A';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DARK_BG,
  },

  // ── Header ──
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 16,
    paddingTop:       Platform.OS === 'android' ? 48 : 56,
    paddingBottom:    14,
  },
  backBtn: {
    width:  36,
    height: 36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  backArrow: {
    width:           10,
    height:          10,
    borderLeftWidth:  2,
    borderBottomWidth: 2,
    borderColor:      WHITE,
    transform:        [{ rotate: '45deg' }],
  },
  headerTitle: {
    fontSize:   17,
    fontWeight: '700',
    color:      WHITE,
    letterSpacing: 0.2,
  },

  // ── Scroll ──
  scroll: {
    paddingHorizontal: 16,
    paddingBottom:     180,
  },

  // ── Badges ──
  badgeRow: {
    flexDirection: 'row',
    marginBottom:   8,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical:    6,
    borderRadius:      20,
    marginRight:        8,
  },
  badgeGreen: { backgroundColor: '#1A3D2E' },
  badgeGray:  { backgroundColor: '#2A2A2A' },
  badgeText: {
    fontSize:   13,
    fontWeight: '600',
    color:      GREEN,
  },

  // ── Online row ──
  onlineRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  16,
  },
  onlineDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
    marginRight:  6,
  },
  dotGreen: { backgroundColor: GREEN },
  dotGray:  { backgroundColor: GRAY },
  onlineText: {
    fontSize:   13,
    fontWeight: '600',
  },
  textGreen: { color: GREEN },
  textGray:  { color: GRAY },
  lastSyncText: {
    fontSize: 12,
    color:    GRAY,
    marginLeft: 4,
  },

  // ── Info card ──
  infoCard: {
    backgroundColor: CARD_BG,
    borderRadius:    14,
    padding:         18,
    marginBottom:    24,
  },
  infoTitle: {
    fontSize:     18,
    fontWeight:   '700',
    color:        WHITE,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginTop:      8,
  },
  infoText: {
    fontSize:  14,
    color:     GRAY,
    marginLeft: 8,
  },

  // ── Location pin icon ──
  locationPin: {
    width:        10,
    height:       12,
    borderWidth:   1.5,
    borderColor:   GRAY,
    borderRadius:  5,
    borderBottomLeftRadius:  0,
    borderBottomRightRadius: 0,
  },

  // ── Calendar icon ──
  calendarIcon: {
    width:        12,
    height:       12,
    borderWidth:   1.5,
    borderColor:   GRAY,
    borderRadius:  2,
  },

  // ── Section title ──
  sectionTitle: {
    fontSize:     16,
    fontWeight:   '700',
    color:        WHITE,
    marginBottom: 12,
  },

  // ── Stats grid ──
  statsGrid: {
    flexDirection: 'row',
    gap:           10,
    marginBottom:  10,
  },
  statCard: {
    flex:            1,
    backgroundColor: CARD_BG,
    borderRadius:    12,
    padding:         16,
    minHeight:       80,
  },
  statCardHighlight: {
    backgroundColor: '#1A3D2E',
    borderWidth:      1,
    borderColor:      '#2A6B4A',
  },
  statCardFull: {
    flex: 1,
  },
  statLabel: {
    fontSize:     12,
    color:        GRAY,
    marginBottom:  8,
  },
  statLabelHighlight: {
    color: '#5BC99A',
  },
  statValue: {
    fontSize:   22,
    fontWeight: '700',
    color:      WHITE,
  },
  statValueHighlight: {
    color: GREEN,
  },

  // ── Bottom bar ──
  bottomBar: {
    position:        'absolute',
    bottom:           0,
    left:             0,
    right:            0,
    backgroundColor:  DARK_BG,
    paddingHorizontal: 16,
    paddingBottom:    Platform.OS === 'android' ? 20 : 34,
    paddingTop:       12,
    borderTopWidth:    1,
    borderTopColor:    BORDER,
  },

  // ── Scan button ──
  scanBtn: {
    backgroundColor: GREEN,
    borderRadius:    14,
    paddingVertical: 16,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    12,
    gap:             10,
  },
  scanBtnDim: {
    opacity: 0.5,
  },
  scanIcon: {
    width:         20,
    height:        20,
    borderWidth:    2,
    borderColor:   '#141414',
    borderRadius:   4,
  },
  scanBtnText: {
    fontSize:   16,
    fontWeight: '700',
    color:      '#141414',
  },

  // ── Action buttons row ──
  bottomActions: {
    flexDirection:  'row',
    gap:            10,
    marginBottom:   10,
  },
  actionBtn: {
    flex:            1,
    backgroundColor: CARD_BG,
    borderRadius:    12,
    paddingVertical: 13,
    alignItems:      'center',
  },
  actionText: {
    fontSize:   14,
    fontWeight: '600',
    color:      WHITE,
  },

  // ── Sync status button ──
  syncStatusBtn: {
    alignItems:    'center',
    paddingVertical: 6,
  },
  syncStatusText: {
    fontSize:   14,
    color:      GRAY,
    fontWeight: '500',
  },

  // ── Modal ──
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  modalBox: {
    backgroundColor: '#1E1E1E',
    borderRadius:    20,
    padding:         32,
    width:           width - 64,
    alignItems:      'center',
  },
  modalTitle: {
    fontSize:   20,
    fontWeight: '700',
    color:      WHITE,
    marginTop:  16,
    marginBottom: 8,
  },
  modalSub: {
    fontSize:     14,
    color:        GRAY,
    marginBottom: 16,
  },
  progressBarBg: {
    width:           '100%',
    height:           8,
    backgroundColor:  '#2A2A2A',
    borderRadius:     4,
    overflow:        'hidden',
    marginBottom:     8,
  },
  progressBarFill: {
    height:          '100%',
    backgroundColor:  GREEN,
    borderRadius:     4,
  },
  progressPercent: {
    fontSize:     13,
    color:        GREEN,
    fontWeight:   '600',
    marginBottom: 16,
  },
  modalHint: {
    fontSize: 12,
    color:    '#555',
  },
});
