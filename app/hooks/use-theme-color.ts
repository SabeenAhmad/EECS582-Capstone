/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/

Names: 
Date: 
Description: Provides a helper function to retrieve theme-based colors, selecting light or dark mode values based on the current color scheme.
*/

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
