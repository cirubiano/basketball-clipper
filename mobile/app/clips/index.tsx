import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getClips } from "@basketball-clipper/shared/api";
import { ClipCard } from "../../components/ClipCard";
import { getStoredToken, useAuth } from "../../lib/auth";
import { colors, fontSize, radius, spacing } from "../../lib/theme";

export default function ClipsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const { data: clips, isLoading } = useQuery({
    queryKey: ["clips"],
    queryFn: async () => {
      const token = await getStoredToken();
      return getClips(token!);
    },
    enabled: !!user,
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={isLoading ? [] : (clips ?? [])}
        keyExtractor={(c) => String(c.id)}
        renderItem={({ item }) => <ClipCard clip={item} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Mis clips</Text>
              {clips && (
                <Text style={styles.count}>
                  {clips.length} {clips.length === 1 ? "clip" : "clips"}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => router.push("/upload")}
            >
              <Text style={styles.uploadButtonText}>+ Subir</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Cargando...</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Todavía no tienes clips.</Text>
              <TouchableOpacity onPress={() => router.push("/upload")}>
                <Text style={styles.emptyLink}>Sube tu primer vídeo</Text>
              </TouchableOpacity>
            </View>
          )
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
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
  count: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 2,
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
});
