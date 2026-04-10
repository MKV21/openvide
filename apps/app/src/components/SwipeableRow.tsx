import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useThemeColors } from "../constants/colors";
import { Icon } from "./Icon";

const ACTION_WIDTH = 88;
const SNAP_OPEN = -ACTION_WIDTH;
const SNAP_CLOSED = 0;
const VELOCITY_THRESHOLD = 500;
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };
const LOADING_FILL_ORDER: ReadonlyArray<readonly [number, number]> = [
  [2, 0], [3, 0], [2, 1], [3, 1],
  [2, 2], [3, 2], [2, 3], [3, 3],
  [1, 3], [0, 3], [1, 2], [0, 2],
  [1, 1], [0, 1], [1, 0], [0, 0],
];
const LOADING_TOTAL_FRAMES = LOADING_FILL_ORDER.length * 2;

interface SwipeableRowProps {
  onPress?: () => void;
  onDelete: () => void | Promise<void>;
  confirmTitle?: string;
  confirmMessage?: string;
  actionLabel?: string;
  enabled?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

function LoadingSpinner({ size = 16, color = "#FFFFFF" }: { size?: number; color?: string }): JSX.Element {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((value) => (value + 1) % LOADING_TOTAL_FRAMES);
    }, 50);
    return () => clearInterval(id);
  }, []);

  const filling = frame < LOADING_FILL_ORDER.length;
  const pivot = filling ? frame : frame - LOADING_FILL_ORDER.length;
  const cellSize = Math.max(2, Math.floor(size / 4));
  const viewSize = cellSize * 4;

  return (
    <View style={{ width: viewSize, height: viewSize, position: "relative" }}>
      {LOADING_FILL_ORDER.map(([row, col], index) => {
        const visible = filling ? index <= pivot : index > pivot;
        return (
          <View
            key={`${row}-${col}`}
            style={{
              position: "absolute",
              left: col * cellSize,
              top: row * cellSize,
              width: cellSize,
              height: cellSize,
              backgroundColor: color,
              opacity: visible ? 1 : 0,
            }}
          />
        );
      })}
    </View>
  );
}

export function SwipeableRow({
  onPress,
  onDelete,
  confirmTitle = "Delete",
  confirmMessage = "Are you sure you want to delete this item?",
  actionLabel = "Delete",
  enabled = true,
  disabled = false,
  children,
}: SwipeableRowProps): JSX.Element {
  const { destructive } = useThemeColors();
  const [deleting, setDeleting] = useState(false);
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const isCollapsing = useSharedValue(false);
  const rowHeight = useSharedValue(0);
  const rowOpacity = useSharedValue(1);
  const pressOpacity = useSharedValue(1);
  const measuredHeight = useRef(0);

  // Stable ref so the tap gesture doesn't recreate on every onPress change
  const onPressRef = useRef(onPress);
  useEffect(() => { onPressRef.current = onPress; });

  const fireTap = useCallback(() => {
    onPressRef.current?.();
  }, []);

  const closeRow = useCallback(() => {
    translateX.value = withSpring(SNAP_CLOSED, SPRING_CONFIG);
  }, [translateX]);

  const handleDeleteConfirmed = useCallback(async () => {
    setDeleting(true);
    translateX.value = withSpring(SNAP_OPEN, SPRING_CONFIG);

    try {
      await Promise.resolve(onDelete());
      rowHeight.value = measuredHeight.current;
      isCollapsing.value = true;
      rowOpacity.value = withTiming(0, { duration: 200, easing: Easing.inOut(Easing.ease) });
      rowHeight.value = withTiming(0, { duration: 300, easing: Easing.inOut(Easing.ease) });
    } catch {
      setDeleting(false);
      isCollapsing.value = false;
      closeRow();
    }
  }, [closeRow, isCollapsing, onDelete, rowHeight, rowOpacity, translateX]);

  const confirmDelete = useCallback(() => {
    Alert.alert(confirmTitle, confirmMessage, [
      { text: "Cancel", style: "cancel", onPress: () => closeRow() },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void handleDeleteConfirmed();
        },
      },
    ]);
  }, [closeRow, confirmMessage, confirmTitle, handleDeleteConfirmed]);

  // Memoize gesture to prevent native handler recreation on re-renders.
  // All callbacks are worklets that only reference shared values (stable refs).
  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .enabled(enabled && !disabled && !deleting)
    .onStart(() => {
      "worklet";
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      "worklet";
      translateX.value = Math.min(SNAP_CLOSED, Math.max(SNAP_OPEN, startX.value + event.translationX));
    })
    .onEnd((event) => {
      "worklet";
      const pastThreshold = translateX.value < SNAP_OPEN / 2;
      const fastSwipe = event.velocityX < -VELOCITY_THRESHOLD;
      translateX.value = withSpring(
        pastThreshold || fastSwipe ? SNAP_OPEN : SNAP_CLOSED,
        SPRING_CONFIG,
      );
    }), [deleting, disabled, enabled]);

  const tap = useMemo(() => Gesture.Tap()
    .enabled(enabled && !disabled && !deleting)
    .onBegin(() => {
      "worklet";
      pressOpacity.value = withTiming(0.8, { duration: 80 });
    })
    .onEnd(() => {
      "worklet";
      pressOpacity.value = withTiming(1, { duration: 100 });
      if (translateX.value < -5) {
        // Row is swiped open — close it instead of navigating
        translateX.value = withSpring(SNAP_CLOSED, SPRING_CONFIG);
      } else {
        runOnJS(fireTap)();
      }
    })
    .onFinalize(() => {
      "worklet";
      pressOpacity.value = withTiming(1, { duration: 100 });
    }), [deleting, disabled, enabled, fireTap]);

  // Pan and Tap race: if the finger moves 10px+ horizontally, Pan wins and Tap
  // is cancelled — preventing accidental navigation when swiping.
  const composed = useMemo(() => Gesture.Race(pan, tap), [pan, tap]);

  const foregroundStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: pressOpacity.value,
  }));

  const backgroundOpacity = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(translateX.value) / Math.abs(SNAP_OPEN)),
  }));

  const containerStyle = useAnimatedStyle(() => {
    if (!isCollapsing.value) {
      return { opacity: 1 };
    }
    return {
      opacity: rowOpacity.value,
      height: rowHeight.value,
      overflow: "hidden" as const,
    };
  });

  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      if (measuredHeight.current === 0) {
        measuredHeight.current = event.nativeEvent.layout.height;
      }
    },
    [],
  );

  return (
    <Animated.View style={containerStyle} onLayout={handleLayout}>
      <View className="relative">
        <Animated.View
          style={[StyleSheet.absoluteFill, { ...styles.actionBackground, backgroundColor: destructive }, backgroundOpacity]}
        >
          <Pressable style={styles.actionButton} onPress={confirmDelete} disabled={deleting}>
            {deleting ? (
              <>
                <LoadingSpinner size={16} color="#FFFFFF" />
                <Text className="text-white text-xs font-semibold">Deleting</Text>
              </>
            ) : (
              <>
                <Icon name="trash-2" size={14} color="#FFFFFF" />
                <Text className="text-white text-xs font-semibold">{actionLabel}</Text>
              </>
            )}
          </Pressable>
        </Animated.View>
        <GestureDetector gesture={composed}>
          <Animated.View style={foregroundStyle}>
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actionBackground: {
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  actionButton: {
    width: ACTION_WIDTH,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
});
