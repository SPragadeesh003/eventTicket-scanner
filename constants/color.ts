export const COLORS = {
    DARK_BG: '#141414',
    INPUT_BG: '#242424',
    BTN_BLUE: '#4A7FA5',
    ACCENT_BLUE: '#5B9EC9',
    WHITE: '#FFFFFF',
    GRAY: '#888888',
    LABEL: '#FFFFFF',
    ERROR: '#E53935',
    ICON_BOX: '#3A6B8A',
    BLACK: '#000000',
    TRANSPARENT: 'transparent',
};

export const Colors = {
    light: {
        text: '#000000',
        background: '#FFFFFF',
        tint: COLORS.BTN_BLUE,
        icon: COLORS.BTN_BLUE,
        tabIconDefault: COLORS.GRAY,
        tabIconSelected: COLORS.BTN_BLUE,
        inputBackground: '#F0F0F0',
        error: COLORS.ERROR,
    },
    dark: {
        text: COLORS.LABEL,
        background: COLORS.DARK_BG,
        tint: COLORS.BTN_BLUE,
        icon: COLORS.ACCENT_BLUE,
        tabIconDefault: COLORS.GRAY,
        tabIconSelected: COLORS.ACCENT_BLUE,
        inputBackground: COLORS.INPUT_BG,
        error: COLORS.ERROR,
        iconBox: COLORS.ICON_BOX,
    },
};
