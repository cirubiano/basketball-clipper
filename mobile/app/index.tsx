import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { listVideos } from "@basketball-clipper/shared/api";
import { ClipCard } from "../components/ClipCard";
import { colors, fontSize, radius, spacing } from "../lib/theme";
import { useAuth, getStoredToken } from "../lib/auth";

export default function DashboardScreen() {
  const router = useRouter();
  const { user, activeProfile, logout, clearActiveProfile } = useAuth();

  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos", activeProfile?.id],
    queryFn: async () => {
      const token = await getStoredToken();
      return listVideos(token!);
    },
    enabled: !!user && !!activeProfile,
  });

  const recent = videos?.slice(0, 6) ?? [];

  return (
    <View style={styles.container}>
      <FlatList
        data={isLoading ? [] : recent}
        keyExtractor={(v) => String(v.id)}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/videos/${item.id}`)}>
            <View style={styles.videoCard}>
              <View style={styles.videoCardInfo}>
                <Text style={styles.videoTitle} numberOfLines={1}>
                  {item.title ?? item.filename}
                </Text>
                <Text style={styles.videoMeta}>
                  {item.clips_count} {item.clips_count === 1 ? "clip" : "clips"} ·{" "}
                  <Text
                    style={[
                      styles.statusBadge,
                      item.status === "completed" && styles.statusDone,
                      item.status === "error" && styles.statusError,
                    ]}
                  >
                    {statusLabel(item.status)}
                  </Text>
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Dashboard</Text>
              {activeProfile && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {activeProfile.team_name ?? activeProfile.club_name}
                </Text>
              )}
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={() => router.push("/upload")}
              >
                <Text style={styles.uploadButtonText}>+ Subir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.switchButton}
                onPress={clearActiveProfile}
              >
                <Text style={styles.switchButtonText}>⇄</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Cargando...</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Todavía no hay vídeos.</Text>
              <TouchableOpacity onPress={() => router.push("/upload")}>
                <Text style={styles.emptyLink}>Sube el primero</Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListFooterComponent={
          (videos?.length ?? 0) > 6 ? (
            <TouchableOpacity
              style={styles.seeAllButton}
              onPress={() => router.push("/clips")}
            >
              <Text style={styles.seeAllText}>Ver todos los clips</Text>
            </TouchableOpacity>
          ) : null
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    uploading: "Subiendo",
    pending: "En cola",
    processing: "Procesando",
    completed: "Listo",
    error: "Error",
    invalid: "Rechazado",
  };
  return labels[status] ?? status;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: colors.foreground,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 2,
    maxWidth: 160,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  uploadButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  uploadButtonText: {
    color: colors.primaryForeground,
    fontWeight: "600",
    fontSize: fontSize.sm,
  },
  switchButton: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  switchButtonText: {
    fontSize: fontSize.base,
    color: colors.muted,
  },
  videoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  videoCardInfo: {
    gap: 4,
  },
  videoTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.foreground,
  },
  videoMeta: {
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  statusBadge: {
    color: colors.muted,
  },
  statusDone: {
    color: colors.success,
  },
  statusError: {
    color: colors.destructive,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: spacing.xxl * 2,
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.muted,
    fontSize: fontSize.base,
  },
  emptyLink: {
    color: colors.primary,
    fontSize: fontSize.base,
    fontWeight: "600",
  },
  seeAllButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  seeAllText: {
    color: colors.foreground,
    fontWeight: "600",
    fontSize: fontSize.base,
  },
});
