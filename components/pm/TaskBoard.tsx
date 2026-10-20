"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardBody } from "@/components/ds/data/Card";
import { Badge } from "@/components/ds/core/Badge";
import { Tag } from "@/components/ds/core/Tag";
import { unmetSprintRules } from "@/lib/data/pm";
import type { PmProject, PmTask, PmTaskStatus } from "@/types/domain";
import { STATUS_ORDER, STATUS_LABEL, STATUS_TONE, PRIORITY_DOT, PRIORITY_LABEL, PRIORITY_COLOR, projectHue, dday, compareTasks } from "./pmFormat";
import { Avatar } from "@/components/ds/core/Avatar";
import { memberName } from "@/lib/mock/team";

/** Kanban of one sprint's tasks, columns by status. Cards open the drawer on
   click and DRAG between columns (native HTML5 dnd — no lib); the ‹ › chevrons
   remain as a keyboard/precision fallback. */
export function TaskBoard({
  tasks,
  projects,
  selectedId,
  onSelect,
  onMove,
}: {
  tasks: PmTask[];
  projects: PmProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (task: PmTask, status: PmTaskStatus) => void;
}) {
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<PmTaskStatus | null>(null);

  // ── 드래그 오토스크롤 — 보드 가장자리(가로)와 긴 컬럼의 위/아래(세로)를 따라간다.
  //    HTML5 드래그·터치 리프트 양쪽에서 같은 helper를 쓴다.
  const boardRef = useRef<HTMLDivElement | null>(null);
  const scrollVel = useRef<{ h: number; v: number; vEl: HTMLElement | null }>({ h: 0, v: 0, vEl: null });
  const rafId = useRef<number | null>(null);
  const tick = () => {
    const { h, v, vEl } = scrollVel.current;
    const root = boardRef.current;
    if (!(root && h) && !(vEl && v)) { rafId.current = null; return; }
    if (root && h) root.scrollLeft += h;
    if (vEl && v) vEl.scrollTop += v;
    rafId.current = requestAnimationFrame(tick);
  };
  function autoScrollAt(x: number, y: number, target: EventTarget | null) {
    const EDGE = 70;
    const speed = (d: number) => Math.max(4, Math.ceil((EDGE - d) / 5));
    const root = boardRef.current;
    let h = 0;
    if (root && root.scrollWidth > root.clientWidth + 4) {
      const r = root.getBoundingClientRect();
      if (x < r.left + EDGE) h = -speed(x - r.left);
      else if (x > r.right - EDGE) h = speed(r.right - x);
    }
    let v = 0;
    let vEl: HTMLElement | null = null;
    const col = (target instanceof Element ? target : null)?.closest("[data-status]") as HTMLElement | null;
    const list = col?.querySelector<HTMLElement>(".sx-scroll") ?? null;
    if (list && list.scrollHeight > list.clientHeight + 4) {
      const r = list.getBoundingClientRect();
      if (y < r.top + EDGE) v = -speed(y - r.top);
      else if (y > r.bottom - EDGE) v = speed(r.bottom - y);
      if (v) vEl = list;
    }
    scrollVel.current = { h, v, vEl };
    if ((h || v) && rafId.current == null) rafId.current = requestAnimationFrame(tick);
  }
  useEffect(() => {
    const stop = () => { scrollVel.current = { h: 0, v: 0, vEl: null }; };
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
      window.removeEventListener("pointerup", stop);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  /** Touch fallback for drag & drop (HTML5 dnd is mouse-only): long-press a
     card (~350ms without moving) to lift it, slide your finger over a column,
     release to drop. Page scroll is blocked only while a card is lifted. */
  function startTouchDrag(e: React.PointerEvent, taskId: string) {
    if (e.pointerType !== "touch") return;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const watchMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 12) moved = true;
    };
    const timer = window.setTimeout(() => {
      window.removeEventListener("pointermove", watchMove);
      window.removeEventListener("pointerup", abort);
      if (!moved) liftCard(taskId);
    }, 350);
    const abort = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", watchMove);
      window.removeEventListener("pointerup", abort);
    };
    window.addEventListener("pointermove", watchMove);
    window.addEventListener("pointerup", abort);
  }

  function liftCard(taskId: string) {
    setDragId(taskId);
    if (navigator.vibrate) navigator.vibrate(10);
    const blockScroll = (ev: TouchEvent) => ev.preventDefault();
    const colAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      return (el?.closest("[data-status]") as HTMLElement | null)?.dataset.status as PmTaskStatus | undefined;
    };
    const onPointerMoveWin = (ev: PointerEvent) => {
      setOverCol(colAt(ev.clientX, ev.clientY) ?? null);
      autoScrollAt(ev.clientX, ev.clientY, document.elementFromPoint(ev.clientX, ev.clientY));
    };
    const onPointerUpWin = (ev: PointerEvent) => {
      const status = colAt(ev.clientX, ev.clientY);
      const task = tasks.find((t) => t.id === taskId);
      if (task && status && task.status !== status) onMove(task, status);
      setDragId(null);
      setOverCol(null);
      window.removeEventListener("pointermove", onPointerMoveWin);
      window.removeEventListener("pointerup", onPointerUpWin);
      document.removeEventListener("touchmove", blockScroll);
    };
    window.addEventListener("pointermove", onPointerMoveWin);
    window.addEventListener("pointerup", onPointerUpWin);
    document.addEventListener("touchmove", blockScroll, { passive: false });
  }

  return (
    // Columns stretch to full height so a drop lands even on the blank area
    // below the cards (the whole column is the [data-status] target).
    <div
      className="sx-board-swipe"
      ref={boardRef}
      onDragOverCapture={(e) => autoScrollAt(e.clientX, e.clientY, e.target)}
      style={{ display: "flex", gap: 16, height: "100%", minHeight: 0, alignItems: "stretch" }}
    >
      {STATUS_ORDER.map((status) => {
        const items = tasks.filter((t) => t.status === status).sort(compareTasks);
        return (
          <div
            key={status}
            data-status={status}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("text/pm-board-task")) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverCol(status);
            }}
            onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/pm-board-task");
              const task = tasks.find((t) => t.id === id);
              if (task && task.status !== status) onMove(task, status);
              setDragId(null);
              setOverCol(null);
            }}
            style={{
              flex: 1, minWidth: 220, display: "flex", flexDirection: "column",
              borderRadius: "var(--radius-md)",
              outline: overCol === status && dragId ? "1.5px dashed var(--color-primary)" : "none",
              outlineOffset: 2,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 10px" }}>
              <Badge tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</Badge>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                {items.length}
              </span>
            </div>
            <div className="sx-scroll" style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", paddingRight: 2, minHeight: 0, flex: 1 }}>
              {items.map((t) => {
                const selected = t.id === selectedId;
                const d = dday(t.dueDate);
                const proj = projectName(t.projectId);
                const checkedCount = t.checklist.filter((c) => c.done).length;
                return (
                  <Card
                    key={t.id}
                    interactive
                    draggable
                    onDragStart={(e: React.DragEvent) => {
                      e.dataTransfer.setData("text/pm-board-task", t.id);
                      e.dataTransfer.effectAllowed = "move";
                      // defer: re-rendering the dragged node during dragstart cancels the drag in Chrome
                      setTimeout(() => setDragId(t.id), 0);
                    }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onPointerDown={(e: React.PointerEvent) => startTouchDrag(e, t.id)}
                    onClick={() => onSelect(t.id)}
                    style={{
                      cursor: "grab",
                      flexShrink: 0, // tall columns must scroll, not squash the cards
                      opacity: dragId === t.id ? 0.4 : 1,
                      background: t.status === "hold"
                        ? "color-mix(in srgb, var(--gray-400, #9ca3af) 16%, var(--surface-card))"
                        : `color-mix(in srgb, ${PRIORITY_COLOR[t.priority]} 8%, var(--surface-card))`,
                      ...(selected ? { borderColor: "var(--color-primary)", boxShadow: "var(--ring-focus)" } : {}),
                    }}
                  >
                    <CardBody style={{ padding: "9px 12px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, marginTop: 5, background: PRIORITY_DOT[t.priority] }} title={PRIORITY_LABEL[t.priority]} />
                        <span title={t.title} style={{ flex: 1, fontWeight: 600, color: "var(--text-strong)", fontSize: "var(--text-sm)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</span>
                        {t.status !== "done" && unmetSprintRules(t).length > 0 && (
                          <span title={"Sprint rules unmet:\n" + unmetSprintRules(t).join("\n")}
                            style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: "var(--amber-600, #b45309)", background: "var(--amber-50, #fffbeb)", borderRadius: 4, padding: "0 4px" }}>⚠</span>
                        )}
                      </div>
                      {proj && (
                        <div style={{ marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{
                            fontSize: "var(--text-2xs)", fontWeight: 600, borderRadius: 999, padding: "1px 8px",
                            background: `hsl(${projectHue(t.projectId ?? "")} 0% 92%)`,
                            color: `hsl(${projectHue(t.projectId ?? "")} 0% 32%)`,
                          }}>
                            {proj}
                          </span>
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 6 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          {t.assigneeKey ? <Avatar name={memberName(t.assigneeKey)} size="xs" /> : <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>Unassigned</span>}
                          {t.checklist.length > 0 && (
                            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                              ☑ {checkedCount}/{t.checklist.length}
                            </span>
                          )}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {d && (
                            <Tag size="sm" dotColor={d.overdue ? "var(--red-500)" : d.dueToday ? "var(--amber-500)" : null} active={d.overdue}>
                              {d.label}
                            </Tag>
                          )}
                        </span>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
              {items.length === 0 && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", padding: "8px 4px" }}>N/A</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
