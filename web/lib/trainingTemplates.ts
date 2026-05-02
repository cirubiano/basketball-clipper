// #25 — Plantillas reutilizables de entrenamiento
// Templates are stored in localStorage keyed by team. No backend needed.

export interface TemplateEntry {
  drill_id: number;
  drill_title: string;
  duration_minutes?: number | null;
  notes?: string | null;
}

export interface TrainingTemplate {
  id: string;
  name: string;
  drills: TemplateEntry[];
  savedAt: string; // ISO string
}

function storageKey(teamId: number) {
  return `training_templates_${teamId}`;
}

export function loadTemplates(teamId: number): TrainingTemplate[] {
  try {
    const raw = localStorage.getItem(storageKey(teamId));
    return raw ? (JSON.parse(raw) as TrainingTemplate[]) : [];
  } catch {
    return [];
  }
}

export function saveTemplate(teamId: number, template: TrainingTemplate): void {
  try {
    const existing = loadTemplates(teamId).filter((t) => t.id !== template.id);
    localStorage.setItem(storageKey(teamId), JSON.stringify([template, ...existing]));
  } catch { /* ignore */ }
}

export function deleteTemplate(teamId: number, templateId: string): void {
  try {
    const updated = loadTemplates(teamId).filter((t) => t.id !== templateId);
    localStorage.setItem(storageKey(teamId), JSON.stringify(updated));
  } catch { /* ignore */ }
}

export function makeTemplateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
