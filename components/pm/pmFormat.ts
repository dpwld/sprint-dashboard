import type { CSSProperties } from "react";
import type { PmPriority, PmProjectStatus, PmTask, PmTaskStatus } from "@/types/domain";
import type { BadgeTone } from "@/components/ds/core/Badge";
import { pmToday } from "@/lib/data/pm";

/* Labels, tones and small date helpers shared by the Sprint views. */

export const STATUS_ORDER: PmTaskStatus[] = ["todo", "in_progress", "review", "hold", "done"];

export const STATUS_LABEL: Record<PmTaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  hold: "On hold",
  done: "Done",
};

/* 노션식 컬러 칩 — 상태/우선순위별 고정 색 + 배경 틴트 헬퍼. */
export const STATUS_COLOR: Record<PmTaskStatus, string> = {
  todo: "var(--gray-500, #6b7280)",
  in_progress: "var(--blue-500, #3b82f6)",
  review: "var(--amber-500, #f59e0b)",
  hold: "var(--gray-400, #9ca3af)",
  done: "var(--green-500, #22c55e)",
};

export const PRIORITY_COLOR: Record<PmPriority, string> = {
  urgent: "var(--red-500, #ef4444)",
  high: "var(--amber-500, #f59e0b)",
  medium: "var(--blue-500, #3b82f6)",
  low: "var(--green-500, #22c55e)",
};

/** 컬러 필(pill) 인라인 스타일 — 드로어의 상태/우선순위 셀렉트에 씌운다. */
export function pillStyle(color: string): CSSProperties {
  return {
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    color: `color-mix(in srgb, ${color} 72%, var(--text-strong))`,
    borderRadius: 999,
    fontWeight: 600,
    width: "auto",
  };
}

/** 프로젝트 칩 색 — id 해시로 고정 hue. */
export function projectHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export const STATUS_TONE: Record<PmTaskStatus, BadgeTone> = {
  todo: "neutral",
  in_progress: "info",
  review: "warning",
  hold: "neutral",
  done: "success",
};

export const PRIORITY_ORDER: PmPriority[] = ["urgent", "high", "medium", "low"];

export const PRIORITY_LABEL: Record<PmPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Same dot palette as the Notion snapshot card (home/SprintCard). */
export const PRIORITY_DOT: Record<PmPriority, string> = {
  urgent: "var(--red-500)",
  high: "var(--amber-500)",
  medium: "var(--blue-500)",
  low: "var(--gray-400)",
};

export const PROJECT_STATUS_LABEL: Record<PmProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Done",
  archived: "Archived",
};

export const PROJECT_STATUS_TONE: Record<PmProjectStatus, BadgeTone> = {
  active: "info",
  paused: "warning",
  done: "success",
  archived: "neutral",
};

/** "D-3" / "D-day" / "D+2" (overdue) from a yyyy-mm-dd due date. */
export function dday(due: string | null): { label: string; overdue: boolean; dueToday: boolean } | null {
  if (!due) return null;
  const today = new Date(pmToday() + "T00:00:00");
  const d = new Date(due + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { label: "D-day", overdue: false, dueToday: true };
  if (diff > 0) return { label: `D-${diff}`, overdue: false, dueToday: false };
  return { label: `D+${-diff}`, overdue: true, dueToday: false };
}

/** Whole days from today to `due` (negative = overdue), or null without a due date. */
export function daysUntil(due: string | null): number | null {
  if (!due) return null;
  const today = new Date(pmToday() + "T00:00:00");
  const d = new Date(due + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/** Open = anything not done. */
export function isOpen(t: PmTask): boolean {
  return t.status !== "done";
}

export function isOverdue(t: PmTask): boolean {
  // 보류(hold)는 일부러 멈춘 상태 — 지연으로 취급하지 않는다.
  return isOpen(t) && t.status !== "hold" && !!t.dueDate && t.dueDate < pmToday();
}

export function isDueToday(t: PmTask): boolean {
  return isOpen(t) && t.dueDate === pmToday();
}

/** Default board/list ordering: overdue → priority → due date → manual sort. */
export function compareTasks(a: PmTask, b: PmTask): number {
  // 보류는 항상 목록 아래로 가라앉는다 (done 그룹보다는 위 — 뷰별 sink가 우선).
  const ah = a.status === "hold" ? 1 : 0;
  const bh = b.status === "hold" ? 1 : 0;
  if (ah !== bh) return ah - bh;
  const ao = isOverdue(a) ? 0 : 1;
  const bo = isOverdue(b) ? 0 : 1;
  if (ao !== bo) return ao - bo;
  const pr = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
  if (pr !== 0) return pr;
  const due = (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
  if (due !== 0) return due;
  return a.sort - b.sort;
}

/** "7/27 – 8/9" range label for a sprint. */

/** Rollup completion: done / total (0 when no tasks). */
export function rollup(tasks: PmTask[]): { done: number; total: number; pct: number } {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}
