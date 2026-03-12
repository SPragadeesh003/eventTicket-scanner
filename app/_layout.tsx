import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ROUTES } from '@/constants/routes';
import React from 'react';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name={ROUTES.LOGIN} options={{ headerShown: false }} />
        <Stack.Screen name={ROUTES.SET_PASSWORD} options={{ headerShown: false }} />
        <Stack.Screen name={ROUTES.HOME} options={{ headerShown: false }} />
        <Stack.Screen name={ROUTES.EVENT_DETAIL} options={{ headerShown: false }} />
        <Stack.Screen name={ROUTES.SCANNER} options={{ headerShown: false }} />
        <Stack.Screen name={ROUTES.TICKET_SEARCH} options={{ headerShown: false }} />
        <Stack.Screen name={ROUTES.TICKET_DETAIL} options={{ headerShown: false }} />
        <Stack.Screen name={ROUTES.SYNC_STATUS} options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="inverted" />
    </ThemeProvider>
  );
}
