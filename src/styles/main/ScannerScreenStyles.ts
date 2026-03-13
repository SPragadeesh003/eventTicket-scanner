import { StyleSheet, Platform, Dimensions } from 'react-native';
import { COLORS } from '@/constants/color';

const { width, height } = Dimensions.get('window');
const VIEWFINDER = width * 0.6;

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.DARK_BG,
  },

  // ── Camera ──
  camera: {
    flex: 1,
  },

  // ── Overlay (covers entire camera) ──
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    gap: 100
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
  headerBtn: {
    width: 40,
    height: 40,
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
  trashIcon: {
    width: 18,
    height: 22,
    borderWidth: 1.5,
    borderColor: COLORS.WHITE,
    borderRadius: 2,
  },
  // ── Mesh Pill ──
  meshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.CARD_BG,
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
    color: COLORS.WHITE,
  },

  // ── Viewfinder ──
  viewfinderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  viewfinder: {
    width: VIEWFINDER,
    height: VIEWFINDER,
  },
  // Corner brackets
  cornerTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: COLORS.SUCCESS,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: COLORS.SUCCESS,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: COLORS.SUCCESS,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: COLORS.SUCCESS,
    borderBottomRightRadius: 8,
  },
  scanLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: '50%',
    height: 2,
    backgroundColor: COLORS.SUCCESS,
    opacity: 0.5,
  },

  // ── Bottom section ──
  bottomSection: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: Platform.OS === 'android' ? 32 : 44,
    alignItems: 'center',
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    marginBottom: 12,
    gap: 10,
  },
  manualIcon: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: COLORS.WHITE,
    borderRadius: 9,
  },
  manualText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.WHITE,
  },
  demoHint: {
    fontSize: 12,
    color: COLORS.INVALID_RED,
  },

  // ── Permission screen ──
  permissionWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.DARK_BG,
    padding: 32,
  },
  permissionText: {
    fontSize: 16,
    color: COLORS.GRAY,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionBtn: {
    backgroundColor: COLORS.SUCCESS,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  permissionBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.DARK_BG,
  },

  // ── Result overlay ──
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  resultValid: {
    backgroundColor: COLORS.VALID_GREEN,
  },
  resultDuplicate: {
    backgroundColor: COLORS.INVALID_RED,
  },
  resultInvalid: {
    backgroundColor: COLORS.INVALID_RED,
  },
  resultIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  checkMark: {
    width: 20,
    height: 36,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderColor: COLORS.WHITE,
    transform: [{ rotate: '45deg' }],
  },
  crossMark: {
    width: 28,
    height: 28,
  },
  crossLine1: {
    position: 'absolute',
    width: 34,
    height: 4,
    backgroundColor: COLORS.WHITE,
    top: 12,
    left: -3,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  crossLine2: {
    position: 'absolute',
    width: 34,
    height: 4,
    backgroundColor: COLORS.WHITE,
    top: 12,
    left: -3,
    borderRadius: 2,
    transform: [{ rotate: '-45deg' }],
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.RESULT_DARK,
    textAlign: 'center',
    marginBottom: 8,
  },
  resultName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.BORDER,
    textAlign: 'center',
    marginBottom: 4,
  },
  resultType: {
    fontSize: 15,
    color: COLORS.MID_GRAY,
    textAlign: 'center',
    marginBottom: 4,
  },
  resultId: {
    fontSize: 13,
    color: COLORS.RESULT_GRAY,
    textAlign: 'center',
  },
  resultTitleWhite: {
    color: COLORS.WHITE,
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
