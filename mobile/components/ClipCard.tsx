import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import type { Clip } from "@basketball-clipper/shared/types";
import { colors, fontSize, radius, spacing } from "../lib/theme";

interface ClipCardProps {
  clip: Clip;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClipCard({ clip }: ClipCardProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/clips/${clip.id}`)}
      activeOpacity={0.75}
    >
      {/* Thumbnail placeholder */}
      <View style={styles.thumbnail}>
        <Text style={styles.playIcon}>▶</Text>
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(clip.duration)}</Text>
        </View>
      </View>

      <View style={styles.info}>
        <View style={styles.row}>
          <Text style={styles.title} numberOfLines={1}>
            Clip #{clip.id}
          </Text>
          {clip.team && (
            <View style={styles.teamBadge}>
              <Text style={styles.teamText}>
                {clip.team.replace("_", " ")}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.meta}>
          {clip.start_time.toFixed(1)}s – {clip.end_time.toFixed(1)}s
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  thumbnail: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.mutedBg,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    fontSize: 28,
    color: colors.muted,
  },
  durationBadge: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    color: "#fff",
    fontSize: fontSize.xs,
    fontFamily: "monospace",
  },
  info: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.foreground,
    flex: 1,
  },
  teamBadge: {
    backgroundColor: colors.badge,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  teamText: {
    color: colors.badgeText,
    fontSize: fontSize.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  meta: {
    fontSize: fontSize.sm,
    color: colors.muted,
  },
});
