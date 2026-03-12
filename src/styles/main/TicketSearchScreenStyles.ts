import { StyleSheet, Platform } from 'react-native';

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

  // ── Search bar ──
  searchBarWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:    CARD_BG,
    marginHorizontal:   16,
    marginBottom:       12,
    borderRadius:       12,
    paddingHorizontal:  14,
    paddingVertical:    Platform.OS === 'android' ? 4 : 10,
  },
  searchIconWrap: {
    width: 18, height: 18,
    marginRight: 10,
    position: 'relative',
  },
  searchCircle: {
    width: 11, height: 11,
    borderRadius: 6,
    borderWidth: 2, borderColor: GRAY,
    position: 'absolute', top: 0, left: 0,
  },
  searchHandle: {
    width: 2, height: 6,
    backgroundColor: GRAY,
    position: 'absolute', bottom: 0, right: 1,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: WHITE,
    paddingVertical: 6,
  },

  // ── Body (list + sidebar) ──
  body: {
    flex: 1,
    flexDirection: 'row',
  },

  // ── Section list ──
  listContent: {
    paddingLeft:   16,
    paddingRight:  36, // leave space for sidebar
    paddingBottom: 32,
  },
  sectionHeader: {
    backgroundColor: DARK_BG,
    paddingVertical:  6,
    paddingLeft:      4,
  },
  sectionLetter: {
    fontSize:   14,
    fontWeight: '700',
    color:      GRAY,
    letterSpacing: 0.5,
  },

  // ── Ticket item ──
  ticketItem: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor:  CARD_BG,
    borderRadius:    12,
    marginBottom:     8,
    paddingHorizontal: 14,
    paddingVertical:   14,
    minHeight:         68,
  },
  ticketInfo: {
    flex: 1,
    marginRight: 10,
  },
  ticketName: {
    fontSize:   15,
    fontWeight: '600',
    color:      WHITE,
    marginBottom: 4,
  },
  ticketMeta: {
    fontSize: 12,
    color:    GRAY,
  },

  // ── Status badge ──
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical:    5,
    borderRadius:      20,
  },
  badgeValid: {
    backgroundColor: 'rgba(0,200,150,0.15)',
  },
  badgeScanned: {
    backgroundColor: '#2A2A2A',
  },
  statusText: {
    fontSize:   12,
    fontWeight: '600',
  },
  statusGreen: { color: GREEN },
  statusGray:  { color: GRAY },

  // ── A-Z sidebar ──
  sidebar: {
    position:       'absolute',
    right:           4,
    top:             0,
    bottom:          0,
    justifyContent: 'center',
    alignItems:     'center',
    paddingVertical: 8,
  },
  sidebarBtn: {
    paddingVertical:    1.5,
    paddingHorizontal:  4,
    alignItems:        'center',
  },
  sidebarLetter: {
    fontSize:   11,
    fontWeight: '600',
    color:      GRAY,
  },

  // ── Empty ──
  emptyWrap: {
    paddingTop:     80,
    alignItems:    'center',
  },
  emptyText: {
    fontSize: 15,
    color:    GRAY,
  },
});
