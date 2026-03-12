import { StyleSheet, Platform, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');
const VIEWFINDER = width * 0.6;

const DARK_BG = '#0A0A0A';
const WHITE   = '#FFFFFF';
const GREEN   = '#00C896';
const GRAY    = '#888888';

export const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: DARK_BG,
  },

  // ── Camera ──
  camera: {
    flex: 1,
  },

  // ── Overlay (covers entire camera) ──
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },

  // ── Header ──
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingTop:        Platform.OS === 'android' ? 48 : 56,
    paddingBottom:     14,
  },
  headerBtn: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
  },
  backArrow: {
    width:              10,
    height:             10,
    borderLeftWidth:    2,
    borderBottomWidth:  2,
    borderColor:        WHITE,
    transform:          [{ rotate: '45deg' }],
  },
  trashIcon: {
    width:        18,
    height:       22,
    borderWidth:  1.5,
    borderColor:  WHITE,
    borderRadius: 2,
  },
  // ── Mesh Pill ──
  meshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  meshDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  meshText: {
    fontSize: 12,
    fontWeight: '600',
    color: WHITE,
  },

  // ── Viewfinder ──
  viewfinderWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  viewfinder: {
    width:  VIEWFINDER,
    height: VIEWFINDER,
  },
  // Corner brackets
  cornerTL: {
    position:       'absolute',
    top:            -2,
    left:           -2,
    width:          30,
    height:         30,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor:    GREEN,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    position:        'absolute',
    top:             -2,
    right:           -2,
    width:           30,
    height:          30,
    borderTopWidth:  3,
    borderRightWidth: 3,
    borderColor:     GREEN,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    position:          'absolute',
    bottom:            -2,
    left:              -2,
    width:             30,
    height:            30,
    borderBottomWidth: 3,
    borderLeftWidth:   3,
    borderColor:       GREEN,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    position:           'absolute',
    bottom:             -2,
    right:              -2,
    width:              30,
    height:             30,
    borderBottomWidth:  3,
    borderRightWidth:   3,
    borderColor:        GREEN,
    borderBottomRightRadius: 8,
  },
  scanLine: {
    position:        'absolute',
    left:            8,
    right:           8,
    top:             '50%',
    height:          2,
    backgroundColor: GREEN,
    opacity:         0.5,
  },

  // ── Bottom section ──
  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom:     Platform.OS === 'android' ? 32 : 44,
    alignItems:        'center',
  },
  manualBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    backgroundColor:   '#1E1E1E',
    borderRadius:      14,
    paddingVertical:   16,
    paddingHorizontal: 24,
    width:             '100%',
    marginBottom:      12,
    gap:               10,
  },
  manualIcon: {
    width:        18,
    height:       18,
    borderWidth:  2,
    borderColor:  WHITE,
    borderRadius: 9,
  },
  manualText: {
    fontSize:   16,
    fontWeight: '600',
    color:      WHITE,
  },
  demoHint: {
    fontSize: 12,
    color:    '#FF6B6B',
  },

  // ── Permission screen ──
  permissionWrap: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: DARK_BG,
    padding:         32,
  },
  permissionText: {
    fontSize:     16,
    color:        GRAY,
    textAlign:    'center',
    marginBottom: 20,
  },
  permissionBtn: {
    backgroundColor: GREEN,
    borderRadius:    12,
    paddingVertical:  14,
    paddingHorizontal: 28,
  },
  permissionBtnText: {
    fontSize:   16,
    fontWeight: '700',
    color:      '#141414',
  },

  // ── Result overlay ──
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  resultValid: {
    backgroundColor: '#6BCB77',
  },
  resultDuplicate: {
    backgroundColor: '#FF6B6B',
  },
  resultInvalid: {
    backgroundColor: '#FF6B6B',
  },
  resultIconWrap: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    24,
  },
  checkMark: {
    width:              20,
    height:             36,
    borderRightWidth:   4,
    borderBottomWidth:  4,
    borderColor:        WHITE,
    transform:          [{ rotate: '45deg' }],
  },
  crossMark: {
    width:   28,
    height:  28,
  },
  crossLine1: {
    position:        'absolute',
    width:           34,
    height:          4,
    backgroundColor: WHITE,
    top:             12,
    left:            -3,
    borderRadius:    2,
    transform:       [{ rotate: '45deg' }],
  },
  crossLine2: {
    position:        'absolute',
    width:           34,
    height:          4,
    backgroundColor: WHITE,
    top:             12,
    left:            -3,
    borderRadius:    2,
    transform:       [{ rotate: '-45deg' }],
  },
  resultTitle: {
    fontSize:   28,
    fontWeight: '800',
    color:      '#1A1A1A',
    textAlign:  'center',
    marginBottom: 8,
  },
  resultName: {
    fontSize:   18,
    fontWeight: '700',
    color:      '#2A2A2A',
    textAlign:  'center',
    marginBottom: 4,
  },
  resultType: {
    fontSize:   15,
    color:      '#3A3A3A',
    textAlign:  'center',
    marginBottom: 4,
  },
  resultId: {
    fontSize:   13,
    color:      '#4A4A4A',
    textAlign:  'center',
  },
  resultTitleWhite: {
    color: WHITE,
  },
  resultNameWhite: {
    color: 'rgba(255,255,255,0.9)',
  },
  resultTypeWhite: {
    color: 'rgba(255,255,255,0.75)',
  },
  resultIdWhite: {
    color: 'rgba(255,255,255,0.6)',
  },
});
