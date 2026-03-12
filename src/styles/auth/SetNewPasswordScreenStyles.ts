import { StyleSheet } from 'react-native';

const DARK_BG  = '#141414';
const INPUT_BG = '#242424';
const BTN_BLUE = '#4A7FA5';
const WHITE    = '#FFFFFF';
const GRAY     = '#888888';
const GREEN    = '#00C896';
const RED      = '#E53935';

export const eyeStyles = StyleSheet.create({
  container: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  oval:   { width: 20, height: 14, borderRadius: 10, borderWidth: 2, borderColor: '#888', position: 'absolute' },
  pupil:  { width: 7,  height: 7,  borderRadius: 4,  backgroundColor: '#888', position: 'absolute' },
  slash:  { width: 24, height: 2,  backgroundColor: '#888', position: 'absolute', transform: [{ rotate: '45deg' }] },
});

export const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: DARK_BG },
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
    backgroundColor: '#3A6B8A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  lockShackle: {
    width: 20,
    height: 14,
    borderWidth: 3,
    borderColor: WHITE,
    borderBottomWidth: 0,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    marginBottom: -2,
  },
  lockBody: {
    width: 28,
    height: 22,
    backgroundColor: WHITE,
    borderRadius: 5,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: WHITE,
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: GRAY,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.2,
  },

  // ── Form ──
  form: {},
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: WHITE,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: 12,
  },
  input: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 15,
    color: WHITE,
    letterSpacing: 0.3,
  },
  eyeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  // ── Rules ──
  rulesBox: {
    marginTop: 12,
    backgroundColor: '#1C1C1C',
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
    backgroundColor: '#444',
  },
  ruleDotPassed: {
    backgroundColor: GREEN,
  },
  ruleText: {
    fontSize: 13,
    color: '#666',
  },
  ruleTextPassed: {
    color: GREEN,
  },

  // ── Match ──
  matchText: { fontSize: 13, marginTop: 8, marginLeft: 4 },
  matchOk:   { color: GREEN },
  matchFail: { color: RED },

  // ── Button ──
  btn: {
    backgroundColor: BTN_BLUE,
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 28,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  // ── Footer ──
  footer: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 'auto',
    paddingTop: 36,
    letterSpacing: 0.2,
  },
});
