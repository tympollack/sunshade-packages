import React from 'react';
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { cn } from '../../utils/cn';
import {
  type AnyContrastVariant,
  type ContrastThemeMode,
  CONTRAST_TYPOGRAPHY,
  PAIRED_TYPOGRAPHY,
  resolveContrastToken,
} from '../../tokens/contrast';

export interface SelectableTileProps {
  selected: boolean;
  variant: AnyContrastVariant;
  theme?: ContrastThemeMode;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  onPress?: () => void;
  disabled?: boolean;
  as?: 'button' | 'div';
  className?: string;
  style?: ViewStyle;
  trailing?: React.ReactNode;
  testID?: string;
}

/**
 * SelectableTile - Native implementation for React Native / Expo.
 * Uses native Pressable, View, Text primitives with strict opaque dark background.
 */
export function SelectableTile({
  selected,
  variant = 'stone',
  theme = 'dark',
  icon,
  title,
  description,
  onClick,
  onPress,
  disabled = false,
  className,
  style,
  trailing,
  testID,
}: SelectableTileProps) {
  const token = resolveContrastToken(variant);
  const typography = theme === 'light' ? PAIRED_TYPOGRAPHY.light : CONTRAST_TYPOGRAPHY;
  const effectiveSurfaceHex =
    theme === 'light' ? token.effectiveLightSurfaceHex : token.effectiveSurfaceHex;

  const handlePress = () => {
    if (disabled) return;
    if (onPress) {
      onPress();
    } else if (onClick) {
      onClick();
    }
  };

  const containerClasses = cn(
    'w-full flex-row items-center gap-3.5 p-4 rounded-2xl border',
    token.borderStrokeClass,
    disabled && 'opacity-50',
    className
  );

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={handlePress}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      // @ts-ignore className in NativeWind
      className={containerClasses}
      style={[
        styles.tileBase,
        {
          backgroundColor: effectiveSurfaceHex,
          borderColor: selected ? token.accent : theme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
          borderWidth: selected ? 2 : 1,
        },
        style,
      ]}
    >
      {/* Icon Badge */}
      <View
        // @ts-ignore className in NativeWind
        className={cn('w-10 h-10 rounded-xl items-center justify-center border border-white/10', token.iconBgClass)}
        style={styles.iconContainer}
      >
        {icon}
      </View>

      {/* Typography container */}
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text
            className="font-semibold text-base"
            style={{ color: typography.title.color }}
          >
            {title}
          </Text>
          {trailing}
        </View>
        <Text
          className="text-xs mt-0.5"
          style={{ color: typography.description.color }}
          numberOfLines={2}
        >
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tileBase: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SelectableTile;
