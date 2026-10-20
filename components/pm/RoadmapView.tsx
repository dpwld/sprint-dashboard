"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronDown, ChevronRight, FolderKanban, Inbox } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { EmptyState } from "@/components/ds/feedback/EmptyState";
import type { PmProject, PmTask } from "@/types/domain";
import { pmToday } from "@/lib/data/pm";
import { compareTasks, PRIORITY_COLOR, PRIORITY_LABEL } from "./pmFormat";
import { PriorityBadge } from "./PriorityBadge";

/* Roadmap — Jira-style timeline: one bar per task from its start date
   (auto-set at creation, editable in the drawer) to its due date. Tasks are
   grouped under project header rows; bar colors show task priority.
   Bars/titles open the task drawer. All sprints appear here — the roadmap is
   the cross-sprint time view. */

const PX_PER_DAY = 18;
const LABEL_W = 220;
const ROW_H = 34;

function parseDay(s: string): number {
  return Math.floor(new Date(s + "T00:00:00").getTime() / 86400000);
}

function fmtTick(dayIdx: number): string {
  const d = new Date(dayIdx * 86400000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface Row {
  kind: "project" | "task";
  key: string;
  label: string;
  color: string;
  task?: PmTask;
  start?: number;
  end?: number;
}

export function RoadmapView({
  projects,
  tasks,
  onOpen,
}: {
  projects: PmProject[];
  tasks: PmTask[];
  onOpen: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // 완료 태스크 숨김 — localStorage로 기억 (Diagram과 공유).
  const [hideDone, setHideDone] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("pm.hideDone") === "1";
  });
  const toggleHideDone = () =>
    setHideDone((v) => {
      try { window.localStorage.setItem("pm.hideDone", v ? "0" : "1"); } catch { /* private mode */ }
      return !v;
    });
  const today = parseDay(pmToday());

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const { rows, minDay, maxDay } = useMemo(() => {
    const shown = hideDone ? tasks.filter((t) => t.status !== "done") : tasks;
    const startOf = (t: PmTask) => parseDay(t.startedOn ?? t.createdAt.slice(0, 10));
    const endOf = (t: PmTask) => Math.max(startOf(t), t.dueDate ? parseDay(t.dueDate) : startOf(t));

    const rows: Row[] = [];
    const groups: { project: PmProject | null; tasks: PmTask[] }[] = [
      ...projects
        .filter((p) => p.status !== "archived")
        .map((p) => ({ project: p as PmProject | null, tasks: shown.filter((t) => t.projectId === p.id) })),
      { project: null, tasks: shown.filter((t) => t.projectId === null || !projects.some((p) => p.id === t.projectId && p.status !== "archived")) },
    ];
    let lo = today, hi = today;
    groups.forEach((g) => {
      if (g.tasks.length === 0 && !g.project) return;
      const color = g.project ? PRIORITY_COLOR[g.project.priority] : "var(--gray-500)";
      rows.push({ kind: "project", key: g.project?.id ?? "none", label: g.project?.name ?? "misc.", color });
      [...g.tasks].sort((a, b) => startOf(a) - startOf(b) || compareTasks(a, b)).forEach((t) => {
        const s = startOf(t);
        const e = endOf(t);
        lo = Math.min(lo, s);
        hi = Math.max(hi, e);
        rows.push({ kind: "task", key: t.id, label: t.title, color: PRIORITY_COLOR[t.priority], task: t, start: s, end: e });
      });
    });
    return { rows, minDay: lo - 3, maxDay: hi + 10 };
  }, [projects, tasks, today, hideDone]);

  /** 오늘 세로선이 화면 왼쪽 1/3 지점에 오도록 스크롤 (마운트 시 + Today 버튼). */
  function scrollToToday(smooth = true) {
    const el = scrollRef.current;
    if (!el) return;
    const left = LABEL_W + (today - minDay) * PX_PER_DAY - (el.clientWidth - LABEL_W) / 3;
    el.scrollTo({ left: Math.max(0, left), behavior: smooth ? "smooth" : "auto" });
  }

  // 처음 열면 과거 구간이 아니라 오늘 주변이 보이게.
  useEffect(() => {
    scrollToToday(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rows.some((r) => r.kind === "task")) {
    return (
      <EmptyState
        icon={<CalendarRange size={24} />}
        title="Nothing on the roadmap yet"
        description="Tasks appear here as bars from their start date to their due date."
      />
    );
  }

  const groupKeys = rows.filter((r) => r.kind === "project").map((r) => r.key);
  const visibleRows: Row[] = [];
  let hideTasks = false;
  for (const r of rows) {
    if (r.kind === "project") {
      hideTasks = collapsed.has(r.key);
      visibleRows.push(r);
    } else if (!hideTasks) {
      visibleRows.push(r);
    }
  }

  const days = maxDay - minDay + 1;
  const chartW = days * PX_PER_DAY;
  // Week tick per Monday inside the window.
  const ticks: number[] = [];
  for (let d = minDay; d <= maxDay; d++) {
    if (new Date(d * 86400000).getDay() === 1) ticks.push(d);
  }

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
        <Button variant="soft" size="sm" leftIcon={<CalendarRange size={13} />} onClick={() => scrollToToday()}>Today</Button>
        <Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set())}>Expand all</Button>
        <Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set(groupKeys))}>Collapse all</Button>
        <Button variant={hideDone ? "soft" : "ghost"} size="sm" onClick={toggleHideDone}>
          {hideDone ? "Show done" : "Hide done"}
        </Button>
      </div>
    <div
      ref={scrollRef}
      className="sx-scroll"
      style={{ flex: 1, minHeight: 0, overflow: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}
    >
      <div style={{ position: "relative", width: LABEL_W + chartW, minWidth: "100%" }}>
        {/* Header: week ticks */}
        <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", background: "var(--surface-card)", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ width: LABEL_W, flexShrink: 0, position: "sticky", left: 0, zIndex: 6, background: "var(--surface-card)", borderRight: "1px solid var(--border-subtle)" }} />
          <div style={{ position: "relative", height: 30, width: chartW }}>
            {ticks.map((d) => (
              <span
                key={d}
                style={{ position: "absolute", left: (d - minDay) * PX_PER_DAY + 4, top: 7, fontSize: "var(--text-2xs)", color: "var(--text-subtle)", fontVariantNumeric: "tabular-nums" }}
              >
                {fmtTick(d)}
              </span>
            ))}
          </div>
        </div>

        {/* Body rows */}
        <div style={{ position: "relative" }}>
          {/* week grid lines + today line, spanning all rows */}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: LABEL_W, width: chartW, pointerEvents: "none" }}>
            {ticks.map((d) => (
              <span key={d} style={{ position: "absolute", top: 0, bottom: 0, left: (d - minDay) * PX_PER_DAY, borderLeft: "1px solid var(--border-subtle)", opacity: 0.6 }} />
            ))}
            {today >= minDay && today <= maxDay && (
              <span
                title="Today"
                style={{ position: "absolute", top: 0, bottom: 0, left: (today - minDay) * PX_PER_DAY + PX_PER_DAY / 2, borderLeft: "2px solid var(--amber-500)", zIndex: 1 }}
              />
            )}
          </div>

          {visibleRows.map((r) =>
            r.kind === "project" ? (
              <div key={"p-" + r.key} style={{ display: "flex", alignItems: "center", height: ROW_H, background: "var(--surface-sunken)", borderBottom: "1px solid var(--border-subtle)" }}>
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(r.key); } }}
                  onClick={() => toggle(r.key)}
                  title={collapsed.has(r.key) ? "Expand" : "Collapse"}
                  style={{ width: LABEL_W, flexShrink: 0, position: "sticky", left: 0, zIndex: 3, background: "var(--surface-sunken)", borderRight: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 7, padding: "0 10px", height: "100%", cursor: "pointer" }}
                >
                  {collapsed.has(r.key) ? <ChevronRight size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} /> : <ChevronDown size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
                  {r.key === "none" ? <Inbox size={13} style={{ color: "var(--text-muted)" }} /> : <FolderKanban size={13} style={{ color: r.color }} />}
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.label}
                  </span>
                </div>
              </div>
            ) : (
              <div key={r.key} style={{ display: "flex", alignItems: "center", height: ROW_H, borderBottom: "1px solid var(--border-subtle)" }}>
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r.key); } }}
                  onClick={() => onOpen(r.key)}
                  title={r.label}
                  style={{ width: LABEL_W, flexShrink: 0, position: "sticky", left: 0, zIndex: 3, background: "var(--surface-card)", borderRight: "1px solid var(--border-subtle)", padding: "0 10px 0 24px", height: "100%", display: "flex", alignItems: "center", cursor: "pointer" }}
                >
                  <PriorityBadge priority={r.task!.priority} />
                  <span
                    style={{
                      marginLeft: 6, fontSize: "var(--text-xs)", color: r.task!.status === "done" ? "var(--text-subtle)" : "var(--text-default)",
                      textDecoration: r.task!.status === "done" ? "line-through" : undefined,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {r.label}
                  </span>
                </div>
                <div style={{ position: "relative", height: "100%", width: chartW }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r.key); } }}
                    onClick={() => onOpen(r.key)}
                    title={`${r.label} (${PRIORITY_LABEL[r.task!.priority]}) · ${r.task!.startedOn ?? r.task!.createdAt.slice(0, 10)} → ${r.task!.dueDate ?? "no due date"}`}
                    style={{
                      position: "absolute",
                      top: 8,
                      height: ROW_H - 16,
                      left: (r.start! - minDay) * PX_PER_DAY,
                      width: Math.max(PX_PER_DAY, (r.end! - r.start! + 1) * PX_PER_DAY),
                      background: r.color,
                      opacity: r.task!.status === "done" ? 0.4 : 0.9,
                      borderRadius: 5,
                      cursor: "pointer",
                      zIndex: 2,
                    }}
                  />
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
