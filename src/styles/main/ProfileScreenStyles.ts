import { StyleSheet } from 'react-native';
import { COLORS } from '@/constants/color';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.DARK_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.WHITE,
    marginLeft: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.GRAY,
    marginBottom: 10,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: COLORS.CARD_BG,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContent: {
    flex: 1,
    marginLeft: 12,
  },
  rowLabel: {
    fontSize: 12,
    color: COLORS.GRAY,
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.WHITE,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.BORDER,
    marginLeft: 60,
  },
  statusActive: {
    color: COLORS.SUCCESS,
  },
});
