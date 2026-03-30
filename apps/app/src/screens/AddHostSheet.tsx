import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAppStore } from "../state/AppStoreContext";
import { cn } from "../lib/utils";
import type { AuthMethod } from "../core/types";
import type { RootStackParamList } from "../navigation/types";
import { useThemeColors } from "../constants/colors";

type Props = NativeStackScreenProps<RootStackParamList, "AddHostSheet">;

type ConnectionType = "ssh" | "bridge";

const AUTH_METHODS: { value: AuthMethod; label: string }[] = [
  { value: "password", label: "Password" },
  { value: "privateKey", label: "Private Key" },
];

const HOST_REGEX = /^[a-zA-Z0-9._-]+$/;

function validatePort(value: string): string | null {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1 || n > 65535) return "Port must be 1\u201365535";
  return null;
}

function validateHost(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Host is required";
  if (!HOST_REGEX.test(trimmed)) return "Invalid host format";
  return null;
}

function validateBridgeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Bridge URL is required";
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return "URL must start with http:// or https://";
  }
  return null;
}

type ConnectionPhase = "idle" | "testing" | "saving";

export function AddHostSheet({ navigation, route }: Props): JSX.Element {
  const { createTarget, testConnectionBeforeSave } = useAppStore();
  const { accent, dimmed, primaryForeground } = useThemeColors();
  const qrPayload = route.params?.qrPayload;
  const bridgeQrPayload = route.params?.bridgeQrPayload;

  const [connectionType, setConnectionType] = useState<ConnectionType>(
    bridgeQrPayload ? "bridge" : "ssh",
  );
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");

  // Bridge fields
  const [bridgeUrl, setBridgeUrl] = useState("");
  const [bridgeToken, setBridgeToken] = useState("");

  // Auto-fill from SSH QR payload
  useEffect(() => {
    if (!qrPayload) return;
    setConnectionType("ssh");
    setAuthMethod("privateKey");
    setPrivateKey(qrPayload.privateKey);
    if (qrPayload.host) {
      setHost(qrPayload.host);
      setLabel(qrPayload.host);
    }
    if (qrPayload.port) setPort(String(qrPayload.port));
    if (qrPayload.username) setUsername(qrPayload.username);
  }, [qrPayload]);

  // Auto-fill from Bridge QR payload
  useEffect(() => {
    if (!bridgeQrPayload) return;
    setConnectionType("bridge");
    setBridgeUrl(bridgeQrPayload.url);
    setBridgeToken(bridgeQrPayload.token);
    if (bridgeQrPayload.label) setLabel(bridgeQrPayload.label);
  }, [bridgeQrPayload]);

  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const portError = useMemo(() => port.trim().length > 0 ? validatePort(port) : null, [port]);
  const hostError = useMemo(() => touched["host"] ? validateHost(host) : null, [host, touched]);
  const bridgeUrlError = useMemo(
    () => touched["bridgeUrl"] ? validateBridgeUrl(bridgeUrl) : null,
    [bridgeUrl, touched],
  );

  const busy = phase !== "idle";

  const canSaveSsh =
    label.trim().length > 0 &&
    host.trim().length > 0 &&
    validateHost(host) === null &&
    validatePort(port) === null &&
    username.trim().length > 0 &&
    (authMethod === "password" ? password.trim().length > 0 : privateKey.length > 0);

  const canSaveBridge =
    label.trim().length > 0 &&
    bridgeUrl.trim().length > 0 &&
    validateBridgeUrl(bridgeUrl) === null &&
    bridgeToken.trim().length > 0;

  const canSave = connectionType === "bridge" ? canSaveBridge : canSaveSsh;

  const markTouched = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSave = async (): Promise<void> => {
    if (!canSave) return;
    setError(null);

    if (connectionType === "bridge") {
      // Test bridge connection
      setPhase("testing");
      try {
        const testUrl = `${bridgeUrl.trim()}/api/host`;
        const resp = await fetch(testUrl, {
          headers: { Authorization: `Bearer ${bridgeToken.trim()}` },
        });
        if (!resp.ok) {
          setError(`Bridge connection failed: HTTP ${resp.status}. Check URL and token.`);
          setPhase("idle");
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError("Bridge connection test failed: " + msg);
        setPhase("idle");
        return;
      }

      // Save bridge host
      setPhase("saving");
      try {
        const target = await createTarget({
          label: label.trim(),
          host: "",
          port: 0,
          username: "",
          tags: [],
          authMethod: "bridge",
          connectionType: "bridge",
          bridgeUrl: bridgeUrl.trim(),
          credentials: { bridgeToken: bridgeToken.trim() },
        });
        navigation.goBack();
        navigation.navigate("Main", {
          screen: "HostDetail",
          params: { targetId: target.id },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setPhase("idle");
      }
    } else {
      // SSH flow (unchanged)
      const credentials = {
        password: authMethod === "password" ? password.trim() : undefined,
        privateKey: authMethod !== "password" ? privateKey.trim() : undefined,
        privateKeyPassphrase: authMethod !== "password" && passphrase.trim().length > 0 ? passphrase.trim() : undefined,
      };

      setPhase("testing");
      try {
        const result = await testConnectionBeforeSave({
          host: host.trim(),
          port: parseInt(port, 10) || 22,
          username: username.trim(),
          authMethod,
          credentials,
        });
        if (!result.success) {
          setError("Connection failed: " + (result.error ?? "Unknown error") + ". Check your credentials.");
          setPhase("idle");
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError("Connection test failed: " + msg);
        setPhase("idle");
        return;
      }

      setPhase("saving");
      try {
        const target = await createTarget({
          label: label.trim(),
          host: host.trim(),
          port: parseInt(port, 10) || 22,
          username: username.trim(),
          tags: [],
          authMethod,
          credentials,
        });
        navigation.goBack();
        navigation.navigate("Main", {
          screen: "HostDetail",
          params: { targetId: target.id, autoDetect: true },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setPhase("idle");
      }
    }
  };

  const buttonLabel = phase === "testing" ? "Testing..." : phase === "saving" ? "Saving..." : "Add Host";

  return (
      <ScrollView ref={scrollRef} className="flex-1 bg-card" contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 + keyboardHeight }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === "ios"} showsVerticalScrollIndicator={false}>
        {/* Connection Type Toggle */}
        <Text className="text-foreground text-[15px] font-bold mt-1">Connection Type</Text>
        <View className="flex-row gap-2">
          {([
            { value: "ssh" as ConnectionType, label: "SSH" },
            { value: "bridge" as ConnectionType, label: "Bridge" },
          ]).map((ct) => (
            <Pressable
              key={ct.value}
              className={cn(
                "flex-1 px-4 py-4 bg-muted rounded-lg border-2 items-center",
                connectionType === ct.value ? "border-accent" : "border-transparent",
              )}
              onPress={() => { setConnectionType(ct.value); setError(null); }}
            >
              <Text className={cn("text-[15px] font-semibold", connectionType === ct.value ? "text-accent" : "text-muted-foreground")}>
                {ct.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="text-foreground text-[15px] font-bold mt-1">Label</Text>
        <TextInput
          className="bg-muted rounded-2xl p-4 text-foreground text-[16px]"
          value={label}
          onChangeText={setLabel}
          placeholder={connectionType === "bridge" ? "My Bridge Server" : "My Server"}
          placeholderTextColor={dimmed}
        />

        {connectionType === "bridge" ? (
          <>
            <Text className="text-foreground text-[15px] font-bold mt-1">Bridge URL</Text>
            <TextInput
              className="bg-muted rounded-2xl p-4 text-foreground text-[16px]"
              value={bridgeUrl}
              onChangeText={setBridgeUrl}
              onBlur={() => markTouched("bridgeUrl")}
              placeholder="http://192.168.1.100:7842"
              placeholderTextColor={dimmed}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {bridgeUrlError && <Text className="text-error-bright text-xs mt-0.5">{bridgeUrlError}</Text>}

            <Text className="text-foreground text-[15px] font-bold mt-1">Token</Text>
            <TextInput
              className="bg-muted rounded-2xl p-4 text-foreground text-[16px]"
              value={bridgeToken}
              onChangeText={setBridgeToken}
              placeholder="Bearer token"
              placeholderTextColor={dimmed}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Pressable
              className="bg-muted rounded-lg px-4 py-2.5 items-center active:opacity-80"
              onPress={() => navigation.navigate("QrScannerSheet")}
            >
              <Text className="text-accent font-semibold text-[14px]">Scan QR Code</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text className="text-foreground text-[15px] font-bold mt-1">Host</Text>
            <TextInput
              className="bg-muted rounded-2xl p-4 text-foreground text-[16px]"
              value={host}
              onChangeText={setHost}
              onBlur={() => markTouched("host")}
              placeholder="192.168.1.100"
              placeholderTextColor={dimmed}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {hostError && <Text className="text-error-bright text-xs mt-0.5">{hostError}</Text>}

            <Text className="text-foreground text-[15px] font-bold mt-1">Port</Text>
            <TextInput
              className="bg-muted rounded-2xl p-4 text-foreground text-[16px]"
              value={port}
              onChangeText={setPort}
              placeholder="22"
              placeholderTextColor={dimmed}
              keyboardType="number-pad"
            />
            {portError && <Text className="text-error-bright text-xs mt-0.5">{portError}</Text>}

            <Text className="text-foreground text-[15px] font-bold mt-1">Username</Text>
            <TextInput
              className="bg-muted rounded-2xl p-4 text-foreground text-[16px]"
              value={username}
              onChangeText={setUsername}
              placeholder="root"
              placeholderTextColor={dimmed}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text className="text-foreground text-[15px] font-bold mt-1">Auth Method</Text>
            <View className="flex-row gap-2">
              {AUTH_METHODS.map((method) => (
                <Pressable
                  key={method.value}
                  className={cn(
                    "flex-1 px-4 py-4 bg-muted rounded-lg border-2 items-center",
                    authMethod === method.value ? "border-accent" : "border-transparent",
                  )}
                  onPress={() => setAuthMethod(method.value)}
                >
                  <Text className={cn("text-[15px] font-semibold", authMethod === method.value ? "text-accent" : "text-muted-foreground")}>
                    {method.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {authMethod === "password" && (
              <>
                <Text className="text-foreground text-[15px] font-bold mt-1">Password</Text>
                <TextInput
                  className="bg-muted rounded-2xl p-4 text-foreground text-[16px]"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={dimmed}
                  secureTextEntry
                />
              </>
            )}

            {authMethod !== "password" && (
              <>
                <Text className="text-foreground text-[15px] font-bold mt-1">Private Key (PEM)</Text>
                <TextInput
                  className="bg-muted rounded-2xl p-4 text-foreground text-[16px] min-h-[160px]"
                  value={privateKey}
                  onChangeText={setPrivateKey}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  placeholderTextColor={dimmed}
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                />
              </>
            )}

            {authMethod !== "password" && (
              <View className="flex-row items-center gap-3">
                <View className="flex-1 h-[1px] bg-border" />
                <Text className="text-muted-foreground text-xs">or</Text>
                <View className="flex-1 h-[1px] bg-border" />
              </View>
            )}

            {authMethod !== "password" && (
              <Pressable
                className="bg-muted rounded-lg px-4 py-2.5 items-center active:opacity-80"
                onPress={() => navigation.navigate("QrScannerSheet")}
              >
                <Text className="text-accent font-semibold text-[14px]">Scan QR Code</Text>
              </Pressable>
            )}

            {authMethod !== "password" && (
              <>
                <Text className="text-foreground text-[15px] font-bold mt-1">Passphrase (optional)</Text>
                <TextInput
                  className="bg-muted rounded-2xl p-4 text-foreground text-[16px]"
                  value={passphrase}
                  onChangeText={setPassphrase}
                  placeholder="Key passphrase"
                  placeholderTextColor={dimmed}
                  secureTextEntry
                />
              </>
            )}
          </>
        )}

        {phase === "testing" && (
          <View className="flex-row items-center gap-2 mt-1">
            <ActivityIndicator size="small" color={accent} />
            <Text className="text-muted-foreground text-[13px]">
              {connectionType === "bridge" ? "Testing bridge connection..." : "Testing SSH connection..."}
            </Text>
          </View>
        )}

        {error && <Text className="text-error-bright text-[13px]">{error}</Text>}

        <Pressable
          className={cn("bg-accent rounded-full py-4 items-center mt-3 flex-row justify-center gap-2", (!canSave || busy) && "opacity-40")}
          onPress={handleSave}
          disabled={!canSave || busy}
        >
          {busy && <ActivityIndicator size="small" color={primaryForeground} />}
          <Text className="text-primary-foreground font-bold text-base">{buttonLabel}</Text>
        </Pressable>
      </ScrollView>
  );
}
