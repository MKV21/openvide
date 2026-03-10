import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { THEME_META, type ThemeMeta } from "../theme/palettes";
import { useThemeColors } from "../constants/colors";
import { cn } from "../lib/utils";

function ThemeCard({ item, isActive, onPress }: { item: ThemeMeta; isActive: boolean; onPress: () => void }): JSX.Element {
  const needsBorder = item.id === "codex-dark";

  return (
    <Pressable
      className={cn(
        "flex-1 mx-1.5 rounded-2xl border-2 overflow-hidden active:opacity-80",
        isActive ? "border-accent" : "border-transparent",
      )}
      onPress={onPress}
    >
      {/* Preview card */}
      <View
        style={{ backgroundColor: item.previewBg }}
        className="p-4 pt-5 pb-3 items-center gap-3"
      >
        {/* Accent swatch */}
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: item.previewAccent,
            borderWidth: needsBorder ? 1 : 0,
            borderColor: "#666666",
          }}
        />
        {/* Skeleton lines */}
        <View className="w-full gap-1.5">
          <View
            style={{ backgroundColor: item.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)" }}
            className="h-2 rounded-full w-full"
          />
          <View
            style={{ backgroundColor: item.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }}
            className="h-2 rounded-full w-3/4"
          />
          <View
            style={{ backgroundColor: item.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }}
            className="h-2 rounded-full w-1/2"
          />
        </View>
      </View>
      {/* Label */}
      <View className="bg-muted px-3 py-2.5 items-center">
        <Text className={cn("text-xs font-semibold", isActive ? "text-accent" : "text-muted-foreground")}>
          {item.label}
        </Text>
      </View>
    </Pressable>
  );
}

export function ThemeStyleScreen(): JSX.Element {
  const { themeId, setThemeId } = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <FlatList
      data={THEME_META}
      numColumns={2}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
      columnWrapperStyle={{ marginBottom: 12 }}
      renderItem={({ item }) => (
        <ThemeCard
          item={item}
          isActive={themeId === item.id}
          onPress={() => setThemeId(item.id)}
        />
      )}
    />
  );
}
