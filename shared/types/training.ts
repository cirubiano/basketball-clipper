export interface TrainingDrill {
  id: number;
  training_id: number;
  drill_id: number;
  position: number;
  notes: string | null;
  drill_title: string | null;
  drill_type: string | null;
}

export interface TrainingAttendance {
  id: number;
  training_id: number;
  player_id: number;
  attended: boolean;
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
}

export interface TrainingDrillReorderItem {
  drill_id: number;
  position: number;
}

export interface AttendanceUpdate {
  player_id: number;
  attended: boolean;
}
