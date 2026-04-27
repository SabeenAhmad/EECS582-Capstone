// context/ThemeContext.js
/*
Names: Anna Ross
Description: Defines a theme context that manages light and dark mode settings, persists user preferences, and provides theme data to the application.
*/
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext(null);

const STORAGE_KEY = '@app_theme';

const lightColors = {
  background: '#ffffff',
  text: '#222222',
  bannerBackground: '#ff4444',
  bannerText: '#ffffff',
  buttonBackground: '#222222',
  buttonText: '#ffffff',
  feedbackButtonBackground: '#222222',
  searchBackground: '#ffffff',
  searchBorder: '#eee',
  modalBackground: '#ffffff',
  modalText: '#222222',
  inputBorder: '#ddd',
  starEmpty: '#ddd',
  starFilled: '#FFD700',
};

const darkColors = {
  background: '#050816',
  text: '#f5f5f5',
  bannerBackground: '#b91c1c',
  bannerText: '#ffffff',
  buttonBackground: '#f5f5f5',
  buttonText: '#050816',
  feedbackButtonBackground: '#111111',
  searchBackground: '#111111',
  searchBorder: '#333',
  modalBackground: '#111111',
  modalText: '#f5f5f5',
  inputBorder: '#333',
  starEmpty: '#555',
  starFilled: '#FFD700',
};

// Provider
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
          setTheme(stored);
        }
      } catch (e) {
        console.warn('Error loading theme from storage', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const toggleTheme = async () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      console.warn('Error saving theme to storage', e);
    }
  };

  const value = {
    theme,
    toggleTheme,
    colors: theme === 'light' ? lightColors : darkColors,
  };

  if (!loaded) {
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
