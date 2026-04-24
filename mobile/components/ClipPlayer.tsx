import { ResizeMode, Video } from "expo-av";
import { StyleSheet, Text, View } from "react-native";
import type { Clip } from "@basketball-clipper/shared/types";
import { colors, fontSize, radius, spacing } from "../lib/theme";

interface ClipPlayerProps {
  clip: Clip;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClipPlayer({ clip }: ClipPlayerProps) {
  return (
    <View style={styles.container}>
      <Video
        source={{ uri: clip.url }}
        style={styles.video}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
      />
      <View style={styles.meta}>
        {clip.team && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {clip.team.replace("_", " ")}
            </Text>
          </View>
        )}
        <Text style={styles.metaText}>
          {clip.start_time.toFixed(1)}s – {clip.end_time.toFixed(1)}s
        </Text>
        <Text style={styles.metaText}>Duración: {formatDuration(clip.duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: radius.md,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "center",
  },
  badge: {
    backgroundColor: colors.badge,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeText: {
    color: colors.badgeText,
    fontSize: fontSize.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.muted,
  },
});
