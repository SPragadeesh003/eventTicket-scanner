import { StyleSheet, Platform } from 'react-native';
import { COLORS } from '@/constants/color';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.DARK_BG,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: 16,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.WHITE,
    letterSpacing: 0.3,
  },
  topBarBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  userIconWrap: { alignItems: 'center' },
  userHead: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.WHITE,
  },
  userBody: {
    width: 22,
    height: 10,
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.WHITE,
    borderBottomWidth: 0,
    marginTop: 2,
  },

  logoutWrap: {
    width: 22,
    height: 20,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBox: {
    width: 16,
    height: 18,
    borderWidth: 2,
    borderColor: COLORS.WHITE,
    borderRadius: 3,
    position: 'absolute',
    left: 0,
  },
  logoutArrow: {
    width: 10,
    height: 2,
    backgroundColor: COLORS.WHITE,
    position: 'absolute',
    right: 0,
  },

  tabRow: {
    flexDirection: 'row',
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
    marginBottom: 8,
  },
  tabBtn: {
    marginRight: 28,
    paddingBottom: 12,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.GRAY,
  },
  tabTextActive: {
    color: COLORS.WHITE,
    fontWeight: '600',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.SUCCESS,
    borderRadius: 1,
  },

  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.WHITE,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  cardMetaText: {
    fontSize: 13,
    color: COLORS.GRAY,
    marginLeft: 6,
  },

  iconWrap: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarOuter: {
    width: 13,
    height: 13,
    borderWidth: 1.5,
    borderColor: COLORS.GRAY,
    borderRadius: 2,
  },
  calendarTop: {
    height: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.GRAY,
  },
  calendarBody: { flex: 1 },

  locationPin: {
    width: 10,
    height: 12,
    borderWidth: 1.5,
    borderColor: COLORS.GRAY,
    borderRadius: 5,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  locationDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.GRAY,
    marginTop: -2,
  },

  chevron: {
    width: 8,
    height: 8,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: COLORS.GRAY,
    transform: [{ rotate: '45deg' }],
    marginLeft: 8,
  },


  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.GRAY,
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 13,
    color: COLORS.MUTED,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
