export type AbsenceReason = "injury" | "personal" | "sanction" | "other";

export const ABSENCE_REASON_LABELS: Record<AbsenceReason, string> = {
  injury: "Lesión",
  personal: "Personal",
  sanction: "Sanción",
  other: "Otro",
};

export interface TrainingDrillGroupPlayer {
  id: number;
  first_name: string;
  last_name: string;
}

export interface TrainingDrillGroup {
  id: number;
  training_drill_id: number;
  group_number: number;
  players: TrainingDrillGroupPlayer[];
}

export interface TrainingDrillGroupUpsert {
  groups: Array<{
    group_number: number;
    player_ids: number[];
  }>;
}

export interface TrainingDrill {
  id: number;
  training_id: number;
  drill_id: number;
  position: number;
  notes: string | null;
  duration_minutes: number | null;
  drill_title: string | null;
  drill_type: string | null;
  groups: TrainingDrillGroup[];
}

export interface TrainingAttendance {
  id: number;
  training_id: number;
  player_id: number;
  attended: boolean;
  is_late: boolean;
  absence_reason: AbsenceReason | null;
  notes: string | null;
  player_first_name: string | null;
  player_last_name: string | null;
}

export interface Training {
  id: number;
  team_id: number;
  season_id: number;
  date: string;
  title: string;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  archived_at: string | null;
  training_drills: TrainingDrill[];
  training_attendances: TrainingAttendance[];
}

export interface TrainingCreate {
  title: string;
  date: string;
  season_id: number;
  notes?: string | null;
}

export interface TrainingUpdate {
  title?: string;
  date?: string;
  notes?: string | null;
}

export interface TrainingDrillAdd {
  drill_id: number;
  notes?: string | null;
  duration_minutes?: number | null;
}

export interface TrainingDrillUpdate {
  duration_minutes?: number | null;
  notes?: string | null;
}

export interface TrainingDrillReorderItem {
  drill_id: number;
  position: number;
}

export interface AttendanceUpdate {
  player_id: number;
  attended: boolean;
  is_late?: boolean;
  absence_reason?: AbsenceReason | null;
  notes?: string | null;
}

export interface TrainingBulkDrillItem {
  drill_id: number;
  duration_minutes?: number | null;
}

export interface TrainingBulkItem {
  title: string;
  date: string;
  notes?: string | null;
  drills: TrainingBulkDrillItem[];
}

export interface TrainingBulkCreate {
  season_id: number;
  trainings: TrainingBulkItem[];
}

