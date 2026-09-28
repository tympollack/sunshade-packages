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
  type SelectableTileVariant,
  VARIANT_CONTRAST_TOKENS,
  CONTRAST_TYPOGRAPHY,
} from '../../tokens/contrast';

export interface SelectableTileProps {
  selected: boolean;
  variant: SelectableTileVariant;
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
  const token = VARIANT_CONTRAST_TOKENS[variant] || VARIANT_CONTRAST_TOKENS.stone;

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
          backgroundColor: token.effectiveSurfaceHex,
          borderColor: selected ? token.accent : 'rgba(255, 255, 255, 0.1)',
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
            style={{ color: CONTRAST_TYPOGRAPHY.title.color }}
          >
            {title}
          </Text>
          {trailing}
        </View>
        <Text
          className="text-xs mt-0.5"
          style={{ color: CONTRAST_TYPOGRAPHY.description.color }}
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
