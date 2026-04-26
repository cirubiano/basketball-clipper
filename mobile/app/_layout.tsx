import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Providers } from "../lib/providers";
import { useAuth } from "../lib/auth";
import { colors } from "../lib/theme";

function AuthGuard() {
  const { user, activeProfile, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inSelectProfile = segments[0] === "select-profile";

    if (!user && !inAuthGroup) {
      // No autenticado → login
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      // Autenticado, estaba en login/register → inicio
      router.replace("/");
    } else if (user && !activeProfile && !inSelectProfile) {
      // Autenticado pero sin perfil activo → selector de perfil
      router.replace("/select-profile");
    } else if (user && activeProfile && inSelectProfile) {
      // Ya tiene perfil activo y está en el selector → inicio
      router.replace("/");
    }
  }, [user, activeProfile, isLoading, segments]);

  return null;
}

function RootStack() {
  return (
    <>
      <AuthGuard />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Basketball Clipper" }} />
        <Stack.Screen name="upload" options={{ title: "Subir vídeo" }} />
        <Stack.Screen name="clips/index" options={{ title: "Mis clips" }} />
        <Stack.Screen name="clips/[id]" options={{ title: "Detalle" }} />
        <Stack.Screen name="players/index" options={{ title: "Jugadores" }} />
        <Stack.Screen name="teams/[teamId]/roster" options={{ title: "Plantilla" }} />
        <Stack.Screen
          name="select-profile"
          options={{ title: "Selecciona tu perfil", headerBackVisible: false }}
        />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}

export default function RootLayout() {
  return (
    <Providers>
      <RootStack />
    </Providers>
  );
}
