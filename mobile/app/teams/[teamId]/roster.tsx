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
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPlayers,
  listRoster,
  addToRoster,
  updateRosterEntry,
  removeFromRoster,
} from "@basketball-clipper/shared/api";
import { ROSTER_POSITION_LABELS } from "@basketball-clipper/shared/types";
import type {
  Player,
  RosterEntry,
  RosterEntryCreate,
  RosterEntryUpdate,
  RosterPosition,
} from "@basketball-clipper/shared/types";
import { useAuth } from "../../../lib/auth";
import { colors, fontSize, radius, spacing } from "../../../lib/theme";

const POSITIONS: RosterPosition[] = [
  "point_guard",
  "shooting_guard",
  "small_forward",
  "power_forward",
  "center",
];

const STAT_FIELDS = [
  { key: "points_per_game" as const, label: "Puntos" },
  { key: "rebounds_per_game" as const, label: "Rebotes" },
  { key: "assists_per_game" as const, label: "Asistencias" },
  { key: "minutes_per_game" as const, label: "Minutos" },
];

export default function RosterScreen() {
  const { teamId: teamIdStr } = useLocalSearchParams<{ teamId: string }>();
  const teamId = Number(teamIdStr);
  const { token, activeProfile } = useAuth();
  const clubId = activeProfile?.club_id;
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<RosterEntry | null>(null);
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  const [posPickerOpen, setPosPickerOpen] = useState(false);
  const [posPickerTarget, setPosPickerTarget] = useState<"add" | "edit">("add");
  const [addForm, setAddForm] = useState<{
    playerId: number | null;
    jersey: string;
    position: RosterPosition | null;
  }>({ playerId: null, jersey: "", position: null });
  const [editForm, setEditForm] = useState<RosterEntryUpdate>({});
  const [formError, setFormError] = useState<string | null>(null);

  const { data: roster = [], isLoading } = useQuery({
    queryKey: ["roster", clubId, teamId],
    queryFn: () => listRoster(token!, clubId!, teamId),
    enabled: !!token && !!clubId && !!teamId,
  });

  const { data: allPlayers = [] } = useQuery({
    queryKey: ["players", clubId],
    queryFn: () => listPlayers(token!, clubId!),
    enabled: !!token && !!clubId && addOpen,
  });

  const rosterPlayerIds = new Set(roster.map((e) => e.player_id));
  const availablePlayers = allPlayers.filter(
    (p) => !rosterPlayerIds.has(p.id) && !p.archived_at,
  );

  const addMutation = useMutation({
    mutationFn: (data: RosterEntryCreate) =>
      addToRoster(token!, clubId!, teamId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster", clubId, teamId] });
      setAddOpen(false);
      setAddForm({ playerId: null, jersey: "", position: null });
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: RosterEntryUpdate }) =>
      updateRosterEntry(token!, clubId!, teamId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster", clubId, teamId] });
      setEditEntry(null);
      setEditForm({});
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => removeFromRoster(token!, clubId!, teamId, id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["roster", clubId, teamId] }),
  });

  function openEdit(entry: RosterEntry) {
    setEditEntry(entry);
    setEditForm({
      jersey_number: entry.jersey_number,
      position: entry.position,
      points_per_game: entry.points_per_game,
      rebounds_per_game: entry.rebounds_per_game,
      assists_per_game: entry.assists_per_game,
      minutes_per_game: entry.minutes_per_game,
    });
    setFormError(null);
  }

  function confirmRemove(entry: RosterEntry) {
    Alert.alert(
      "Retirar jugador",
      `¿Retirar a ${entry.player.first_name} ${entry.player.last_name} de la plantilla?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Retirar",
          style: "destructive",
          onPress: () => removeMutation.mutate(entry.id),
        },
      ],
    );
  }

  function openPositionPicker(target: "add" | "edit") {
    setPosPickerTarget(target);
    setPosPickerOpen(true);
  }

  function selectPosition(pos: RosterPosition | null) {
    if (posPickerTarget === "add") {
      setAddForm((f) => ({ ...f, position: pos }));
    } else {
      setEditForm((f) => ({ ...f, position: pos }));
    }
    setPosPickerOpen(false);
  }

  const selectedPlayer = availablePlayers.find(
    (p) => p.id === addForm.playerId,
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={roster}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.jersey}>
              <Text style={styles.jerseyText}>
                {item.jersey_number != null
                  ? String(item.jersey_number).padStart(2, "0")
                  : "--"}
              </Text>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.player.first_name[0]}
                {item.player.last_name[0]}
              </Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>
                {item.player.first_name} {item.player.last_name}
              </Text>
              <Text style={styles.meta}>
                {item.position ? ROSTER_POSITION_LABELS[item.position] : "Sin posición"}
                {item.points_per_game != null
                  ? ` · ${item.points_per_game} ppg · ${item.rebounds_per_game} rpg`
                  : ""}
              </Text>
            </View>
            <View style={styles.rowActions}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => openEdit(item)}
              >
                <Text style={styles.iconBtnText}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, styles.iconBtnDestructive]}
                onPress={() => confirmRemove(item)}
              >
                <Text style={[styles.iconBtnText, styles.iconBtnDestructiveText]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Plantilla</Text>
              <Text style={styles.subtitle}>
                {roster.length} jugador{roster.length !== 1 ? "es" : ""}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => {
                setFormError(null);
                setAddOpen(true);
              }}
            >
              <Text style={styles.addBtnText}>+ Añadir</Text>
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
              <Text style={styles.emptyText}>La plantilla está vacía.</Text>
              <TouchableOpacity onPress={() => setAddOpen(true)}>
                <Text style={styles.emptyLink}>Añade el primer jugador</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {/* Modal añadir jugador */}
      <Modal
        visible={addOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddOpen(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Añadir jugador</Text>
            <TouchableOpacity onPress={() => setAddOpen(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Jugador</Text>
            <TouchableOpacity
              style={[styles.input, styles.inputPicker]}
              onPress={() => setPlayerPickerOpen(true)}
            >
              <Text
                style={selectedPlayer ? styles.inputText : styles.inputPlaceholder}
              >
                {selectedPlayer
                  ? `${selectedPlayer.first_name} ${selectedPlayer.last_name}`
                  : "Selecciona un jugador"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>Dorsal</Text>
            <TextInput
              style={styles.input}
              value={addForm.jersey}
              onChangeText={(v) => setAddForm((f) => ({ ...f, jersey: v }))}
              placeholder="4"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
            />

            <Text style={styles.label}>Posición</Text>
            <TouchableOpacity
              style={[styles.input, styles.inputPicker]}
              onPress={() => openPositionPicker("add")}
            >
              <Text
                style={
                  addForm.position ? styles.inputText : styles.inputPlaceholder
                }
              >
                {addForm.position
                  ? ROSTER_POSITION_LABELS[addForm.position]
                  : "Sin posición"}
              </Text>
            </TouchableOpacity>

            {formError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setAddOpen(false)}
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                (!addForm.playerId || addMutation.isPending) &&
                  styles.saveBtnDisabled,
              ]}
              disabled={!addForm.playerId || addMutation.isPending}
              onPress={() =>
                addMutation.mutate({
                  player_id: addForm.playerId!,
                  jersey_number: addForm.jersey ? Number(addForm.jersey) : null,
                  position: addForm.position,
                })
              }
            >
              <Text style={styles.saveBtnText}>
                {addMutation.isPending ? "Añadiendo..." : "Añadir"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Picker de jugadores disponibles */}
        <Modal
          visible={playerPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPlayerPickerOpen(false)}
        >
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setPlayerPickerOpen(false)}
          >
            <View style={styles.pickerSheet}>
              <Text style={styles.pickerTitle}>Selecciona un jugador</Text>
              {availablePlayers.length === 0 ? (
                <View style={styles.pickerEmpty}>
                  <Text style={styles.pickerEmptyText}>
                    Todos los jugadores del club ya están en la plantilla.
                  </Text>
                </View>
              ) : (
                <ScrollView>
                  {availablePlayers.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.pickerOption,
                        addForm.playerId === p.id && styles.pickerOptionActive,
                      ]}
                      onPress={() => {
                        setAddForm((f) => ({ ...f, playerId: p.id }));
                        setPlayerPickerOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          addForm.playerId === p.id &&
                            styles.pickerOptionActiveText,
                        ]}
                      >
                        {p.first_name} {p.last_name}
                      </Text>
                      {p.position && (
                        <Text style={styles.pickerOptionMeta}>
                          {ROSTER_POSITION_LABELS[p.position]}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </TouchableOpacity>
        </Modal>
      </Modal>

      {/* Modal editar entrada de plantilla */}
      <Modal
        visible={editEntry !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditEntry(null)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editEntry
                ? `${editEntry.player.first_name} ${editEntry.player.last_name}`
                : "Editar"}
            </Text>
            <TouchableOpacity onPress={() => setEditEntry(null)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Dorsal</Text>
            <TextInput
              style={styles.input}
              value={
                editForm.jersey_number != null
                  ? String(editForm.jersey_number)
                  : ""
              }
              onChangeText={(v) =>
                setEditForm((f) => ({
                  ...f,
                  jersey_number: v ? Number(v) : null,
                }))
              }
              placeholder="--"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
            />

            <Text style={styles.label}>Posición</Text>
            <TouchableOpacity
              style={[styles.input, styles.inputPicker]}
              onPress={() => openPositionPicker("edit")}
            >
              <Text
                style={
                  editForm.position ? styles.inputText : styles.inputPlaceholder
                }
              >
                {editForm.position
                  ? ROSTER_POSITION_LABELS[editForm.position]
                  : "Sin posición"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>
              Estadísticas (media por partido)
            </Text>
            {STAT_FIELDS.map(({ key, label }) => (
              <View key={key}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  style={styles.input}
                  value={
                    editForm[key] != null ? String(editForm[key]) : ""
                  }
                  onChangeText={(v) =>
                    setEditForm((f) => ({
                      ...f,
                      [key]: v ? Number(v) : null,
                    }))
                  }
                  placeholder="0.0"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                />
              </View>
            ))}

            {formError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setEditEntry(null)}
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                updateMutation.isPending && styles.saveBtnDisabled,
              ]}
              disabled={updateMutation.isPending}
              onPress={() =>
                editEntry &&
                updateMutation.mutate({ id: editEntry.id, data: editForm })
              }
            >
              <Text style={styles.saveBtnText}>
                {updateMutation.isPending ? "Guardando..." : "Guardar"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Picker compartido de posición */}
      <Modal
        visible={posPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPosPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setPosPickerOpen(false)}
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Posición</Text>
            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => selectPosition(null)}
            >
              <Text style={styles.pickerOptionText}>Sin posición</Text>
            </TouchableOpacity>
            {POSITIONS.map((pos) => {
              const current =
                posPickerTarget === "add" ? addForm.position : editForm.position;
              return (
                <TouchableOpacity
                  key={pos}
                  style={[
                    styles.pickerOption,
                    current === pos && styles.pickerOptionActive,
                  ]}
                  onPress={() => selectPosition(pos)}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      current === pos && styles.pickerOptionActiveText,
                    ]}
                  >
                    {ROSTER_POSITION_LABELS[pos]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
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
    gap: spacing.sm,
  },
  jersey: {
    width: 32,
    alignItems: "center",
  },
  jerseyText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: colors.muted,
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
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
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
    maxHeight: "70%",
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
  pickerOptionMeta: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 2,
  },
  pickerEmpty: {
    padding: spacing.xl,
    alignItems: "center",
  },
  pickerEmptyText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
});
