import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { ProcessingProgress, VideoStatus } from "@basketball-clipper/shared/types";
import { colors, fontSize, radius, spacing } from "../lib/theme";

interface Step {
  statuses: VideoStatus[];
  label: string;
  description: string;
}

const STEPS: Step[] = [
  {
    statuses: ["pending"],
    label: "Validando",
    description: "Comprobando que el vídeo es un partido de baloncesto",
  },
  {
    statuses: ["processing"],
    label: "Detectando posesión",
    description: "YOLOv8 analiza jugadores y balón frame a frame",
  },
  {
    statuses: ["processing"],
    label: "Cortando clips",
    description: "FFmpeg genera un clip por cada posesión",
  },
  {
    statuses: ["completed"],
    label: "Completado",
    description: "Todos los clips están listos",
  },
];

const STATUS_STEP_INDEX: Partial<Record<VideoStatus, number>> = {
  pending: 0,
  processing: 1,
  completed: 3,
};

interface ProcessingStatusProps {
  progress: ProcessingProgress;
}

export function ProcessingStatus({ progress }: ProcessingStatusProps) {
  const isError = progress.status === "invalid" || progress.status === "error";
  const currentStep = STATUS_STEP_INDEX[progress.status] ?? -1;
  const pct = Math.round(progress.progress);

  if (isError) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>
          {progress.status === "invalid"
            ? "El vídeo no parece ser un partido de baloncesto."
            : (progress.error_message ?? "Ocurrió un error durante el procesado.")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` as `${number}%` }]} />
      </View>
      <Text style={styles.pct}>{pct}%</Text>

      {/* Steps */}
      <View style={styles.steps}>
        {STEPS.map((step, idx) => {
          const done = idx < currentStep || progress.status === "completed";
          const active = idx === currentStep;
          return (
            <View key={idx} style={styles.step}>
              <View style={styles.stepIcon}>
                {done ? (
                  <Text style={styles.checkIcon}>✓</Text>
                ) : active ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <View style={styles.emptyDot} />
                )}
              </View>
              <View style={styles.stepText}>
                <Text
                  style={[
                    styles.stepLabel,
                    !done && !active && styles.stepLabelMuted,
                  ]}
                >
                  {step.label}
                </Text>
                {(done || active) && (
                  <Text style={styles.stepDescription}>{step.description}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  barTrack: {
    height: 6,
    backgroundColor: colors.mutedBg,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  pct: {
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: "right",
  },
  steps: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  step: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
  },
  stepIcon: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkIcon: {
    color: colors.primary,
    fontSize: fontSize.base,
    fontWeight: "700",
  },
  emptyDot: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
  },
  stepText: {
    flex: 1,
    gap: 2,
  },
  stepLabel: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.foreground,
  },
  stepLabelMuted: {
    color: colors.muted,
    fontWeight: "400",
  },
  stepDescription: {
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: {
    color: colors.destructive,
    fontSize: fontSize.base,
  },
});
