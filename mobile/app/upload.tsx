import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { uploadVideo, subscribeToProgress } from "@basketball-clipper/shared/api";
import type { ProcessingProgress } from "@basketball-clipper/shared/types";
import { VideoUploader } from "../components/VideoUploader";
import { ProcessingStatus } from "../components/ProcessingStatus";
import { getStoredToken } from "../lib/auth";
import { colors, fontSize, radius, spacing } from "../lib/theme";

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

interface SelectedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export default function UploadScreen() {
  const router = useRouter();
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  async function handleSubmit() {
    if (!file) return;
    const token = await getStoredToken();
    if (!token) return;

    setStage("uploading");

    try {
      // Build a File-like object for the shared uploadVideo function
      const blob = await fetch(file.uri).then((r) => r.blob());
      const fileObj = new File([blob], file.name, { type: file.mimeType });

      const { id: videoId } = await uploadVideo(fileObj, token);
      setStage("processing");

      const sub = subscribeToProgress(
        videoId,
        (p) => {
          setProgress(p);
          if (p.status === "completed") setStage("done");
          if (p.status === "invalid" || p.status === "error") setStage("error");
        },
        () => setStage("done"),
        () => {
          setStage("error");
          setProgress((prev) =>
            prev ? { ...prev, status: "error", error_message: "Error de conexión." } : null
          );
        }
      );
      unsubRef.current = sub.unsubscribe;
    } catch (err) {
      setStage("error");
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "No se pudo subir el vídeo."
      );
    }
  }

  function handleViewClips() {
    unsubRef.current?.();
    router.replace("/clips");
  }

  const isProcessing = stage === "uploading" || stage === "processing";

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Subir vídeo</Text>
      <Text style={styles.subtitle}>
        Sube un partido de baloncesto y generaremos un clip por cada posesión.
      </Text>

      {/* File picker */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Seleccionar archivo</Text>
        <VideoUploader onFile={setFile} disabled={isProcessing || stage === "done"} />

        {stage === "idle" && (
          <TouchableOpacity
            style={[styles.submitButton, !file && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={!file}
          >
            <Text style={styles.submitText}>Procesar vídeo</Text>
          </TouchableOpacity>
        )}

        {stage === "uploading" && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.uploadingText}>Subiendo vídeo...</Text>
          </View>
        )}
      </View>

      {/* Processing status */}
      {(stage === "processing" || stage === "done" || stage === "error") && progress && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estado del procesado</Text>
          <ProcessingStatus progress={progress} />

          {stage === "done" && (
            <TouchableOpacity style={styles.submitButton} onPress={handleViewClips}>
              <Text style={styles.submitText}>Ver mis clips</Text>
            </TouchableOpacity>
          )}
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
    gap: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: colors.foreground,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: -spacing.sm,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.foreground,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: colors.primaryForeground,
    fontWeight: "600",
    fontSize: fontSize.base,
  },
  uploadingRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  uploadingText: {
    color: colors.muted,
    fontSize: fontSize.base,
  },
});
