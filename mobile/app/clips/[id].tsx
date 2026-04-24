import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getClip } from "@basketball-clipper/shared/api";
import { ClipPlayer } from "../../components/ClipPlayer";
import { getStoredToken, useAuth } from "../../lib/auth";
import { colors, fontSize, spacing } from "../../lib/theme";

export default function ClipDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const clipId = parseInt(id ?? "", 10);

  const { data: clip, isLoading, error } = useQuery({
    queryKey: ["clips", clipId],
    queryFn: async () => {
      const token = await getStoredToken();
      return getClip(clipId, token!);
    },
    enabled: !!user && !isNaN(clipId),
  });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Clip #{id}</Text>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}

      {error && (
        <Text style={styles.errorText}>No se pudo cargar el clip.</Text>
      )}

      {clip && <ClipPlayer clip={clip} />}
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
    gap: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: colors.foreground,
  },
  center: {
    alignItems: "center",
    paddingVertical: spacing.xxl * 2,
  },
  errorText: {
    color: colors.destructive,
    fontSize: fontSize.base,
  },
});
