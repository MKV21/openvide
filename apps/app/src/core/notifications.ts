import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Register notification categories with action buttons */
export async function registerNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync("AI_SESSION", [
    { identifier: "open", buttonTitle: "Open", options: { opensAppToForeground: true } },
  ]);
}

export async function requestPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/** Extract sessionId from a notification response */
function extractSessionId(response: Notifications.NotificationResponse): string | undefined {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const sessionId = data?.sessionId;
  return typeof sessionId === "string" ? sessionId : undefined;
}

/** Add notification tap handler - returns cleanup function.
 *  Also checks for a cold-start notification that launched the app. */
export function addNotificationTapHandler(
  onTap: (sessionId: string) => void,
): () => void {
  // Handle taps while app is running (foreground/background)
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const sessionId = extractSessionId(response);
      if (sessionId) onTap(sessionId);
    },
  );

  // Handle cold-start: notification that launched the app before listener was set up
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    const sessionId = extractSessionId(response);
    if (sessionId) onTap(sessionId);
  }).catch(() => {});

  return () => subscription.remove();
}

/**
 * Request push notification permissions and return an Expo push token.
 * Returns null if permissions denied, not on a physical device, or projectId
 * is missing from app config.
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    // Push tokens only work on physical devices
    if (!Device.isDevice) {
      __DEV__ && console.log("[OV:push] Not a physical device, skipping push token");
      return null;
    }

    // Android requires a notification channel
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#3b82f6",
      });
    }

    const granted = await requestPermissions();
    if (!granted) {
      __DEV__ && console.log("[OV:push] Notification permissions not granted");
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      __DEV__ && console.log("[OV:push] No EAS projectId in config, skipping push token");
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    __DEV__ && console.log(`[OV:push] Got push token: ${tokenData.data}`);
    return tokenData.data;
  } catch (err) {
    __DEV__ && console.log(`[OV:push] Failed to get push token: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
