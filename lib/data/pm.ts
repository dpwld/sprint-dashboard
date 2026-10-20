import type { PmComment, PmProject, PmDailyLog, PmSprint, PmTask } from "@/types/domain";
import { api } from "./http";

export interface PmData {
  projects: PmProject[];
  sprints: PmSprint[];
  tasks: PmTask[];
  /** All task comments (mention table + drawer threads). */
  comments: PmComment[];
}


export function canSeeProject(p: PmProject, meId: string, isAdmin: boolean): boolean {
  if (p.visibility !== "private" || isAdmin) return true;
  return p.ownerKey === meId || p.createdByKey === meId || p.coOwnerKeys.includes(meId) || p.memberKeys.includes(meId);
}


export type PmProjectInput = Pick<PmProject, "name" | "description" | "status" | "ownerKey" | "targetDate"> & {
  priority?: PmProject["priority"];
  createdByKey?: string;
  /** Sprint 팀 파티션 — 생략 시 engineering. */
  team?: PmProject["team"];
  /** 표시 순서 — 새 프로젝트는 기존 최소값보다 작게 넣어 맨 앞에 보이게 한다. */
  sort?: number;
};


export type PmTaskInput = Pick<PmTask, "title" | "description" | "projectId" | "sprintId" | "assigneeKey" | "status" | "priority" | "dueDate"> & {
  /** Defaults to today (the registration day) when omitted. */
  startedOn?: string | null;
  checklist?: PmTask["checklist"];
  createdByKey?: string;
  /** Sprint 팀 파티션 — 생략 시 engineering. */
  team?: PmTask["team"];
};


export const fetchPm = () => api<PmData>("workspace");
export const insertProject = (input: PmProjectInput) => api<PmProject>("projects", input);
export const updateProject = (id: string, patch: Partial<PmProject>) => api<PmProject>(`projects/${id}`, patch, "PATCH");
export const deleteProject = (id: string) => api<void>(`projects/${id}`, undefined, "DELETE");
export const restoreProjectRow = (row: PmProject) => api<PmProject>("projects", { ...row, restore: true });
export const insertTask = (input: PmTaskInput) => api<PmTask>("tasks", input);
export const updateTask = (id: string, patch: Partial<PmTask>) => api<PmTask>(`tasks/${id}`, patch, "PATCH");
export const deleteTask = (id: string) => api<void>(`tasks/${id}`, undefined, "DELETE");
export const restoreTaskRow = (row: PmTask) => api<PmTask>("tasks", { ...row, restore: true });
export const insertTaskComment = (taskId: string, authorKey: string, body: string) => api<PmComment>("comments", { taskId, authorKey, body });
export const deleteTaskComment = (id: string) => api<void>(`comments/${id}`, undefined, "DELETE");
export type DailyLogKind = "project" | "task";
export const fetchDailyLogs = (kind: DailyLogKind, targetId: string) => api<PmDailyLog[]>(`logs?kind=${kind}&targetId=${encodeURIComponent(targetId)}`);
export const insertDailyLog = (kind: DailyLogKind, targetId: string, logDate: string, body: string, authorKey: string) => api<PmDailyLog>("logs", { kind, targetId, logDate, body, authorKey });
export const deleteDailyLog = (kind: DailyLogKind, id: string) => api<void>(`logs/${id}`, undefined, "DELETE");
export function pmToday(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
export async function uploadPmFile(file: File): Promise<string> {
 const data = new FormData(); data.append("file", file);
 const response = await fetch("/api/files", {method:"POST", body:data}); const json = await response.json() as {error?:string;path:string};
 if (!response.ok) throw new Error(json.error || "Upload failed"); return json.path;
}
export async function pmFileUrl(path: string): Promise<string> { return `/api/files?path=${encodeURIComponent(path)}`; }

export function unmetSprintRules(t: Pick<PmTask, "description" | "assigneeKey" | "dueDate" | "checkpointDate" | "doneCriteria">): string[] {
  const unmet: string[] = [];
  const outcome = (t.description ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  if (!outcome) unmet.push("Outcome — write the objective (what the final deliverable is)");
  if (!t.assigneeKey || !t.dueDate || !t.checkpointDate) unmet.push("Who · due date · checkpoint (mid-point report date)");
  if (!(t.doneCriteria ?? "").trim()) unmet.push("Definition of done — what level counts as finished");
  return unmet;
}
