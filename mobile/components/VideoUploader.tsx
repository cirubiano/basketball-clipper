import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { colors, fontSize, radius, spacing } from "../lib/theme";

interface VideoUploaderProps {
  onFile: (file: { uri: string; name: string; mimeType: string; size: number }) => void;
  disabled?: boolean;
}

export function VideoUploader({ onFile, disabled = false }: VideoUploaderProps) {
  const [selected, setSelected] = useState<{ name: string; size: number } | null>(null);
  const [picking, setPicking] = useState(false);

  async function pick() {
    if (disabled || picking) return;
    setPicking(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await DocumentPicker.getDocumentAsync({
        type: "video/*",
        copyToCacheDirectory: true,
      }) as any;
      // expo-document-picker ≥10: {canceled, assets[]}
      if (result.canceled) return;
      const asset = result.assets[0] as {
        uri: string;
        name: string;
        mimeType?: string;
        size?: number;
      };
      setSelected({ name: asset.name, size: asset.size ?? 0 });
      onFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? "video/mp4",
        size: asset.size ?? 0,
      });
    } finally {
      setPicking(false);
    }
  }

  return (
    <TouchableOpacity
      style={[styles.container, disabled && styles.disabled]}
      onPress={pick}
      activeOpacity={disabled ? 1 : 0.7}
    >
      {picking ? (
        <ActivityIndicator color={colors.primary} />
      ) : selected ? (
        <>
          <Text style={styles.filename} numberOfLines={1}>
            {selected.name}
          </Text>
          <Text style={styles.meta}>
            {(selected.size / 1024 ** 2).toFixed(1)} MB · toca para cambiar
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.icon}>🎬</Text>
          <Text style={styles.label}>Selecciona un vídeo</Text>
          <Text style={styles.meta}>MP4, MOV, AVI, MKV</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  disabled: {
    opacity: 0.5,
  },
  icon: {
    fontSize: 36,
  },
  filename: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.foreground,
    textAlign: "center",
    maxWidth: "100%",
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.foreground,
  },
  meta: {
    fontSize: fontSize.sm,
    color: colors.muted,
  },
});
