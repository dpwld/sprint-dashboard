"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FolderKanban, Plus, Inbox, SquareMousePointer, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ds/core/Badge";
import { Tag } from "@/components/ds/core/Tag";
import { Checkbox } from "@/components/ds/forms/Checkbox";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Button } from "@/components/ds/core/Button";
import { EmptyState } from "@/components/ds/feedback/EmptyState";
import type { PmProject, PmTask } from "@/types/domain";
import { TEAM_MEMBERS } from "@/lib/mock/team";
import { STATUS_LABEL, STATUS_TONE, PRIORITY_DOT, PRIORITY_LABEL, dday, compareTasks, rollup } from "./pmFormat";
import { UserAvatar } from "@/components/common/UserAvatar";
import { unmetSprintRules } from "@/lib/data/pm";

/* 다이어그램 뷰 — 프로젝트를 뿌리로 작업·체크리스트가 가지처럼 뻗는 트리.
   스프린트는 소속이 아니라 시간 축이므로 각 작업에 배지로만 표시한다.
   인라인 생성(제목 + Enter), 체크리스트 즉석 토글, 작업 드래그로 프로젝트
   간 이동을 지원한다. 노드 클릭 = 기존 드로어. */

const GUIDE = "1.5px solid var(--border-default)";
const GUIDE_SOFT = "1.5px dashed var(--border-subtle)";

/** Branch row wrapper: draws the elbow connector to the parent guide line. */
function Branch({ children, dashed = false }: { children: React.ReactNode; dashed?: boolean }) {
  return (
    <div style={{ position: "relative", paddingLeft: 18 }}>
      <span
        style={{
          position: "absolute", left: 0, top: 16, width: 14,
          borderTop: dashed ? GUIDE_SOFT : GUIDE,
        }}
      />
      {children}
    </div>
  );
}

/** Inline "+ 추가" row that expands into a small input. Enter adds the item
   and KEEPS the input open/focused so you can chain entries; blur or Escape
   closes it (blur still saves what's typed). */
function InlineAdd({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "none", cursor: "pointer", color: "var(--text-subtle)", fontSize: "var(--text-xs)", padding: "4px 0" }}
      >
        <Plus size={12} /> {label}
      </button>
    );
  }
  const commit = (keepOpen: boolean) => {
    if (text.trim()) onAdd(text.trim());
    setText("");
    if (!keepOpen) setEditing(false);
  };
  return (
    <div style={{ display: "flex", gap: 6, maxWidth: 340, padding: "2px 0" }}>
      <Input
        size="sm"
        autoFocus
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return; // 한글 IME 조합 확정 Enter가 이중 등록되는 것 방지
          if (e.key === "Enter") commit(true);
          if (e.key === "Escape") { setText(""); setEditing(false); }
        }}
        onBlur={() => commit(false)}
      />
    </div>
  );
}

