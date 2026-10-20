"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, FolderKanban, SlidersHorizontal } from "lucide-react";
import { Tabs } from "@/components/ds/navigation/Tabs";
import { Toast } from "@/components/ds/feedback/Toast";
import { Button } from "@/components/ds/core/Button";
import { Spinner } from "@/components/ds/core/Spinner";
import { Modal } from "@/components/ds/feedback/Modal";
import type { PmComment, PmProject, PmTask, PmTaskStatus, PmTeam } from "@/types/domain";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { canSeeSprintTeam } from "@/lib/auth/roles";
import {
  fetchPm, insertProject, updateProject, deleteProject, insertTask, updateTask, deleteTask,
  restoreTaskRow, restoreProjectRow, canSeeProject,
  insertTaskComment, deleteTaskComment,
  type PmProjectInput, type PmTaskInput,
} from "@/lib/data/pm";

import { fetchPmI18n, needsTranslation, textKeyUuid, upsertPmI18n, type PmI18nRow, type PmLang } from "@/lib/data/pmI18n";
import { notifyByEmail, notifyMentions } from "@/lib/mentions";
import { isOverdue, rollup } from "./pmFormat";
import { useMobile } from "@/lib/hooks/useMobile";
import { MobileTaskList } from "./MobileTaskList";
import { TaskBoard } from "./TaskBoard";
import { DiagramView } from "./DiagramView";
import { RoadmapView } from "./RoadmapView";
import { CalendarView } from "./CalendarView";
import { DueView } from "./DueView";
import { PeopleView } from "./PeopleView";
import { ProjectsView } from "./ProjectsView";
import { TaskDrawer } from "./TaskDrawer";
import { TaskFormModal } from "./TaskFormModal";
import { ProjectFormModal } from "./ProjectFormModal";
import { ProjectDrawer } from "./ProjectDrawer";

type View = "list" | "diagram" | "board" | "roadmap" | "calendar" | "due" | "people" | "projects";
type ToastMsg = { tone: "success" | "danger"; title: string; text: string };

/** 팀별 Sprint 파티션 — 형식은 동일, 데이터만 분리. */
const PM_TEAMS: { key: PmTeam; label: string }[] = [
  { key: "engineering", label: "Engineering" },
  { key: "manufacturing", label: "Manufacturing" },
  { key: "business", label: "Business" },
];

