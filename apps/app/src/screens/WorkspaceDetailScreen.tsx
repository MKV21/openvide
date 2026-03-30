import React, { useLayoutEffect, useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAppStore } from "../state/AppStoreContext";
import type { MainStackParamList } from "../navigation/types";
import { Icon } from "../components/Icon";
import { GlassContainer } from "../components/GlassContainer";
import { ProviderIcon } from "../components/ProviderIcon";
import { SwipeableRow } from "../components/SwipeableRow";
import { useThemeColors } from "../constants/colors";
import { formatRelativeTime } from "../core/formatTime";
import { cn } from "../lib/utils";
import type { AiSession } from "../core/types";

type Props = NativeStackScreenProps<MainStackParamList, "WorkspaceDetail">;

function sessionTitle(session: AiSession): string {
  const lastUserMsg = [...session.messages].reverse().find((m) => m.role === "user");
  if (lastUserMsg) {
    const text = lastUserMsg.content.find((b) => b.type === "text")?.text ?? "";
    if (text.trim()) return text.trim().slice(0, 72);
  }

  for (const turn of session.turns) {
    if (turn.userPrompt?.trim()) return turn.userPrompt.trim().slice(0, 72);
  }

  return "Untitled chat";
}

export function WorkspaceDetailScreen({ route, navigation }: Props): JSX.Element {
  const { workspaceId } = route.params;
  const {
    getWorkspace,
    getTarget,
    sessions: allSessions,
    deleteSession,
  } = useAppStore();
  const { accent } = useThemeColors();

  const workspace = getWorkspace(workspaceId);
  const target = workspace ? getTarget(workspace.targetId) : undefined;

  const localSessions = useMemo(() => {
    return allSessions
      .filter((session) => session.workspaceId === workspaceId)
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }, [allSessions, workspaceId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: workspace?.name ?? "Workspace",
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate("NewWorkspaceChatSheet", { workspaceId })}
          className="w-10 h-10 items-center justify-center active:opacity-80"
          hitSlop={8}
        >
          <Icon name="plus" size={20} color={accent} />
        </Pressable>
      ),
    });
  }, [navigation, workspace?.name, workspaceId, accent]);

  const subtitle = useMemo(() => {
    if (!workspace) return "";
    const hostLabel = target?.label ?? "Unknown host";
    return `${hostLabel} · ${workspace.directory}`;
  }, [workspace, target?.label]);

  if (!workspace) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-dimmed text-sm">Workspace not found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 pt-3 pb-2 border-b border-border">
        <Text className="text-dimmed text-xs" numberOfLines={1}>{subtitle}</Text>
      </View>

      <FlatList
        data={localSessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingTop: 8 }}
        renderItem={({ item: session }) => (
          <SwipeableRow
            onPress={() => navigation.navigate("AiChat", { sessionId: session.id, workspaceId: workspace.id })}
            onDelete={() => deleteSession(session.id)}
            confirmTitle="Delete Session"
            confirmMessage={`Delete this ${session.tool} session? This cannot be undone.`}
          >
            <GlassContainer variant="card" className="p-3.5 gap-2.5">
              <View className="flex-row justify-between items-center">
                <View className="flex-row items-center gap-2">
                  <ProviderIcon tool={session.tool as "claude" | "codex"} size={20} />
                  <Text className="text-foreground text-sm font-semibold capitalize">{session.tool}</Text>
                </View>
                <Text className="text-muted-foreground text-xs">
                  {session.updatedAt ? formatRelativeTime(session.updatedAt) : "unknown"}
                </Text>
              </View>
              <Text className="text-foreground text-sm" numberOfLines={2}>
                {sessionTitle(session)}
              </Text>
              <View className="flex-row items-center justify-between">
                <Text className="text-dimmed text-xs">
                  {session.messages.length} messages
                </Text>
                <Text
                  className={cn(
                    "text-xs font-semibold capitalize",
                    session.status === "idle" && "text-dimmed",
                    session.status === "running" && "text-accent",
                    session.status === "failed" && "text-destructive",
                    (session.status === "cancelled" || session.status === "awaiting_input") && "text-warning",
                  )}
                >
                  {session.status}
                </Text>
              </View>
            </GlassContainer>
          </SwipeableRow>
        )}
        ListEmptyComponent={
          <View className="items-center py-8">
            <Text className="text-dimmed text-sm text-center">
              No sessions yet. Tap + to start a chat.
            </Text>
          </View>
        }
      />
    </View>
  );
}
