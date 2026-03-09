// eecs/app/_layout.js
import React from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { Feather } from '@expo/vector-icons';
import { ThemeProvider } from './context/ThemeContext';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...Feather.font,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
