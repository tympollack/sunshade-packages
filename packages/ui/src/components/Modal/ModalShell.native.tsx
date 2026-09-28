import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { cn } from '../../utils/cn';

export interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  backdropClassName?: string;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
  hideCloseButton?: boolean;
  closeButtonClassName?: string;
  closeAriaLabel?: string;
  testID?: string;
  headerExtra?: React.ReactNode;
}

/**
 * ModalShell - Native implementation for React Native / Expo.
 * Uses native <Modal> primitive with zero DOM or react-dom dependencies.
 */
export function ModalShell({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  backdropClassName,
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
  hideCloseButton = false,
  closeButtonClassName,
  testID = 'modal-shell',
  headerExtra,
}: ModalShellProps) {
  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <View
        // @ts-ignore className in NativeWind
        className={cn(
          'flex-1 items-center justify-center p-4 bg-black/70',
          backdropClassName
        )}
        style={styles.backdrop}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close overlay"
        />

        <View
          // @ts-ignore className in NativeWind
          className={cn(
            'w-full max-w-md max-h-[85%] flex-col rounded-3xl bg-[#1A1A1A] border border-stone-800 overflow-hidden shadow-2xl',
            className
          )}
          style={styles.modalFrame}
        >
          {/* Pinned Header */}
          {(title || icon || !hideCloseButton) && (
            <View
              // @ts-ignore className in NativeWind
              className={cn(
                'shrink-0 p-5 pb-3 border-b border-white/5 flex-row items-center justify-between',
                headerClassName
              )}
            >
              <View className="flex-row items-center gap-3 flex-1">
                {icon && (
                  <View className="w-10 h-10 rounded-2xl bg-amber-500/15 items-center justify-center border border-amber-500/30">
                    {icon}
                  </View>
                )}
                <View className="flex-1">
                  {typeof title === 'string' ? (
                    <Text className="text-lg font-bold text-stone-100">{title}</Text>
                  ) : (
                    title
                  )}
                  {typeof subtitle === 'string' ? (
                    <Text className="text-xs font-medium text-stone-400 mt-0.5">
                      {subtitle}
                    </Text>
                  ) : (
                    subtitle
                  )}
                </View>
              </View>

              <View className="flex-row items-center gap-2">
                {headerExtra}
                {!hideCloseButton && (
                  <Pressable
                    onPress={onClose}
                    // @ts-ignore className in NativeWind
                    className={cn(
                      'w-10 h-10 rounded-full items-center justify-center bg-white/5',
                      closeButtonClassName
                    )}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Text className="text-stone-300 font-bold text-base">✕</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* Scrollable Body */}
          <ScrollView
            overScrollMode="never"
            // @ts-ignore className in NativeWind
            className={cn('flex-1 p-5', bodyClassName)}
            contentContainerStyle={styles.scrollContent}
          >
            {children}
          </ScrollView>

          {/* Optional Pinned Footer */}
          {footer && (
            <View
              // @ts-ignore className in NativeWind
              className={cn('shrink-0 p-4 border-t border-white/5 bg-[#1A1A1A]', footerClassName)}
            >
              {footer}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalFrame: {
    backgroundColor: '#1A1A1A',
    borderColor: '#292524',
    borderWidth: 1,
    borderRadius: 24,
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
  },
  scrollContent: {
    paddingBottom: 8,
  },
});

export default ModalShell;