export function DiagramView({
  projects,
  tasks,
  meId,
  onOpen,
  onOpenProject,
  onReorderTask,
  onPatch,
  onQuickAddTask,
  onNewProject,
  onReorderProject,
  onAutoAssign,
  autoAssignBusy,
  tr,
}: {
  projects: PmProject[];
  tasks: PmTask[];
  /** Current member key — powers the "My tasks" filter. */
  meId: string;
  onOpen: (id: string) => void;
  /** 프로젝트 헤더 클릭 → 프로젝트 드로어. */
  onOpenProject: (id: string) => void;
  /** 태스크를 태스크 위에 드롭 — 그 앞에 삽입(프로젝트 간 이동 포함). */
  onReorderTask: (dragId: string, targetId: string) => void;
  onPatch: (id: string, patch: Partial<PmTask>) => void;
  onQuickAddTask: (title: string, projectId: string | null) => void;
  onNewProject: () => void;
  onReorderProject: (dragId: string, targetId: string) => void;
  /** misc.(무소속) 태스크를 AI가 어울리는 프로젝트로 배분. */
  onAutoAssign?: () => void;
  autoAssignBusy?: boolean;
  /** 표시 언어 번역(렌더 전용) — 체크리스트 항목 등에 적용, 저장 데이터는 원문. */
  tr?: (text: string) => string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // "" = everyone; otherwise a member key — seeded from the directory.
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragProjectId, setDragProjectId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // project id or "none"
  // 다중 선택 모드 — 노드 클릭이 드로어 대신 선택 토글이 되고, 하단 바에서
  // 날짜·담당자·프로젝트를 한 번에 바꾼다.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 완료 태스크 숨김 토글 — localStorage로 기억 (Roadmap과 공유).
  // "⚠ Rules" — 법칙 3가지 미충족 태스크만 필터
  const [rulesOnly, setRulesOnly] = useState(false);
  const [hideDone, setHideDone] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("pm.hideDone") === "1";
  });
  const toggleHideDone = () =>
    setHideDone((v) => {
      try { window.localStorage.setItem("pm.hideDone", v ? "0" : "1"); } catch { /* private mode */ }
      return !v;
    });

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  /** 선택된 모든 태스크에 같은 patch 적용 (하단 일괄 편집 바). */
  function bulkPatch(patch: Partial<PmTask>) {
    for (const id of selected) onPatch(id, patch);
  }

  // ── 러버밴드(드래그 박스) 선택 — 파인더에서 파일 끌어 선택하듯이 ──
  const marquee = useRef<{ x0: number; y0: number; active: boolean } | null>(null);
  const suppressClick = useRef(false); // 드래그 직후의 click이 토글로 새는 것 방지

  // ── 드래그 오토스크롤 — 컨테이너 위/아래 가장자리에 끌고 가면 스크롤이 따라온다.
  //    (HTML5 DnD는 기본 오토스크롤이 컨테이너에서 잘 동작하지 않는다.)
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollVel = useRef(0);
  const scrollRaf = useRef<number | null>(null);
  const autoScrollTick = () => {
    const el = scrollRef.current;
    if (!el || scrollVel.current === 0) { scrollRaf.current = null; return; }
    el.scrollTop += scrollVel.current;
    scrollRaf.current = requestAnimationFrame(autoScrollTick);
  };
  function handleDragAutoScroll(e: React.DragEvent) {
    const el = scrollRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const EDGE = 90;
    let v = 0;
    if (e.clientY < r.top + EDGE) v = -Math.max(4, Math.ceil((EDGE - (e.clientY - r.top)) / 5));
    else if (e.clientY > r.bottom - EDGE) v = Math.max(4, Math.ceil((EDGE - (r.bottom - e.clientY)) / 5));
    scrollVel.current = v;
    if (v !== 0 && scrollRaf.current == null) scrollRaf.current = requestAnimationFrame(autoScrollTick);
  }
  useEffect(() => {
    const stop = () => { scrollVel.current = 0; };
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    };
  }, []);

  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  function onSelectMouseDown(e: React.MouseEvent) {
    if (!selectMode || e.button !== 0) return;
    const tag = (e.target as HTMLElement).tagName;
    if (["INPUT", "SELECT", "TEXTAREA", "OPTION", "LABEL"].includes(tag)) return;
    marquee.current = { x0: e.clientX, y0: e.clientY, active: false };
    const move = (ev: MouseEvent) => {
      const m = marquee.current;
      if (!m) return;
      const dx = ev.clientX - m.x0;
      const dy = ev.clientY - m.y0;
      if (!m.active && Math.hypot(dx, dy) < 5) return; // 5px 전엔 클릭으로 취급
      m.active = true;
      document.body.style.userSelect = "none";
      setMarqueeRect({ x: Math.min(m.x0, ev.clientX), y: Math.min(m.y0, ev.clientY), w: Math.abs(dx), h: Math.abs(dy) });
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      const m = marquee.current;
      marquee.current = null;
      setMarqueeRect(null);
      if (!m?.active) return;
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
      const L = Math.min(m.x0, ev.clientX), T = Math.min(m.y0, ev.clientY);
      const R = Math.max(m.x0, ev.clientX), B = Math.max(m.y0, ev.clientY);
      const hits: string[] = [];
      document.querySelectorAll<HTMLElement>("[data-pm-task]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < R && r.right > L && r.top < B && r.bottom > T) hits.push(el.dataset.pmTask!);
      });
      if (hits.length) setSelected((prev) => new Set([...prev, ...hits]));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const visibleProjects = projects.filter((p) => p.status !== "archived");
  const shownTasks = tasks.filter(
    (t) => (!assigneeFilter || (assigneeFilter === "__unassigned__" ? !t.assigneeKey : t.assigneeKey === assigneeFilter))
      && (!hideDone || t.status !== "done")
      // 스프린트 법칙 미충족 건만 보기 (2026-09-22 지시)
      && (!rulesOnly || (t.status !== "done" && unmetSprintRules(t).length > 0)),
  );
  const orphanTasks = shownTasks.filter((t) => t.projectId === null || !visibleProjects.some((p) => p.id === t.projectId));

  function collapseAll() {
    const keys = [...visibleProjects.map((p) => p.id), "none"];
    // 기본 펼침(체크리스트 있는 진행 중)인 가지만 토글 기록 — done은 이미 접힘.
    for (const t of tasks) if (t.checklist.length > 0 && t.status !== "done") keys.push("cl-" + t.id);
    setCollapsed(new Set(keys));
  }
  // Expand all = 그룹 토글 제거 + 기본 접힘(done)의 체크리스트는 토글로 펼침.
  const expandAll = () =>
    setCollapsed(new Set(tasks.filter((t) => t.checklist.length > 0 && t.status === "done").map((t) => "cl-" + t.id)));

  if (visibleProjects.length === 0 && tasks.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban size={24} />}
        title="Nothing here yet"
        description="Create a project to branch tasks out from it here."
        actions={<Button size="sm" leftIcon={<Plus size={14} />} onClick={onNewProject}>New project</Button>}
      />
    );
  }

  function dropProps(targetKey: string, projectId: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes("text/pm-task")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropTarget(targetKey);
        }
      },
      onDragLeave: () => setDropTarget((t) => (t === targetKey ? null : t)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData("text/pm-task");
        if (taskId) onPatch(taskId, { projectId });
        setDragId(null);
        setDropTarget(null);
      },
    };
  }

  function renderTask(t: PmTask) {
    const d = dday(t.dueDate);
    const open = t.status !== "done";
    const hasChecklist = t.checklist.length > 0;
    // 기본 펼침 = 체크리스트가 있는 '진행 중' 작업만. Done은 자리만 차지하므로
    // 기본 접힘(셰브론으로 펼침). 토글 기록(collapsed)은 기본값의 반전.
    const defaultOpen = hasChecklist && open;
    const expanded = collapsed.has("cl-" + t.id) ? !defaultOpen : defaultOpen;
    return (
      <Branch key={t.id}>
        <div
          data-pm-task={t.id}
          draggable={!selectMode}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/pm-task", t.id);
            e.dataTransfer.effectAllowed = "move";
            // defer: re-rendering the dragged node during dragstart cancels the drag in Chrome
            setTimeout(() => setDragId(t.id), 0);
          }}
          onDragEnd={() => { setDragId(null); setDropTarget(null); }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("text/pm-task") || dragId === t.id) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setDropTarget("task-" + t.id);
          }}
          onDragLeave={() => setDropTarget((x) => (x === "task-" + t.id ? null : x))}
          onDrop={(e) => {
            const taskId = e.dataTransfer.getData("text/pm-task");
            if (!taskId || taskId === t.id) return;
            e.preventDefault();
            e.stopPropagation();
            onReorderTask(taskId, t.id);
            setDragId(null);
            setDropTarget(null);
          }}
          onClick={() => {
            if (suppressClick.current) return;
            if (selectMode) toggleSelected(t.id);
            else onOpen(t.id);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (selectMode) toggleSelected(t.id); else onOpen(t.id); } }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
            background: selectMode && selected.has(t.id)
              ? "color-mix(in srgb, var(--color-primary) 10%, var(--surface-card))"
              : t.status === "hold"
                ? "color-mix(in srgb, var(--gray-400, #9ca3af) 16%, var(--surface-card))"
                : "var(--surface-card)",
            border: dropTarget === "task-" + t.id
              ? "1.5px solid var(--color-primary)"
              : selectMode && selected.has(t.id)
                ? "1.5px solid var(--color-primary)"
                : "1px solid var(--border-default)",
            boxShadow: dropTarget === "task-" + t.id ? "0 -2px 0 0 var(--color-primary)" : "none",
            borderRadius: 9, padding: "6px 10px", marginTop: 6, maxWidth: "100%",
            opacity: dragId === t.id ? 0.4 : open ? 1 : 0.55,
          }}
          title={selectMode ? "Click: select / unselect" : "Click: detail · Drag: reorder / move to another project"}
        >
          <button
            type="button"
            aria-label="Toggle checklist"
            onClick={(e) => { e.stopPropagation(); toggle("cl-" + t.id); }}
            style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "inline-grid", placeItems: "center", color: "var(--text-muted)" }}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: PRIORITY_DOT[t.priority] }} title={PRIORITY_LABEL[t.priority]} />
          <span title={t.title} style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-strong)", textDecoration: open ? "none" : "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.title}
          </span>
          {t.assigneeKey && <UserAvatar memberKey={t.assigneeKey} size="xs" photo={false} />}
          {d && open && (
            <Tag size="sm" dotColor={d.overdue ? "var(--red-500)" : d.dueToday ? "var(--amber-500)" : null} active={d.overdue}>{d.label}</Tag>
          )}
          {(!open || t.status === "hold") && <Badge size="sm" tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>}
        </div>

        {expanded && (
          <div style={{ marginLeft: 14, borderLeft: GUIDE_SOFT, paddingLeft: 0, marginTop: 2 }}>
            {t.checklist.map((item, i) => (
              <Branch key={i} dashed>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                  <Checkbox
                    checked={item.done}
                    onChange={(e) =>
                      onPatch(t.id, { checklist: t.checklist.map((c, ci) => (ci === i ? { ...c, done: e.target.checked } : c)) })
                    }
                  >
                    <span style={{ fontSize: "var(--text-xs)", ...(item.done ? { textDecoration: "line-through", color: "var(--text-subtle)" } : {}) }}>
                      {tr ? tr(item.text) : item.text}
                    </span>
                  </Checkbox>
                </div>
              </Branch>
            ))}
            <Branch dashed>
              <InlineAdd
                label="Add item"
                placeholder="Checklist item…"
                onAdd={(text) => {
                  // 첫 항목을 넣으면 "기본 펼침"으로 바뀌므로 수동 토글 기록을 지워
                  // 입력창이 닫히지 않게 한다.
                  if (t.checklist.length === 0) {
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      next.delete("cl-" + t.id);
                      return next;
                    });
                  }
                  onPatch(t.id, { checklist: [...t.checklist, { text, done: false }] });
                }}
              />
            </Branch>
          </div>
        )}
      </Branch>
    );
  }

  function renderGroup(opts: { key: string; projectId: string | null; header: React.ReactNode; groupTasks: PmTask[]; headerColor?: string }) {
    const { key, projectId, header, groupTasks, headerColor } = opts;
    const isCollapsed = collapsed.has(key);
    const highlight = dropTarget === key && dragId !== null;
    const sorted = [...groupTasks].sort((a, b) => {
      // 활성 → 보류(hold) → 완료 순으로 가라앉는다.
      const rank = (t: PmTask) => (t.status === "done" ? 2 : t.status === "hold" ? 1 : 0);
      const ao = rank(a);
      const bo = rank(b);
      // 수동 순서(sort)가 우선, 동률이면 기존 우선순위·마감 정렬.
      return ao - bo || a.sort - b.sort || compareTasks(a, b);
    });
    return (
      // inline-block + breakInside: avoid → 컬럼 흐름에서 그룹이 잘리지 않게.
      <div
        key={key}
        onDragOver={(e) => {
          // 태스크 드래그는 그룹 전체(헤더+트리 영역)가 드롭존 — 헤더만으로는 과녁이 작다.
          if (e.dataTransfer.types.includes("text/pm-task")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropTarget(key);
            return;
          }
          if (!projectId || !e.dataTransfer.types.includes("text/pm-project") || dragProjectId === projectId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropTarget("proj-" + projectId);
        }}
        onDragLeave={() => setDropTarget((t) => (t === "proj-" + projectId || t === key ? null : t))}
        onDrop={(e) => {
          const taskId = e.dataTransfer.getData("text/pm-task");
          if (taskId) {
            e.preventDefault();
            onPatch(taskId, { projectId });
            setDragId(null);
            setDropTarget(null);
            return;
          }
          const projId = e.dataTransfer.getData("text/pm-project");
          if (projectId && projId && projId !== projectId) {
            e.preventDefault();
            onReorderProject(projId, projectId);
          }
          setDragProjectId(null);
          setDropTarget(null);
        }}
        style={{
          minWidth: 0, borderRadius: 12,
          outline:
            (dropTarget === "proj-" + projectId && dragProjectId) || (dropTarget === key && dragId)
              ? "1.5px dashed var(--color-primary)"
              : "none",
          outlineOffset: 4,
        }}
      >
        <div
          {...dropProps(key, projectId)}
          draggable={projectId !== null}
          onDragStart={(e) => {
            if (!projectId) return;
            e.dataTransfer.setData("text/pm-project", projectId);
            e.dataTransfer.effectAllowed = "move";
            setTimeout(() => setDragProjectId(projectId), 0);
          }}
          onDragEnd={() => { setDragProjectId(null); setDropTarget(null); }}
          title={projectId ? "Click: project detail · Chevron: collapse · Drag: reorder" : undefined}
          style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            background: headerColor ? `color-mix(in srgb, ${headerColor} 7%, var(--surface-card))` : "var(--surface-card)",
            border: highlight
              ? "1.5px solid var(--color-primary)"
              : headerColor
                ? `1.5px solid color-mix(in srgb, ${headerColor} 45%, var(--border-default))`
                : "1px solid var(--border-strong, var(--border-default))",
            borderRadius: 11, padding: "8px 14px", cursor: "pointer",
            opacity: dragProjectId === projectId && projectId ? 0.5 : 1,
          }}
          onClick={() => (projectId ? onOpenProject(projectId) : toggle(key))}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (projectId) onOpenProject(projectId);
              else toggle(key);
            }
          }}
        >
          <button
            type="button"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            onClick={(e) => { e.stopPropagation(); toggle(key); }}
            style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "inline-grid", placeItems: "center", color: "inherit" }}
          >
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
          {header}
        </div>

        {!isCollapsed && (
          <div style={{ marginLeft: 22, borderLeft: GUIDE, marginTop: 4, paddingBottom: 2 }}>
            {sorted.map(renderTask)}
            <Branch>
              <InlineAdd
                label="Add task"
                placeholder="Task title + Enter"
                onAdd={(title) => onQuickAddTask(title, projectId)}
              />
            </Branch>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="sx-scroll"
      ref={scrollRef}
      onMouseDown={onSelectMouseDown}
      onDragOverCapture={handleDragAutoScroll}
      style={{ height: "100%", minHeight: 0, overflowY: "auto", paddingRight: 4, cursor: selectMode ? "crosshair" : undefined }}
    >
      {marqueeRect && (
        <div
          aria-hidden
          style={{
            position: "fixed", left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h,
            border: "1px solid var(--color-primary)",
            background: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
            borderRadius: 4, zIndex: 100, pointerEvents: "none",
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
          Click a node for detail · drag tasks between projects · drag a project block to reorder
        </span>
        <span style={{ flex: 1 }} />
        <Button
          variant={selectMode ? "primary" : "ghost"}
          size="sm"
          leftIcon={<SquareMousePointer size={13} />}
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          title="Drag a box (or click tasks) to select, then set dates / assignee / project at once"
        >
          {selectMode ? "Done selecting" : "Select"}
        </Button>
        <Button variant="ghost" size="sm" onClick={expandAll}>Expand all</Button>
        <Button variant="ghost" size="sm" onClick={collapseAll}>Collapse all</Button>
        <Button variant={hideDone ? "soft" : "ghost"} size="sm" onClick={toggleHideDone}>
          {hideDone ? "Show done" : "Hide done"}
        </Button>
        <Button variant={rulesOnly ? "soft" : "ghost"} size="sm" onClick={() => setRulesOnly((v) => !v)}
          title="Show only tasks that don't meet the 3 sprint rules yet"
          style={rulesOnly ? { color: "var(--amber-600, #b45309)" } : undefined}>
          ⚠ Rules unmet
        </Button>
        <Select
          size="sm"
          aria-label="Filter by assignee"
          value={assigneeFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAssigneeFilter(e.target.value)}
          options={[
            { value: "", label: "All members" },
            { value: "__unassigned__", label: "Unassigned" },
            ...TEAM_MEMBERS
              .map((m) => ({ value: m.id, label: m.id === meId ? `${m.fullName} (me)` : m.fullName })),
          ]}
          style={{ width: 180 }}
        />
      </div>
      {/* masonry(컬럼별 제각각 흐름) 대신 행 그리드 — 각 줄의 블록 높이가
          정렬돼 통일감이 생긴다 (짧은 블록은 아래 공백 허용). */}
      <div className="sx-diagram-cols" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20, alignItems: "stretch" }}>
      {/* "+ 프로젝트" 타일 — 컬럼 흐름의 첫 카드 */}
      <div style={{ minWidth: 0 }}>
        <button
          type="button"
          onClick={onNewProject}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "transparent", border: "1.5px dashed var(--border-default)",
            borderRadius: 11, padding: "9px 16px", cursor: "pointer",
            color: "var(--text-muted)", fontSize: "var(--text-sm)", fontWeight: 500,
          }}
        >
          <Plus size={15} /> Project
        </button>
      </div>
      {visibleProjects.map((p) => {
        const children = shownTasks.filter((t) => t.projectId === p.id);
        // 진척도는 필터(Hide done·멤버)와 무관한 실제 값 — 드로어의 done/total과 항상 일치한다.
        const r = rollup(tasks.filter((t) => t.projectId === p.id));
        return renderGroup({
          key: p.id,
          projectId: p.id,
          groupTasks: children,
          // 폴더 색 = 프로젝트 우선순위 (urgent 빨강 / high 주황 / medium 파랑 / low 회색)
          headerColor: PRIORITY_DOT[p.priority],
          header: (
            <>
              <FolderKanban size={16} style={{ color: PRIORITY_DOT[p.priority] ?? "var(--color-primary)" }} />
              <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{p.name}</span>
              {p.ownerKey && <UserAvatar memberKey={p.ownerKey} size="xs" photo={false} />}
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                {r.done}/{r.total} · {r.pct}%
              </span>
            </>
          ),
        });
      })}
      {renderGroup({
        key: "none",
        projectId: null,
        groupTasks: orphanTasks,
        header: (
          <>
            <Inbox size={16} style={{ color: "var(--text-muted)" }} />
            <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>misc.</span>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{orphanTasks.length}</span>
            {onAutoAssign && orphanTasks.length > 0 && (
              <Button
                variant="soft"
                size="sm"
                leftIcon={<Sparkles size={13} />}
                loading={autoAssignBusy}
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onAutoAssign(); }}
                title="AI moves these tasks into the best-matching project (review afterwards)"
              >
                AI sort
              </Button>
            )}
          </>
        ),
      })}
      </div>

      {/* 일괄 편집 바 — 선택 모드에서 1개 이상 고르면 하단에 떠오른다. */}
      {selectMode && selected.size > 0 && (
        <div
          style={{
            position: "sticky", bottom: 12, zIndex: 20,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            margin: "16px auto 0", width: "fit-content", maxWidth: "100%",
            background: "var(--surface-card)", border: "1px solid var(--border-default)",
            borderRadius: 12, padding: "10px 14px", boxShadow: "0 8px 28px rgba(0,0,0,.16)",
          }}
        >
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-strong)" }}>
            {selected.size} selected
          </span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Start
            <Input size="sm" type="date" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.value) bulkPatch({ startedOn: e.target.value }); }} style={{ width: 140 }} />
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Due
            <Input size="sm" type="date" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.value) bulkPatch({ dueDate: e.target.value }); }} style={{ width: 140 }} />
          </label>
          <Select
            size="sm"
            aria-label="Bulk assignee"
            defaultValue=""
            options={[
              { value: "", label: "Assignee…" },
              ...TEAM_MEMBERS.map((m) => ({ value: m.id, label: m.fullName })),
            ]}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { if (e.target.value) bulkPatch({ assigneeKey: e.target.value }); }}
            style={{ width: 150 }}
          />
          <Select
            size="sm"
            aria-label="Bulk project"
            defaultValue=""
            options={[
              { value: "", label: "Project…" },
              { value: "__none__", label: "misc. (no project)" },
              ...visibleProjects.map((p) => ({ value: p.id, label: p.name })),
            ]}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              if (!e.target.value) return;
              bulkPatch({ projectId: e.target.value === "__none__" ? null : e.target.value });
            }}
            style={{ width: 180 }}
          />
          <Button variant="ghost" size="sm" leftIcon={<X size={13} />} onClick={exitSelectMode}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