export function SprintWorkspace({ translation }: { translation: { ready: boolean; required: string[] } }) {
  const me = useCurrentUser();
  // Directory members resolve to u-* keys (currentUser DIRECTORY); externals get ext-*.
  const meKey = me.id;

  // 부서별 조회권한 — Admin에서 끈 팀 탭은 숨긴다 (기본 전 팀 허용).
  const visibleTeams = PM_TEAMS.filter((t) => canSeeSprintTeam(me, t.key));

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<PmProject[]>([]);
  const [tasks, setTasks] = useState<PmTask[]>([]);
  const mobile = useMobile();
  const [selectedView, setView] = useState<View | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const view = selectedView ?? (mobile ? "list" : "diagram");
  const [team, setTeam] = useState<PmTeam>(() => {
    const fallback = visibleTeams[0]?.key ?? "engineering";
    if (typeof window === "undefined") return fallback;
    const saved = window.localStorage.getItem("pm.team");
    return visibleTeams.some((t) => t.key === saved) ? (saved as PmTeam) : fallback;
  });
  // 표시 언어 (EN ↔ 한 슬라이드 토글): 어떤 언어로 작성됐든 선택 언어로 표시.
  // 이미 그 언어인 제목은 그대로, 아니면 pm_i18n 번역 캐시로 치환.
  const [lang, setLang] = useState<PmLang>(() => {
    if (typeof window === "undefined") return "ko";
    const saved = window.localStorage.getItem("pm.lang");
    return saved === "en" ? "en" : "ko";
  });
  const [i18n, setI18n] = useState<PmI18nRow[]>([]);
  const translationBlocked = useRef(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [drawerProjectId, setDrawerProjectId] = useState<string | null>(null);
  // 태스크 드로어를 프로젝트 드로어에서 열었을 때의 "뒤로" 목적지.
  const [taskBackProjectId, setTaskBackProjectId] = useState<string | null>(null);
  const [commentsByTask, setCommentsByTask] = useState<Record<string, PmComment[]>>({});
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<{ project: PmProject | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "task"; task: PmTask } | { kind: "project"; project: PmProject } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  // Global-search deep link (?task= / ?project= / ?person=) — consumed after load.
  const [personFocus, setPersonFocus] = useState<string | null>(null);

  // ── Undo (Ctrl/Cmd+Z) — 이 브라우저 세션에서 "내가" 한 변경만 최근 30개.
  // 입력창에 포커스가 있으면 브라우저 기본 텍스트 undo에 양보한다.
  const undoRef = useRef<{ label: string; run: () => Promise<void> }[]>([]);
  const pushUndo = (label: string, run: () => Promise<void>) => {
    undoRef.current.push({ label, run });
    if (undoRef.current.length > 30) undoRef.current.shift();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const entry = undoRef.current.pop();
      if (!entry) return;
      e.preventDefault();
      entry
        .run()
        .then(() => setToast({ tone: "success", title: "Undone", text: entry.label }))
        .catch((err) => {
          console.error("undo failed:", err);
          setToast({ tone: "danger", title: "Undo failed", text: entry.label });
        });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load everything on mount; select the active (else most recent) sprint.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchPm();
        if (!alive) return;
        setProjects(data.projects);
        setTasks(data.tasks);
        // Group comments per task up front (mention table needs them all).
        const byTask: Record<string, PmComment[]> = {};
        for (const c of data.comments) (byTask[c.taskId] ??= []).push(c);
        setCommentsByTask(byTask);
        // Global-search deep link.
        const sp = new URLSearchParams(window.location.search);
        const task = sp.get("task");
        const project = sp.get("project");
        const person = sp.get("person");
        const linkedTask = task ? data.tasks.find((t) => t.id === task) : undefined;
        const linkedProject = project ? data.projects.find((pr) => pr.id === project) : undefined;
        if (linkedTask) { if (visibleTeams.some((t) => t.key === linkedTask.team)) setTeam(linkedTask.team); setDrawerTaskId(linkedTask.id); }
        else if (linkedProject) { if (visibleTeams.some((t) => t.key === linkedProject.team)) setTeam(linkedProject.team); setDrawerProjectId(linkedProject.id); }
        else if (person) {
          setView("people");
          setPersonFocus(person);
        }
        if (task || project || person) window.history.replaceState(null, "", window.location.pathname);
      } catch (err) {
        console.error("PM load failed:", err);
        if (alive) setToast({ tone: "danger", title: "Couldn’t load", text: "Failed to load Sprint data. Refresh to retry." });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // visibleTeams는 로그인 사용자 기준 상수 — 마운트 1회 로드만 의도
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll the authenticated service so updates from another device are visible.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      fetchPm().then(data => {
        setProjects(data.projects); setTasks(data.tasks);
        const grouped: Record<string, PmComment[]> = {};
        for (const comment of data.comments) (grouped[comment.taskId] ??= []).push(comment);
        setCommentsByTask(grouped);
      }).catch(error => console.error("Workspace sync failed", error));
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  /** 드로어는 한 번에 하나 — 태스크를 열면 프로젝트 드로어를 닫는다 (겹침 방지). */
  function openTask(id: string) {
    setDrawerProjectId(null);
    setTaskBackProjectId(null);
    setDrawerTaskId(id);
  }

  function openProject(id: string) {
    setDrawerTaskId(null);
    setTaskBackProjectId(null);
    setDrawerProjectId(id);
  }

  function switchTeam(next: PmTeam) {
    setTeam(next);
    try { window.localStorage.setItem("pm.team", next); } catch { /* private mode */ }
  }

  function switchLang(next: PmLang) {
    translationBlocked.current = false;
    setLang(next);
    try { window.localStorage.setItem("pm.lang", next); } catch { /* private mode */ }
    if (!translation.ready) {
      setToast({ tone: "danger", title: "Translate", text: `Translation setup required: configure your own ${translation.required.join(", ")} as server environment variables. INTEGRATION_OWNER_ID must match your signed-in user ID. Original text remains visible.` });
    }
  }

  // 번역 캐시 로드 (1회)
  useEffect(() => {
    fetchPmI18n().then(setI18n).catch(() => {});
  }, []);

  const i18nMap = useMemo(() => {
    const m = new Map<string, PmI18nRow>();
    for (const r of i18n) m.set(`${r.kind}:${r.targetId}:${r.lang}`, r);
    return m;
  }, [i18n]);

  // kind='text' 행(체크리스트 항목·프로젝트 설명 등)은 원문 자체로 조회
  const textTrMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of i18n) if (r.kind === "text") m.set(`${r.lang}|${r.source}`, r.text);
    return m;
  }, [i18n]);

  /** 표시 제목: 번역 대상이면 캐시(원문 일치 시)에서, 아니면 원문. */
  const displayText = (kind: "task" | "project", id: string, text: string): string => {
    if (!needsTranslation(text, lang)) return text;
    const hit = i18nMap.get(`${kind}:${id}:${lang}`);
    return hit && hit.source === text ? hit.text : text; // 번역 도착 전엔 원문
  };

  /** 임의 문자열(체크리스트·설명)의 표시 번역 — 렌더 전용, 저장 데이터는 원문 유지. */
  const trText = useMemo(() => {
    return (text: string): string => {
      const s = (text ?? "").trim();
      if (!s || !needsTranslation(s, lang)) return text;
      return textTrMap.get(`${lang}|${s}`) ?? text;
    };
  }, [lang, textTrMap]);

  // 언어 토글 시: 캐시에 없거나 원문이 바뀐 항목만 일괄 번역 → 캐시에 저장.
  // 제목·프로젝트명(kind task/project) + 체크리스트·설명(kind text)을 100개씩
  // 나눠 요청해 API 상한(200)에 걸려 일부만 번역되는 일이 없게 한다.
  useEffect(() => {
    if (loading || !translation.ready || translationBlocked.current) return;
    const pending: { id: string; kind: "task" | "project"; text: string }[] = [];
    for (const t of tasks) {
      if (!needsTranslation(t.title, lang)) continue;
      const hit = i18nMap.get(`task:${t.id}:${lang}`);
      if (!hit || hit.source !== t.title) pending.push({ id: t.id, kind: "task", text: t.title });
    }
    for (const pr of projects) {
      if (!needsTranslation(pr.name, lang)) continue;
      const hit = i18nMap.get(`project:${pr.id}:${lang}`);
      if (!hit || hit.source !== pr.name) pending.push({ id: pr.id, kind: "project", text: pr.name });
    }
    // 임의 문자열: 같은 내용은 한 번만 (원문으로 dedupe)
    const textPending = new Set<string>();
    const wantText = (raw: string) => {
      const s = (raw ?? "").trim();
      if (!s || !needsTranslation(s, lang)) return;
      if (textTrMap.has(`${lang}|${s}`)) return;
      textPending.add(s);
    };
    for (const t of tasks) for (const c of t.checklist) wantText(c.text);
    for (const pr of projects) wantText(pr.description);
    if (pending.length === 0 && textPending.size === 0) return;

    let cancelled = false;
    (async () => {
      try {
        // id 부여: task/project는 "kind:uuid", text는 "text:<원문해시 uuid>"
        const items: { id: string; kind: "task" | "project" | "text"; source: string; targetId: string }[] =
          pending.map((x) => ({ id: `${x.kind}:${x.id}`, kind: x.kind, source: x.text, targetId: x.id }));
        for (const s of textPending) {
          const key = await textKeyUuid(s);
          items.push({ id: `text:${key}`, kind: "text", source: s, targetId: key });
        }

        const translated = new Map<string, string>(); // id → 번역문
        for (let i = 0; i < items.length; i += 100) {
          const chunk = items.slice(i, i + 100);
          const res = await fetch("/api/pm/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: lang, items: chunk.map((x) => ({ id: x.id, text: x.source })) }),
          });
          const json = await res.json() as {detail?:string;error?:string;items?:{id:string;text:string}[];assignments?:{taskId:string;projectId:string}[]};
          if (!res.ok) {
            if (res.status === 503) translationBlocked.current = true;
            throw new Error(json.detail || json.error || `HTTP ${res.status}`);
          }
          for (const it of json.items ?? []) translated.set(String(it.id), String(it.text ?? ""));
          if (cancelled) return;
        }

        const rows: PmI18nRow[] = [];
        for (const it of items) {
          const text = translated.get(it.id);
          if (!text) continue;
          rows.push({ kind: it.kind, targetId: it.targetId, lang, source: it.source, text });
        }
        if (cancelled || rows.length === 0) return;

        // DB 캐시는 kind별로 나눠 저장 — 'text'는 신규 SQL(2026-08-05c) 미실행 환경에서
        // 제약 오류가 나므로, 실패해도 제목 캐시와 이번 세션 표시는 유지한다.
        const baseRows = rows.filter((r) => r.kind !== "text");
        const textRows = rows.filter((r) => r.kind === "text");
        try { await upsertPmI18n(baseRows); } catch (err) { console.error("pm_i18n save failed:", err); }
        try { await upsertPmI18n(textRows); } catch (err) {
          console.error("pm_i18n(text) save failed. Run 2026-08-05c SQL:", err);
        }
        if (cancelled) return;
        setI18n((prev) => [
          ...prev.filter((r) => !rows.some((n) => n.kind === r.kind && n.targetId === r.targetId && n.lang === r.lang)),
          ...rows,
        ]);
      } catch (err) {
        if (cancelled) return;
        console.error("pm translate failed:", err);
        setToast({ tone: "danger", title: "Translate", text: err instanceof Error ? err.message : "Translation failed" });
      }
    })();
    return () => { cancelled = true; };
    // i18nMap/textTrMap은 자체 갱신 결과라 의존성에서 제외 (재귀 방지 — pending 산출에만 사용)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, loading, tasks, projects, translation.ready]);

  // 현재 팀 파티션 — 모든 뷰/폼은 이 목록만 본다 (드로어 조회는 전체 유지).
  // lang 토글이 켜져 있으면 제목·프로젝트명을 번역본으로 치환해 뷰에 전달
  // (드로어/폼 편집은 원문 그대로 — 저장 데이터는 불변).
  // private 프로젝트는 owner·co-owner·지정 멤버·admin 외에는 목록·보드·캘린더 어디에도 안 보인다.
  const hiddenProjectIds = useMemo(
    () => new Set(projects.filter((p) => !canSeeProject(p, me.id, me.role === "admin")).map((p) => p.id)),
    [projects, me.id, me.role],
  );
  const teamProjects = useMemo(
    () => projects.filter((p) => p.team === team && !hiddenProjectIds.has(p.id)).map((p) => ({ ...p, name: displayText("project", p.id, p.name) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, team, lang, i18nMap, hiddenProjectIds],
  );
  const teamTasks = useMemo(
    () => tasks.filter((t) => t.team === team && (!t.projectId || !hiddenProjectIds.has(t.projectId))).map((t) => ({ ...t, title: displayText("task", t.id, t.title) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, team, lang, i18nMap, hiddenProjectIds],
  );

  /** Tasks of non-archived projects (+ tasks without a project). Archiving a
     project retires its tasks from every working view. */
  const activeTasks = useMemo(() => {
    const archived = new Set(teamProjects.filter((p) => p.status === "archived").map((p) => p.id));
    return teamTasks.filter((t) => !t.projectId || !archived.has(t.projectId));
  }, [teamTasks, teamProjects]);
  const overdueCount = useMemo(() => activeTasks.filter(isOverdue).length, [activeTasks]);
  const drawerTask = tasks.find((t) => t.id === drawerTaskId) ?? null;
  const r = rollup(activeTasks);

  function fail(text: string) {
    setToast({ tone: "danger", title: "Couldn’t save", text });
  }

  /** Ask the server to create/move the Drive folder; UI updates arrive via
     Realtime (drive_folder lands on the row). Failures warn, never block. */
  function scaffoldDrive(body: { action: "project" | "task" | "move"; projectId?: string; taskId?: string }) {
    void fetch("/api/drive/scaffold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (res.ok) return;
        const json = await res.json().catch(() => ({})) as {error?:string;message?:string};
        
        setToast({ tone: "danger", title: "Drive folder", text: json.error ?? json.message ?? "Drive folder step failed." });
      })
      .catch(() => {});
  }

  /** Diagram에서 태스크를 다른 태스크 위에 드롭 — 그 태스크 앞에 삽입.
     다른 프로젝트의 태스크 위에 놓으면 프로젝트 이동 + 그 위치로. */
  async function reorderTask(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    const drag = tasks.find((t) => t.id === dragId);
    const target = tasks.find((t) => t.id === targetId);
    if (!drag || !target) return;
    const group = tasks
      .filter((t) => t.projectId === target.projectId && t.id !== dragId)
      .sort((a, b) => a.sort - b.sort || a.createdAt.localeCompare(b.createdAt));
    const at = group.findIndex((t) => t.id === targetId);
    group.splice(at < 0 ? group.length : at, 0, { ...drag, projectId: target.projectId });
    const nextSort = new Map(group.map((t, i) => [t.id, (i + 1) * 10]));
    const prev = tasks;
    setTasks((ts) => ts.map((t) => {
      const ns = nextSort.get(t.id);
      if (ns == null) return t;
      return t.id === dragId ? { ...t, projectId: target.projectId, sort: ns } : { ...t, sort: ns };
    }));
    try {
      for (const t of group) {
        const ns = nextSort.get(t.id)!;
        const orig = prev.find((x) => x.id === t.id);
        if (!orig) continue;
        const patch: Partial<PmTask> = {};
        if (orig.sort !== ns) patch.sort = ns;
        if (t.id === dragId && orig.projectId !== target.projectId) patch.projectId = target.projectId;
        if (Object.keys(patch).length) await updateTask(t.id, patch);
      }
      if (drag.projectId !== target.projectId) scaffoldDrive({ action: "move", taskId: dragId });
    } catch (err) {
      console.error("task reorder failed:", err);
      setTasks(prev);
      fail("Failed to reorder the task.");
    }
  }

  /** Drag-reorder project blocks (Diagram/Projects views). Tasks follow their
     project automatically; the shared `sort` also drives every project list. */
  async function reorderProject(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    const ordered = [...projects];
    const from = ordered.findIndex((p) => p.id === dragId);
    const to = ordered.findIndex((p) => p.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    const renumbered = ordered.map((p, i) => ({ ...p, sort: i }));
    setProjects(renumbered);
    try {
      await Promise.all(
        renumbered.filter((p, i) => projects.find((x) => x.id === p.id)?.sort !== i).map((p) => updateProject(p.id, { sort: p.sort })),
      );
    } catch (err) {
      console.error("project reorder failed:", err);
      fail("Failed to save the new project order.");
    }
  }

  // ---- Task ops (optimistic with revert) ----

  async function patchTask(id: string, patch: Partial<PmTask>, opts?: { recordUndo?: boolean }) {
    const prev = tasks;
    const before = tasks.find((t) => t.id === id);
    // 스프린트의 법칙은 표기(배너·⚠·필터)만 — 저장·상태 변경은 절대 막지 않는다 (2026-09-22 확정).
    // Start·Due가 정해지면 중간 보고(checkpoint)는 그 중간 날짜로 자동 설정 (직접 지정 전까지).
    if (before && patch.checkpointDate === undefined && (patch.startedOn !== undefined || patch.dueDate !== undefined) && !before.checkpointDate) {
      const start = patch.startedOn !== undefined ? patch.startedOn : before.startedOn;
      const due = patch.dueDate !== undefined ? patch.dueDate : before.dueDate;
      if (start && due && due >= start) {
        const mid = new Date((new Date(`${start}T00:00:00`).getTime() + new Date(`${due}T00:00:00`).getTime()) / 2);
        patch = { ...patch, checkpointDate: `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, "0")}-${String(mid.getDate()).padStart(2, "0")}` };
      }
    }
    // Ctrl+Z용 역패치 — 바꾸는 필드들의 이전 값만 담는다.
    if (before && opts?.recordUndo !== false) {
      const inverse: Partial<PmTask> = {};
      for (const k of Object.keys(patch) as (keyof PmTask)[]) {
        (inverse as Record<string, unknown>)[k] = before[k];
      }
      pushUndo(`Task edit · ${before.title}`, () => patchTask(id, inverse, { recordUndo: false }));
    }
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    try {
      const saved = await updateTask(id, patch);
      // 응답은 전체 행이지만 패치한 필드만 반영한다 — objective blur 저장 직후 status를
      // 바꾸면 늦게 도착한 status 응답(이전 description을 담은 행)이 방금 저장된
      // objective를 통째로 덮어쓰던 레이스 수정 (2026-09-28 "done 시 objective 사라짐").
      setTasks((ts) => ts.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t };
        for (const k of Object.keys(patch) as (keyof PmTask)[]) {
          (next as Record<string, unknown>)[k] = saved[k];
        }
        if (patch.status !== undefined || patch.doneAt !== undefined) next.doneAt = saved.doneAt;
        next.updatedAt = saved.updatedAt;
        return next;
      }));
      // Project changed → move (or create) the task's Drive folder to match.
      if (patch.projectId !== undefined && patch.projectId !== before?.projectId && saved.projectId) {
        scaffoldDrive({ action: before?.driveFolder ? "move" : "task", taskId: id });
      }
      // 담당자가 새로 지정되면 그 사람에게 메일 알림 (본인 지정 포함, undo 재적용은 제외).
      if (patch.assigneeKey && patch.assigneeKey !== before?.assigneeKey && opts?.recordUndo !== false) {
        sendAssignEmail(patch.assigneeKey, saved);
      }
    } catch (err) {
      console.error("task update failed:", err);
      setTasks(prev);
      fail("Failed to save the task change.");
    }
  }

  function moveTask(task: PmTask, status: PmTaskStatus) {
    void patchTask(task.id, { status });
  }

  async function createTask(input: PmTaskInput): Promise<boolean> {
    setBusy(true);
    try {
      const saved = await insertTask({ ...input, team, createdByKey: meKey });
      setTasks((ts) => [...ts, saved]);
      if (saved.projectId) scaffoldDrive({ action: "task", taskId: saved.id });
      if (saved.assigneeKey) {
        sendAssignEmail(saved.assigneeKey, saved);
      }
      return true;
    } catch (err) {
      console.error("task insert failed:", err);
      fail("Failed to create the task.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      if (deleteTarget.kind === "task") {
        const snap = deleteTarget.task;
        await deleteTask(snap.id);
        setTasks((ts) => ts.filter((t) => t.id !== snap.id));
        setDrawerTaskId(null);
        pushUndo(`Delete task · ${snap.title}`, async () => {
          const restored = await restoreTaskRow(snap);
          setTasks((ts) => [...ts.filter((t) => t.id !== restored.id), restored]);
        });
      } else {
        const snap = deleteTarget.project;
        const childIds = tasks.filter((t) => t.projectId === snap.id).map((t) => t.id);
        await deleteProject(snap.id);
        setProjects((ps) => ps.filter((p) => p.id !== snap.id));
        // children keep living with project_id = null (FK: on delete set null)
        setTasks((ts) => ts.map((t) => (t.projectId === snap.id ? { ...t, projectId: null } : t)));
        setProjectForm(null);
        setDrawerProjectId(null);
        pushUndo(`Delete project · ${snap.name}`, async () => {
          const restored = await restoreProjectRow(snap);
          for (const id of childIds) await updateTask(id, { projectId: snap.id });
          setProjects((ps) => [...ps.filter((p) => p.id !== restored.id), restored]);
          setTasks((ts) => ts.map((t) => (childIds.includes(t.id) ? { ...t, projectId: snap.id } : t)));
        });
      }
      setDeleteTarget(null);
    } catch (err) {
      console.error("delete failed:", err);
      fail("Failed to delete.");
    } finally {
      setBusy(false);
    }
  }

  /** 다이어그램 인라인 생성: 제목만 받아 현재 스프린트(없으면 백로그)에 추가. */
  function quickAddTask(title: string, projectId: string | null) {
    void createTask({
      title,
      description: "",
      projectId,
      sprintId: null,
      assigneeKey: "",
      status: "todo",
      priority: "medium",
      dueDate: null,
    });
  }

  /** 댓글 저장 + @멘션된 팀원에게 벨 알림 (알림 실패는 댓글을 막지 않음). */
  async function addTaskComment(task: PmTask, body: string) {
    try {
      const saved = await insertTaskComment(task.id, meKey, body);
      setCommentsByTask((prev) => ({ ...prev, [task.id]: [...(prev[task.id] ?? []), saved] }));
      void notifyMentions({
        body,
        actorKey: meKey,
        title: `[Sprint] Task "${task.title}"`,
        link: "/sprint",
      });
    } catch (err) {
      console.error("task comment failed:", err);
      fail("Failed to post the comment.");
    }
  }

  /** Optimistic field save for the project drawer. */
  async function patchProject(id: string, patch: Partial<PmProject>) {
    const prev = projects;
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      const saved = await updateProject(id, patch);
      setProjects((ps) => ps.map((p) => (p.id === id ? saved : p)));
    } catch (err) {
      console.error("project update failed:", err);
      setProjects(prev);
      fail("Failed to save the project.");
    }
  }

  /** Delete my own comment (permission enforced in the drawer UI). */
  async function removeTaskComment(task: PmTask, commentId: string) {
    try {
      await deleteTaskComment(commentId);
      setCommentsByTask((prev) => ({ ...prev, [task.id]: (prev[task.id] ?? []).filter((c) => c.id !== commentId) }));
    } catch (err) {
      console.error("comment delete failed:", err);
      fail("Failed to delete the comment.");
    }
  }

  /** 할당 메일 발송 + 미발송 사유(재로그인 필요 등)를 토스트로 안내. */
  function sendAssignEmail(recipient: string, task: PmTask) {
    void notifyByEmail({
      recipients: [recipient],
      subject: `[Sprint] Task assigned to you: ${task.title}`,
      bodyText: `${task.title}${task.dueDate ? `\nDue: ${task.dueDate}` : ""}`,
      link: `/?task=${task.id}`,
    }).then((r) => {
      if (!r?.error) return;
      const text =
        r.error === "no_gmail_scope"
          ? "Sign out and sign back in with Google to grant the email permission."
          : r.error === "gmail_api_disabled"
            ? "Gmail API is not enabled in the Google Cloud project. Enable it (APIs & Services → Gmail API → Enable), then try again. No re-login needed."
            : r.error === "no_google_token" || r.error === "token_refresh_failed"
              ? "Sign in with the Google button (not the email link) so the dashboard can send from your account."
              : `Send failed (${r.error}). ${(r as { detail?: string }).detail ?? ""}`;
      setToast({ tone: "danger", title: "Email not sent", text });
    });
  }

  // ── misc.(무소속) 태스크 AI 배분 ──
  const [autoAssignBusy, setAutoAssignBusy] = useState(false);

  /** misc. 태스크들을 제목·프로젝트 설명 기반으로 AI가 프로젝트에 배분.
     확신이 없는 태스크는 misc.에 남긴다 — 결과는 드래그로 언제든 수정 가능. */
  async function autoAssignOrphans() {
    const activeProjects = teamProjects.filter((p) => p.status === "active");
    const orphans = activeTasks.filter(
      (t) => t.projectId === null || !activeProjects.some((p) => p.id === t.projectId),
    );
    if (orphans.length === 0 || activeProjects.length === 0) return;
    setAutoAssignBusy(true);
    try {
      const res = await fetch("/api/pm/assign-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: orphans.map((t) => ({ id: t.id, title: t.title })),
          projects: activeProjects.map((p) => ({ id: p.id, name: p.name, description: p.description })),
        }),
      });
      const json = await res.json() as {detail?:string;error?:string;items?:{id:string;text:string}[];assignments?:{taskId:string;projectId:string}[]};
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      let moved = 0;
      for (const a of (json.assignments ?? []) as { taskId: string; projectId: string }[]) {
        if (!a.projectId) continue;
        if (!activeProjects.some((p) => p.id === a.projectId)) continue;
        if (!orphans.some((t) => t.id === a.taskId)) continue;
        await patchTask(a.taskId, { projectId: a.projectId });
        moved++;
      }
      setToast(
        moved > 0
          ? { tone: "success", title: "AI sort", text: `Moved ${moved} of ${orphans.length} tasks into projects. Drag any of them back if the guess is off.` }
          : { tone: "success", title: "AI sort", text: "No confident matches. Everything stays in misc." },
      );
    } catch (err) {
      console.error("AI sort failed:", err);
      fail(err instanceof Error ? err.message : "AI sort failed.");
    } finally {
      setAutoAssignBusy(false);
    }
  }

  /** 체크리스트가 커진 태스크 → 프로젝트로 승격: 프로젝트 생성 + 항목당 태스크. */
  async function convertToProject(task: PmTask) {
    setBusy(true);
    try {
      const project = await insertProject({
        name: task.title,
        description: task.description,
        status: "active",
        team: task.team,
        ownerKey: task.assigneeKey,
        targetDate: task.dueDate,
        createdByKey: meKey,
      });
      const children = await Promise.all(
        task.checklist.map((item) =>
          insertTask({
            title: item.text,
            description: "",
            team: task.team,
            projectId: project.id,
            sprintId: task.sprintId,
            assigneeKey: task.assigneeKey,
            status: item.done ? "done" : "todo",
            priority: task.priority,
            dueDate: null,
            createdByKey: meKey,
          }),
        ),
      );
      await deleteTask(task.id);
      setProjects((ps) => [...ps, project]);
      setTasks((ts) => [...ts.filter((t) => t.id !== task.id), ...children]);
      setDrawerTaskId(null);
      pushUndo(`Convert to project · ${task.title}`, async () => {
        for (const c of children) await deleteTask(c.id);
        await deleteProject(project.id);
        const restored = await restoreTaskRow(task);
        setProjects((ps) => ps.filter((p) => p.id !== project.id));
        setTasks((ts) => [...ts.filter((t) => t.id !== restored.id && !children.some((c) => c.id === t.id)), restored]);
      });
      setToast({ tone: "success", title: "Converted to project", text: `Created project "${project.name}" with ${children.length} child tasks.` });
    } catch (err) {
      console.error("convert failed:", err);
      fail("Failed to convert to a project.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Project ops ----

  async function createProject(input: PmProjectInput): Promise<boolean> {
    setBusy(true);
    try {
      // 새 프로젝트는 "+ Project" 타일 바로 다음(맨 앞)에 보이게 — 기존 최소 sort보다 작게.
      const minSort = projects.reduce((m, p) => Math.min(m, p.sort), 0);
      const saved = await insertProject({ ...input, team, createdByKey: meKey, sort: minSort - 1 });
      setProjects((ps) => [saved, ...ps]);
      scaffoldDrive({ action: "project", projectId: saved.id });
      return true;
    } catch (err) {
      console.error("project insert failed:", err);
      fail("Failed to create the project.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveProject(id: string, patch: Partial<PmProject>): Promise<boolean> {
    setBusy(true);
    try {
      const saved = await updateProject(id, patch);
      setProjects((ps) => ps.map((p) => (p.id === id ? saved : p)));
      return true;
    } catch (err) {
      console.error("project update failed:", err);
      fail("Failed to save the project.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ---- Render ----

  if (loading) {
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className="sx-sprint" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", padding: 24, gap: 12 }}>
      {/* Header: team partition tabs + actions (projects are the organizing unit now) */}
      <div className="sx-sprint-toolbar" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {mobile ? (
          <select className="sx-sprint-team" aria-label="Sprint team" value={team} onChange={(e) => switchTeam(e.target.value as PmTeam)}>
            {visibleTeams.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        ) : (
        <Tabs
          variant="enclosed"
          value={team}
          onChange={(v) => switchTeam(v as PmTeam)}
          items={visibleTeams.map((t) => ({ value: t.key, label: t.label }))}
        />
        )}
        {/* 표시 언어 슬라이드 토글: EN ↔ 한 (번역은 pm_i18n 캐시 공유) */}
        {!mobile && <button
          type="button"
          role="switch"
          aria-checked={lang === "ko"}
          aria-label="Toggle display language"
          className="sx-sprint-language"
          onClick={() => switchLang(lang === "ko" ? "en" : "ko")}
          style={{
            position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center",
            width: 96, height: 32, padding: 3, border: "none", cursor: "pointer",
            background: "var(--surface-sunken)", borderRadius: 999, fontFamily: "var(--font-sans)",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute", top: 3, bottom: 3, left: 3, width: "calc(50% - 3px)",
              borderRadius: 999, background: "var(--surface-card)", boxShadow: "0 1px 3px rgba(0,0,0,.14)",
              transform: lang === "ko" ? "translateX(100%)" : "translateX(0)",
              transition: "transform 180ms var(--ease-out, ease-out)",
            }}
          />
          <span style={{ position: "relative", zIndex: 1, fontSize: "var(--text-xs)", fontWeight: 700, color: lang === "en" ? "var(--text-strong)" : "var(--text-subtle)", transition: "color 180ms" }}>EN</span>
          <span style={{ position: "relative", zIndex: 1, fontSize: "var(--text-xs)", fontWeight: 700, color: lang === "ko" ? "var(--text-strong)" : "var(--text-subtle)", transition: "color 180ms" }}>한</span>
        </button>}
        <span className="sx-desktop-only" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          {r.total > 0 ? `${r.done}/${r.total} tasks done` : "Organize work by project · tasks, daily logs and folders live inside."}
        </span>
        <div className="sx-sprint-actions" style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {mobile && <Button variant="ghost" size="sm" iconOnly aria-label="Sprint options" aria-expanded={optionsOpen} aria-controls="sprint-options" onClick={() => setOptionsOpen((open) => !open)}>
            <SlidersHorizontal size={16} />
          </Button>}
          <Button className="sx-desktop-only" variant="soft" size="sm" leftIcon={<FolderKanban size={14} />} onClick={() => setProjectForm({ project: null })}>
            New project
          </Button>
          <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setTaskFormOpen(true)}>
            New task
          </Button>
        </div>
      </div>

      {mobile && optionsOpen && (
        <div id="sprint-options" className="sx-sprint-options">
          <label htmlFor="sprint-view">View</label>
          <select id="sprint-view" value={view} onChange={(e) => { setView(e.target.value as View); setOptionsOpen(false); }}>
            <option value="list">Task list</option><option value="board">Board</option><option value="projects">Projects</option>
            <option value="calendar">Calendar</option><option value="due">Due</option><option value="people">People</option>
            <option value="roadmap">Roadmap</option><option value="diagram">Diagram</option>
          </select>
          <label htmlFor="sprint-language">Language</label>
          <select id="sprint-language" value={lang} onChange={(e) => switchLang(e.target.value as PmLang)}>
            <option value="ko">한국어</option><option value="en">English</option>
          </select>
          <Button variant="ghost" size="sm" leftIcon={<FolderKanban size={14} />} onClick={() => { setOptionsOpen(false); setProjectForm({ project: null }); }}>New project</Button>
        </div>
      )}
      {!mobile && (
      <Tabs
        value={view}
        onChange={(v) => setView(v as View)}
        items={[
          { value: "list", label: "List" },
          { value: "diagram", label: "Diagram" },
          { value: "board", label: "Board" },
          { value: "roadmap", label: "Roadmap" },
          { value: "calendar", label: "Calendar" },
          { value: "due", label: "Due", count: overdueCount > 0 ? overdueCount : undefined },
          { value: "people", label: "People" },
          { value: "projects", label: "Projects", count: teamProjects.filter((p) => p.status === "active").length },
        ]}
      />

      )}
      <div key={view} className="sx-anim-view sx-sprint-content" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        {view === "list" && <MobileTaskList tasks={activeTasks} projects={teamProjects} meKey={meKey} onOpen={openTask} />}
        {view === "diagram" && (
          <DiagramView
            projects={teamProjects}
            meId={meKey}
            tasks={activeTasks}
            onOpen={openTask}
            onOpenProject={openProject}
            onReorderTask={reorderTask}
            onPatch={patchTask}
            onQuickAddTask={quickAddTask}
            onNewProject={() => setProjectForm({ project: null })}
            onReorderProject={reorderProject}
            onAutoAssign={() => void autoAssignOrphans()}
            autoAssignBusy={autoAssignBusy}
            tr={trText}
          />
        )}
        {view === "board" && (
          <TaskBoard tasks={activeTasks} projects={teamProjects} selectedId={drawerTaskId} onSelect={openTask} onMove={moveTask} />
        )}
        {view === "roadmap" && <RoadmapView projects={teamProjects} tasks={activeTasks} onOpen={openTask} />}
        {view === "calendar" && <CalendarView projects={teamProjects} tasks={activeTasks} onOpen={openTask} />}
        {view === "due" && <DueView tasks={activeTasks} projects={teamProjects} onOpen={openTask} />}
        {view === "people" && (
          <PeopleView tasks={activeTasks} projects={teamProjects} comments={commentsByTask} onOpen={openTask} initialMemberKey={personFocus} />
        )}
        {view === "projects" && (
          <ProjectsView
            projects={teamProjects}
            tasks={teamTasks}
            onNew={() => setProjectForm({ project: null })}
            onEdit={(p) => openProject(p.id)}
            onReorder={reorderProject}
            tr={trText}
          />
        )}
      </div>

      {/* Drawer + modals */}
      <ProjectDrawer
        project={projects.find((p) => p.id === drawerProjectId && !hiddenProjectIds.has(p.id)) ?? null}
        tasks={tasks}
        onClose={() => setDrawerProjectId(null)}
        onPatch={patchProject}
        onDelete={(p) => setDeleteTarget({ kind: "project", project: p })}
        onOpenTask={(id) => {
          setTaskBackProjectId(drawerProjectId);
          setDrawerProjectId(null);
          setDrawerTaskId(id);
        }}
        onPatchTask={patchTask}
        onQuickAddTask={quickAddTask}
      />
      <TaskDrawer
        task={drawerTask}
        projects={teamProjects}
        onBack={taskBackProjectId ? () => {
          const back = taskBackProjectId;
          setDrawerTaskId(null);
          setTaskBackProjectId(null);
          setDrawerProjectId(back);
        } : undefined}
        // All comments load up-front, so absence just means "no comments yet"
        // (never show the loading spinner for an empty thread).
        comments={drawerTaskId ? (commentsByTask[drawerTaskId] ?? []) : null}
        onClose={() => setDrawerTaskId(null)}
        onPatch={patchTask}
        onDelete={(t) => setDeleteTarget({ kind: "task", task: t })}
        onConvert={convertToProject}
        onAddComment={addTaskComment}
        onDeleteComment={removeTaskComment}
      />
      <TaskFormModal
        open={taskFormOpen}
        projects={projects.filter((p) => !hiddenProjectIds.has(p.id))}
        busy={busy}
        onClose={() => setTaskFormOpen(false)}
        onCreate={createTask}
      />
      {projectForm && (
        <ProjectFormModal
          open
          key={projectForm.project?.id ?? "new"}
          project={projectForm.project}
          busy={busy}
          onClose={() => setProjectForm(null)}
          onCreate={createProject}
          onSave={saveProject}
          onDelete={(p) => setDeleteTarget({ kind: "project", project: p })}
        />
      )}

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title={deleteTarget?.kind === "project" ? "Delete project" : "Delete task"}
        subtitle={deleteTarget?.kind === "project" ? deleteTarget.project.name : deleteTarget?.task.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={confirmDelete}>Delete</Button>
          </>
        }
      >
        {deleteTarget?.kind === "project"
          ? "Only the project is deleted. Its tasks remain and just lose the project link."
          : "This deletes the task. It can’t be undone."}
      </Modal>

      {toast && (
        <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 50, width: 360 }}>
          <Toast tone={toast.tone} title={toast.title} onClose={() => setToast(null)}>
            {toast.text}
          </Toast>
        </div>
      )}
    </div>
  );
}
