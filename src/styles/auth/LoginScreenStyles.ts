import { StyleSheet } from "react-native";
import { Colors } from "@/constants/color";

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingTop: 72,
    paddingBottom: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: Colors.dark.iconBox,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 36,
    height: 36,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderColor: Colors.dark.text,
    borderWidth: 2.5,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 3,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 3,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 3,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 3,
  },
  appTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.dark.text,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  appSubtitle: {
    fontSize: 16,
    color: Colors.dark.tabIconDefault,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  form: {
    marginTop: 48,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 20,
  },
  required: {
    color: Colors.dark.error,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 3,
    marginTop: -2,
  },
  input: {
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 15,
    color: Colors.dark.text,
    letterSpacing: 0.3,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },

  loginBtn: {
    backgroundColor: Colors.dark.tint,
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 28,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: Colors.dark.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  forgotBtn: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 4,
  },
  forgotText: {
    color: Colors.dark.icon,
    fontSize: 14,
    fontWeight: '500',
  },

  footer: {
    color: Colors.dark.tabIconDefault,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 'auto',
    paddingTop: 40,
    letterSpacing: 0.2,
  },
});

export default styles;