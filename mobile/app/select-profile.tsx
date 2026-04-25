import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../lib/auth";
import { colors, fontSize, radius, spacing } from "../lib/theme";

const roleLabel: Record<string, string> = {
  technical_director: "Director Técnico",
  head_coach: "Entrenador",
  staff_member: "Staff",
};

const roleColor: Record<string, string> = {
  technical_director: "#7c3aed",
  head_coach: "#2563eb",
  staff_member: "#6b7280",
};

export default function SelectProfileScreen() {
  const { profiles, switchProfile } = useAuth();
  const [switching, setSwitching] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(profileId: number) {
    setSwitching(profileId);
    setError(null);
    try {
      await switchProfile(profileId);
      // AuthGuard en _layout.tsx detecta activeProfile y redirige al dashboard
    } catch {
      setError("No se ha podido seleccionar el perfil. Inténtalo de nuevo.");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Selecciona tu perfil</Text>
      <Text style={styles.subtitle}>
        Elige el contexto desde el que quieres trabajar.
      </Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {profiles.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No tienes perfiles asignados.</Text>
          <Text style={styles.emptyText}>
            Contacta con el administrador de tu club para que te añada.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {profiles.map((profile) => {
            const isLoading = switching === profile.id;
            return (
              <TouchableOpacity
                key={profile.id}
                style={[styles.card, isLoading && styles.cardDisabled]}
                onPress={() => handleSelect(profile.id)}
                disabled={switching !== null}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: roleColor[profile.role] + "20" },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: roleColor[profile.role] ?? colors.muted },
                    ]}
                  >
                    {roleLabel[profile.role] ?? profile.role}
                  </Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {profile.team_name ?? profile.club_name}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {profile.club_name} · {profile.season_name}
                  </Text>
                </View>
                {isLoading && (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                    style={styles.spinner}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: colors.foreground,
  },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.muted,
  },
  errorText: {
    color: colors.destructive,
    fontSize: fontSize.sm,
    backgroundColor: "#fef2f2",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: spacing.xxl * 2,
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.muted,
    fontSize: fontSize.base,
    textAlign: "center",
  },
  list: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.foreground,
  },
  cardSub: {
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  spinner: {
    marginLeft: "auto",
  },
});
