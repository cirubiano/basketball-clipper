import { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPlayers,
  createPlayer,
  updatePlayer,
  archivePlayer,
} from "@basketball-clipper/shared/api";
import type { Player, PlayerCreate } from "@basketball-clipper/shared/types";
import { useAuth } from "../../lib/auth";
import { colors, fontSize, radius, spacing } from "../../lib/theme";

const EMPTY_FORM: PlayerCreate = {
  first_name: "",
  last_name: "",
  date_of_birth: null,
};

export default function PlayersScreen() {
  const { token, activeProfile } = useAuth();
  const clubId = activeProfile?.club_id;
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState<PlayerCreate>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: players = [], isLoading } = useQuery({
    queryKey: ["players", clubId],
    queryFn: () => listPlayers(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const saveMutation = useMutation({
    mutationFn: (data: PlayerCreate) =>
      editPlayer
        ? updatePlayer(token!, clubId!, editPlayer.id, data)
        : createPlayer(token!, clubId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players", clubId] });
      closeModal();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => archivePlayer(token!, clubId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["players", clubId] }),
  });

  function openCreate() {
    setEditPlayer(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(p: Player) {
    setEditPlayer(p);
    setForm({
      first_name: p.first_name,
      last_name: p.last_name,
      date_of_birth: p.date_of_birth,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditPlayer(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function confirmArchive(p: Player) {
    Alert.alert(
      "Archivar jugador",
      `¿Archivar a ${p.first_name} ${p.last_name}? Se retirará de todas las plantillas activas.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Archivar",
          style: "destructive",
          onPress: () => archiveMutation.mutate(p.id),
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={players}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.first_name[0]}
                {item.last_name[0]}
              </Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>
                {item.first_name} {item.last_name}
              </Text>
              <Text style={styles.meta}>
                {item.positions.length > 0
                  ? item.positions.map((pos) => pos.name).join(", ")
                  : "Sin posición"}
                {item.date_of_birth ? ` · ${item.date_of_birth}` : ""}
              </Text>
            </View>
            {item.archived_at ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Archivado</Text>
              </View>
            ) : (
              <View style={styles.rowActions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => openEdit(item)}
                >
                  <Text style={styles.iconBtnText}>✎</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, styles.iconBtnDestructive]}
                  onPress={() => confirmArchive(item)}
                >
                  <Text style={[styles.iconBtnText, styles.iconBtnDestructiveText]}>
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Jugadores</Text>
              <Text style={styles.subtitle}>
                {players.length} en el club
              </Text>
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
              <Text style={styles.addBtnText}>+ Nuevo</Text>
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
              <Text style={styles.emptyText}>No hay jugadores en el club.</Text>
              <TouchableOpacity onPress={openCreate}>
                <Text style={styles.emptyLink}>Añade el primero</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {/* Modal crear / editar jugador */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editPlayer ? "Editar jugador" : "Nuevo jugador"}
            </Text>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={form.first_name}
              onChangeText={(v) => setForm((f) => ({ ...f, first_name: v }))}
              placeholder="Pau"
              placeholderTextColor={colors.muted}
              autoCorrect={false}
            />

            <Text style={styles.label}>Apellidos</Text>
            <TextInput
              style={styles.input}
              value={form.last_name}
              onChangeText={(v) => setForm((f) => ({ ...f, last_name: v }))}
              placeholder="Gasol"
              placeholderTextColor={colors.muted}
              autoCorrect={false}
            />

            <Text style={styles.label}>Fecha de nacimiento</Text>
            <TextInput
              style={styles.input}
              value={form.date_of_birth ?? ""}
              onChangeText={(v) =>
                setForm((f) => ({ ...f, date_of_birth: v || null }))
              }
              placeholder="AAAA-MM-DD"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
            />

            {formError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                (!form.first_name || !form.last_name || saveMutation.isPending) &&
                  styles.saveBtnDisabled,
              ]}
              disabled={
                saveMutation.isPending || !form.first_name || !form.last_name
              }
              onPress={() => saveMutation.mutate(form)}
            >
              <Text style={styles.saveBtnText}>
                {saveMutation.isPending
                  ? "Guardando..."
                  : editPlayer
                    ? "Guardar"
                    : "Crear"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

      </Modal>
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
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
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
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  addBtnText: {
    color: colors.primaryForeground,
    fontWeight: "600",
    fontSize: fontSize.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.mutedBg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.muted,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.foreground,
  },
  meta: {
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  rowActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  iconBtnText: {
    fontSize: fontSize.base,
    color: colors.muted,
  },
  iconBtnDestructive: {
    borderColor: colors.destructive + "44",
  },
  iconBtnDestructiveText: {
    color: colors.destructive,
  },
  badge: {
    backgroundColor: colors.mutedBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontSize: fontSize.xs,
    color: colors.muted,
    fontWeight: "600",
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
  // Modal
  modal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.foreground,
  },
  modalClose: {
    fontSize: fontSize.lg,
    color: colors.muted,
    padding: spacing.xs,
  },
  modalBody: {
    flex: 1,
    padding: spacing.lg,
  },
  modalFooter: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.background,
    minHeight: 44,
  },
  inputPicker: {
    justifyContent: "center",
  },
  inputText: {
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  inputPlaceholder: {
    fontSize: fontSize.base,
    color: colors.muted,
  },
  errorBox: {
    backgroundColor: "#fee2e2",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.destructive,
    fontSize: fontSize.sm,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: fontSize.base,
    color: colors.foreground,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: fontSize.base,
    color: colors.primaryForeground,
    fontWeight: "700",
  },
  // Picker
  pickerOverlay: {
    flex: 1,
    backgroundColor: "#00000066",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.xxl,
  },
  pickerTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.muted,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerOptionActive: {
    backgroundColor: colors.badge,
  },
  pickerOptionText: {
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  pickerOptionActiveText: {
    color: colors.primary,
    fontWeight: "700",
  },
});
