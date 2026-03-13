import { StyleSheet } from 'react-native';
import { COLORS } from '@/constants/color';

export const eyeStyles = StyleSheet.create({
  container: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  oval:   { width: 20, height: 14, borderRadius: 10, borderWidth: 2, borderColor: COLORS.GRAY, position: 'absolute' },
  pupil:  { width: 7,  height: 7,  borderRadius: 4,  backgroundColor: COLORS.GRAY, position: 'absolute' },
  slash:  { width: 24, height: 2,  backgroundColor: COLORS.GRAY, position: 'absolute', transform: [{ rotate: '45deg' }] },
});

export const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: COLORS.DARK_BG },
  flex:  { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingTop: 64,
    paddingBottom: 40,
  },

  // ── Header ──
  header: { alignItems: 'center', marginBottom: 40 },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.ICON_BOX,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  lockShackle: {
    width: 20,
    height: 14,
    borderWidth: 3,
    borderColor: COLORS.WHITE,
    borderBottomWidth: 0,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    marginBottom: -2,
  },
  lockBody: {
    width: 28,
    height: 22,
    backgroundColor: COLORS.WHITE,
    borderRadius: 5,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.WHITE,
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.GRAY,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.2,
  },

  // ── Form ──
  form: {},
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.WHITE,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.INPUT_BG,
    borderRadius: 12,
  },
  input: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 15,
    color: COLORS.WHITE,
    letterSpacing: 0.3,
  },
  eyeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  // ── Rules ──
  rulesBox: {
    marginTop: 12,
    backgroundColor: COLORS.DARK_GRAY,
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ruleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.DOT_GRAY,
  },
  ruleDotPassed: {
    backgroundColor: COLORS.SUCCESS,
  },
  ruleText: {
    fontSize: 13,
    color: COLORS.TEXT_MUTED,
  },
  ruleTextPassed: {
    color: COLORS.SUCCESS,
  },

  // ── Match ──
  matchText: { fontSize: 13, marginTop: 8, marginLeft: 4 },
  matchOk:   { color: COLORS.SUCCESS },
  matchFail: { color: COLORS.ERROR },

  // ── Button ──
  btn: {
    backgroundColor: COLORS.BTN_BLUE,
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 28,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: {
    color: COLORS.WHITE,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  // ── Footer ──
  footer: {
    color: COLORS.MUTED,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 'auto',
    paddingTop: 36,
    letterSpacing: 0.2,
  },
});
