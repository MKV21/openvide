import "./global.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StatusBar, View } from "react-native";
import { DefaultTheme, NavigationContainer, type NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { RootStackParamList } from "./src/navigation/types";
import { registerNotificationCategories, addNotificationTapHandler } from "./src/core/notifications";
import { startUpdateChecker } from "./src/core/updates";
import { DrawerLayout } from "./src/navigation/DrawerLayout";
import { NewSessionSheet } from "./src/screens/NewSessionSheet";
import { CreateWorkspaceSheet } from "./src/screens/CreateWorkspaceSheet";
import { AddHostSheet } from "./src/screens/AddHostSheet";
import { QrScannerSheet } from "./src/screens/QrScannerSheet";
import { DirectoryPicker } from "./src/screens/DirectoryPicker";
import { PromptLibraryScreen } from "./src/screens/PromptLibraryScreen";
import { ThemeStyleScreen } from "./src/screens/ThemeStyleScreen";
import { AppStoreProvider, useAppStore } from "./src/state/AppStoreContext";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { Icon } from "./src/components/Icon";
import { useThemeColors } from "./src/constants/colors";
import { GlassProvider } from "./src/components/GlassContainer";
import { BiometricGate } from "./src/components/BiometricGate";
import { AnimatedSplash } from "./src/components/AnimatedSplash";
import { AppThemeProvider, useAppTheme } from "./src/theme/AppThemeProvider";
import { preloadThemeFamily } from "./src/theme/splashTheme";
import { checkForUpdateOnLaunch, type OtaStatus } from "./src/core/updates";

function ThemeStatusBar(): JSX.Element {
  const { resolvedMode } = useAppTheme();
  return <StatusBar barStyle={resolvedMode === "dark" ? "light-content" : "dark-content"} />;
}

const RootStack = createNativeStackNavigator<RootStackParamList>();

function ModalCloseButton({ onPress, color }: { onPress: () => void; color: string }): JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      className="w-10 h-10 items-center justify-center active:opacity-80"
    >
      <Icon name="x" size={20} color={color} />
    </Pressable>
  );
}

function RootNavigator(): JSX.Element {
  const { background, foreground, card, accent, border } = useThemeColors();
  const { sessions } = useAppStore();
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const navigationTheme = useMemo(() => ({
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background,
      card,
      text: foreground,
      primary: accent,
      border,
      notification: accent,
    },
  }), [background, card, foreground, accent, border]);

  useEffect(() => {
    registerNotificationCategories().catch(() => {});
    const cleanupNotifications = addNotificationTapHandler((daemonSessionId) => {
      __DEV__ && console.log(`[OV:notif] Tap handler fired, daemonSessionId=${daemonSessionId}`);

      const tryNavigate = () => {
        if (!navigationRef.current) {
          __DEV__ && console.log("[OV:notif] navigationRef not ready");
          return false;
        }
        const appSession = sessionsRef.current.find(
          (s) => s.daemonSessionId === daemonSessionId || s.id === daemonSessionId,
        );
        __DEV__ && console.log(`[OV:notif] Matched session: ${appSession?.id ?? "NONE"} (searched ${sessionsRef.current.length} sessions)`);
        if (appSession) {
          navigationRef.current.navigate("Main", {
            screen: "AiChat",
            params: { sessionId: appSession.id },
          });
          return true;
        }
        return false;
      };

      // Try immediately, then retry a few times (sessions may still be loading on cold-start)
      if (!tryNavigate()) {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (tryNavigate() || attempts >= 5) clearInterval(interval);
        }, 500);
      }
    });
    const cleanupUpdates = startUpdateChecker();
    return () => {
      cleanupNotifications();
      cleanupUpdates();
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <RootStack.Navigator>
        <RootStack.Screen
          name="Main"
          component={DrawerLayout}
          options={{ headerShown: false }}
        />
        <RootStack.Group screenOptions={{
          presentation: "modal",
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
          contentStyle: { backgroundColor: card },
        }}>
          <RootStack.Screen
            name="NewSessionSheet"
            component={NewSessionSheet}
            options={({ navigation }) => ({
              title: "New Session",
              headerLeft: () => (
                <ModalCloseButton onPress={() => navigation.goBack()} color={foreground} />
              ),
            })}
          />
          <RootStack.Screen
            name="CreateWorkspaceSheet"
            component={CreateWorkspaceSheet}
            options={({ navigation }) => ({
              title: "Create Workspace",
              headerLeft: () => (
                <ModalCloseButton onPress={() => navigation.goBack()} color={foreground} />
              ),
            })}
          />
          <RootStack.Screen
            name="AddHostSheet"
            component={AddHostSheet}
            options={({ navigation }) => ({
              title: "Add Host",
              headerLeft: () => (
                <ModalCloseButton onPress={() => navigation.goBack()} color={foreground} />
              ),
            })}
          />
          <RootStack.Screen
            name="QrScannerSheet"
            component={QrScannerSheet}
            options={({ navigation }) => ({
              title: "Scan QR Code",
              headerLeft: () => (
                <ModalCloseButton onPress={() => navigation.goBack()} color={foreground} />
              ),
            })}
          />
          <RootStack.Screen
            name="DirectoryPicker"
            component={DirectoryPicker}
            options={({ navigation }) => ({
              title: "Pick Directory",
              headerLeft: () => (
                <ModalCloseButton onPress={() => navigation.goBack()} color={foreground} />
              ),
            })}
          />
          <RootStack.Screen
            name="PromptLibrarySheet"
            component={PromptLibraryScreen}
            options={({ navigation }) => ({
              title: "Prompt Library",
              headerLeft: () => (
                <ModalCloseButton onPress={() => navigation.goBack()} color={foreground} />
              ),
              headerRight: () => (
                <Pressable
                  onPress={() => {
                    // PromptLibraryScreen handles its own headerRight via setOptions
                  }}
                  className="w-10 h-10 items-center justify-center active:opacity-80"
                >
                  <Icon name="plus" size={24} color={accent} />
                </Pressable>
              ),
            })}
          />
          <RootStack.Screen
            name="ThemeStyleSheet"
            component={ThemeStyleScreen}
            options={({ navigation }) => ({
              title: "Theme Style",
              headerLeft: () => (
                <ModalCloseButton onPress={() => navigation.goBack()} color={foreground} />
              ),
            })}
          />
        </RootStack.Group>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

export default function App(): JSX.Element {
  const [ready, setReady] = useState(false);
  const [otaStatus, setOtaStatus] = useState<OtaStatus>(null);

  useEffect(() => {
    // Start OTA check in parallel — progress shown on splash overlay
    checkForUpdateOnLaunch(5000, setOtaStatus);
    // Only block on theme cache (fast AsyncStorage read) before mounting the tree
    preloadThemeFamily().then(() => setReady(true));
  }, []);

  // While init is running (OTA check + theme preload), render a solid view
  // matching the native splash background so there is never a white flash.
  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: "#1E1E1E" }} />;
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <AppThemeProvider>
          <AnimatedSplash otaStatus={otaStatus}>
            <BiometricGate>
              <GlassProvider>
                <AppStoreProvider>
                  <ErrorBoundary>
                    <ThemeStatusBar />
                    <RootNavigator />
                  </ErrorBoundary>
                </AppStoreProvider>
              </GlassProvider>
            </BiometricGate>
          </AnimatedSplash>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
