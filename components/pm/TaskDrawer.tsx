"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Link2, Trash2, FolderKanban, Plus, X, Sparkles, CheckCircle2, CircleDot, Flag, ShieldCheck, User as UserIcon, Calendar, CalendarClock } from "lucide-react";
import { Drawer } from "@/components/ds/feedback/Drawer";
import { Modal } from "@/components/ds/feedback/Modal";
import { Button } from "@/components/ds/core/Button";
import { Spinner } from "@/components/ds/core/Spinner";
import { FormField } from "@/components/ds/forms/FormField";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Checkbox } from "@/components/ds/forms/Checkbox";
import type { PmChecklistItem, PmComment, PmPriority, PmProject, PmTask, PmTaskStatus } from "@/types/domain";
import { TEAM_MEMBERS, memberName } from "@/lib/mock/team";
import { useMobile } from "@/lib/hooks/useMobile";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { formatTimestamp } from "@/components/crm/crmFormat";
import { extractMentionKeys, notifyByEmail } from "@/lib/mentions";
import { insertMentionNotifications } from "@/lib/data/notifications";
import { uploadPmFile, pmFileUrl } from "@/lib/data/pm";
import { MentionComposer } from "@/components/common/MentionComposer";
import { DateField } from "@/components/ds/forms/DateField";
import { Alert } from "@/components/ds/feedback/Alert";
import { unmetSprintRules } from "@/lib/data/pm";
import { MentionText } from "@/components/common/MentionText";
import { ReactionBar } from "@/components/common/ReactionBar";
import { applyReaction, fetchEmojiReactions, setEmojiReaction } from "@/lib/data/reactions";
import type { Reaction } from "@/types/domain";
import { generateWorkOrder, type WorkOrder } from "@/lib/ai/taskOrder";
import { MemoEditor } from "./MemoEditor";
import { DailyLog } from "./DailyLog";
import { DriveFolderBrowser } from "./DriveFolderBrowser";
import { STATUS_ORDER, STATUS_LABEL, PRIORITY_ORDER, PRIORITY_LABEL, STATUS_COLOR, PRIORITY_COLOR, pillStyle } from "./pmFormat";
import { UserAvatar } from "@/components/common/UserAvatar";

/** Checklist size at which we suggest promoting the task to a project. */
const CONVERT_HINT_AT = 7;

const NONE = "__none__";

/* 노트 첨부는 'pm' 버킷에 저장 — docs 버킷은 Docs 권한이 없는 멤버에게 깨져 보였다. */
const PM_STORE = { upload: uploadPmFile, url: pmFileUrl };

/** HTML → 텍스트 (멘션 diff·AI 입력용). */
function stripHtml(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ");
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

/** Notes에 실제 내용(글자 또는 이미지·링크·표)이 있는지 — 빈 태그만 남은 것은 없는 것으로 본다. */
function notesHaveContent(html: string): boolean {
  if (!html) return false;
  return /<img|<a\s|<table/i.test(html) || html.replace(/<[^>]+>|&nbsp;/g, "").trim().length > 0;
}

/** 레거시 plain-text objective → HTML (한 번 저장되면 이후는 HTML 그대로). */
function textToHtml(t: string): string {
  if (!t || t.includes("<")) return t;
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
}

interface TaskDrawerProps {
  task: PmTask | null;
  projects: PmProject[];
  /** 프로젝트 드로어에서 열렸을 때 — 뒤로 가기(프로젝트로 복귀). */
  onBack?: () => void;
  /** null = still loading. */
  comments: PmComment[] | null;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<PmTask>) => void;
  onDelete: (task: PmTask) => void;
  onConvert: (task: PmTask) => void;
  onAddComment: (task: PmTask, body: string) => void;
  onDeleteComment: (task: PmTask, commentId: string) => void;
}

/** Flatten a generated work order into plain description text. */
function workOrderToText(o: WorkOrder): string {
  const lines: string[] = [o.title, "", o.overview, ""];
  for (const s of o.sections) {
    lines.push("■ " + s.heading);
    for (const b of s.bullets) lines.push("  · " + b);
    lines.push("");
  }
  if (o.deliverable) lines.push("Deliverable: " + o.deliverable);
  if (o.due) lines.push("Due: " + o.due);
  return lines.join("\n").trim();
}

function PropLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "0 6px" }}>
      {icon} {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)", paddingBottom: 8 }}>
      {children}
    </div>
  );
}

/** Right-hand detail/edit panel for one task. Notion-style order: fields →
   checklist → comments → 설명(AI 업무지시서) → 메모+첨부. Text saves on blur;
   selects/dates/checkboxes save immediately. Keyed by task id. */
export function TaskDrawer({ task, ...rest }: TaskDrawerProps) {
  if (!task) return null;
  return <TaskDrawerInner key={task.id} task={task} {...rest} />;
}

function TaskDrawerInner({
  task,
  projects,
  comments,
  onBack,
  onClose,
  onPatch,
  onDelete,
  onConvert,
  onAddComment,
  onDeleteComment,
}: Omit<TaskDrawerProps, "task"> & { task: PmTask }) {
  const me = useCurrentUser();
  const mobile = useMobile();
  const [title, setTitle] = useState(task.title);
  // Objective는 MemoEditor(HTML) — AI work order 적용 시 에디터를 리마운트한다.
  const [objNonce, setObjNonce] = useState(0);
  const [criteria, setCriteria] = useState(task.doneCriteria ?? "");
  const [newItem, setNewItem] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  // 실수 클릭 방지 — 프로젝트 전환은 원래 태스크가 사라지는 큰 동작이라 확인을 거친다.
  const [convertOpen, setConvertOpen] = useState(false);
  // 댓글 이모지 리액션 (공용 emoji_reactions 테이블, kind=pm_comment).
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const commentIdsKey = (comments ?? []).map((c) => c.id).join(",");
  useEffect(() => {
    const ids = commentIdsKey ? commentIdsKey.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;
    fetchEmojiReactions("pm_comment", ids)
      .then((m) => { if (!cancelled) setReactions(m); })
      .catch((err) => console.error("reactions load failed:", err));
    return () => { cancelled = true; };
  }, [commentIdsKey]);

  function toggleCommentReaction(commentId: string, emoji: string, on: boolean) {
    const prev = reactions;
    setReactions((m) => ({ ...m, [commentId]: applyReaction(m[commentId] ?? [], me.id, emoji, on) }));
    setEmojiReaction("pm_comment", commentId, me.id, emoji, on).catch((err) => {
      console.error("reaction failed:", err);
      setReactions(prev);
    });
  }
  // Drawer width — draggable via the left-edge handle, remembered per user.
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return 440;
    const saved = Number(window.localStorage.getItem("pm.drawerWidth"));
    return saved >= 360 && saved <= 900 ? saved : 440;
  });

  const [resizeHover, setResizeHover] = useState(false);

  /** Drag the drawer's left edge to resize — pointer 이벤트라 마우스·트랙패드·
     터치 모두 동작 (기존 mouse 이벤트는 일부 환경에서 안 잡히던 문제). */
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const clampW = (x: number) => Math.min(Math.min(900, window.innerWidth - 80), Math.max(360, startW + (startX - x)));
    const move = (ev: PointerEvent) => setWidth(clampW(ev.clientX));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.localStorage.setItem("pm.drawerWidth", String(clampW(ev.clientX)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  const setChecklist = (checklist: PmChecklistItem[]) => onPatch(task.id, { checklist });

  async function runWorkOrder() {
    setAiBusy(true);
    setAiError(null);
    try {
      const raw = [task.title, stripHtml(task.description), ...task.checklist.map((c) => "- " + c.text)].filter(Boolean).join("\n");
      const { order } = await generateWorkOrder({ rawTask: raw, due: task.dueDate ?? undefined });
      const text = workOrderToText(order);
      onPatch(task.id, { description: textToHtml(text) });
      setObjNonce((n) => n + 1);
    } catch (err) {
      console.error("work order failed:", err);
      setAiError(err instanceof Error ? err.message : "AI generation failed.");
    } finally {
      setAiBusy(false);
    }
  }

  /** 설명/노트 저장 시 "새로 추가된" @멘션에게만 벨+메일 알림 (재저장 중복 방지). */
  function notifyNewMentions(oldText: string, newText: string) {
    const before = new Set(extractMentionKeys(oldText));
    const added = extractMentionKeys(newText).filter((k) => !before.has(k) && k !== me.id);
    if (added.length === 0) return;
    const title = `${me.fullName} mentioned you · ${task.title}`;
    const body = newText.length > 140 ? newText.slice(0, 140) + "…" : newText;
    const link = `/?task=${task.id}`;
    insertMentionNotifications({ recipients: added, actorKey: me.id, title, body, link })
      .catch((err) => console.error("mention notify failed:", err));
    void notifyByEmail({ recipients: added, subject: title, bodyText: body, link });
  }

  const memberOptions = [
    { value: "", label: "Unassigned" },
    ...TEAM_MEMBERS.map((m) => ({ value: m.id, label: m.fullName })),
  ];
  const projectOptions = [
    { value: NONE, label: "misc. (no project)" },
    ...projects.filter((p) => p.status === "active" || p.id === task.projectId).map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <Drawer
      className="sx-task-drawer"
      open
      closeOnOutside
      onClose={onClose}
      title={task.title || "Task"}
      width={width}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          {task.checklist.length >= CONVERT_HINT_AT ? (
            <Button variant="soft" size="sm" leftIcon={<FolderKanban size={14} />} onClick={() => setConvertOpen(true)}>
              Convert to project
            </Button>
          ) : <span />}
          {/* 삭제는 오클릭 방지를 위해 은은한 아이콘으로 — hover 시에만 위험색. */}
          <button
            type="button"
            aria-label="Delete task"
            title="Delete task"
            onClick={() => onDelete(task)}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red-500, #ef4444)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-subtle)")}
            style={{ border: "none", background: "none", cursor: "pointer", padding: 6, borderRadius: 8, color: "var(--text-subtle)", display: "inline-grid", placeItems: "center" }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      }
    >
      {/* 왼쪽 모서리 드래그 핸들 — 서랍 폭 조절. 눈에 보이게: 호버 시 파란 줄 + 그립. */}
      <div
        onPointerDown={startResize}
        onPointerEnter={() => setResizeHover(true)}
        onPointerLeave={() => setResizeHover(false)}
        className="sx-desktop-only"
        title="Drag to resize"
        style={{
          position: "fixed", top: 0, bottom: 0, right: width - 6, width: 12,
          cursor: "col-resize", zIndex: 902, touchAction: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 3, height: "100%", borderRadius: 2, transition: "background 120ms",
            background: resizeHover ? "var(--color-primary)" : "var(--border-strong, var(--border-default))",
            opacity: resizeHover ? 0.9 : 0.5,
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute", top: "50%", transform: "translateY(-50%)",
            width: 4, height: 36, borderRadius: 4,
            background: resizeHover ? "var(--color-primary)" : "var(--gray-400, #9ca3af)",
          }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, alignSelf: "flex-start", border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-muted)" }}
          >
            <ArrowLeft size={13} /> Back to project
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {mobile ? (
            <textarea
              aria-label="Task title"
              className="sx-task-mobile-title"
              rows={3}
              value={title}
              placeholder="Untitled"
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
              onBlur={() => { if (title.trim() && title !== task.title) onPatch(task.id, { title: title.trim() }); }}
            />
          ) : (
          <Input
            className="sx-ghost sx-ghost-title"
            value={title}
            placeholder="Untitled"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim() && title !== task.title) onPatch(task.id, { title: title.trim() }); }}
            style={{ fontWeight: 700, fontSize: 22, color: "var(--text-strong)", flex: 1, minWidth: 0 }}
          />
          )}
          {/* 작업 딥링크 복사 — 슬랙 등에 붙여넣으면 이 드로어가 바로 열린다 (2026-09-28 피드백) */}
          <Button variant="ghost" size="sm" iconOnly aria-label="Copy task link"
            title={linkCopied ? "Copied!" : "Copy link to this task"}
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}/?task=${task.id}`)
                .then(() => {
                  setLinkCopied(true);
                  window.setTimeout(() => setLinkCopied(false), 1500);
                })
                .catch(() => {});
            }}>
            {linkCopied ? <Check size={14} style={{ color: "var(--green-600, #16a34a)" }} /> : <Link2 size={14} />}
          </Button>
        </div>

        {/* 노션식 속성 행: [아이콘+라벨 | 고스트 컨트롤] */}
        <div style={{ display: "grid", gridTemplateColumns: "118px 1fr", rowGap: 2, columnGap: 6, alignItems: "center" }}>
          <PropLabel icon={<CircleDot size={13} />}>Status</PropLabel>
          <Select
            size="sm"
            className="sx-ghost"
            value={task.status}
            options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onPatch(task.id, { status: e.target.value as PmTaskStatus })}
            style={pillStyle(STATUS_COLOR[task.status])}
          />
          <PropLabel icon={<Flag size={13} />}>Priority</PropLabel>
          <Select
            size="sm"
            className="sx-ghost sx-priority-select"
            aria-label="Priority"
            value={task.priority}
            options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onPatch(task.id, { priority: e.target.value as PmPriority })}
            style={pillStyle(PRIORITY_COLOR[task.priority])}
          />
          <PropLabel icon={<UserIcon size={13} />}>Assignee</PropLabel>
          <Select
            size="sm"
            className="sx-ghost"
            value={task.assigneeKey}
            options={memberOptions}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onPatch(task.id, { assigneeKey: e.target.value })}
          />
          <PropLabel icon={<Calendar size={13} />}>Start</PropLabel>
          <DateField value={task.startedOn} onChange={(v) => onPatch(task.id, { startedOn: v })} />
          {/* 중간 보고 시점 — 스프린트 법칙 ②. 시간 순서대로 Start→Checkpoint→Due 배치 (2026-09-28 피드백) */}
          <PropLabel icon={<ShieldCheck size={13} />}>Checkpoint</PropLabel>
          <DateField value={task.checkpointDate} placeholder="Mid-point report…"
            onChange={(v) => onPatch(task.id, { checkpointDate: v })} />
          <PropLabel icon={<CalendarClock size={13} />}>Due</PropLabel>
          <DateField value={task.dueDate} onChange={(v) => onPatch(task.id, { dueDate: v })} />
          {/* Done 시점 — done 처리 순간 자동 기록되고, 날짜를 직접 고칠 수도 있다 (2026-09-17 지시) */}
          {task.doneAt && (
            <>
              <PropLabel icon={<CheckCircle2 size={13} />}>Done</PropLabel>
              <DateField value={task.doneAt.slice(0, 10)} clearable={false}
                onChange={(v) => { if (v) onPatch(task.id, { doneAt: `${v}T12:00:00.000Z` }); }} />
            </>
          )}
          <PropLabel icon={<FolderKanban size={13} />}>Project</PropLabel>
          <Select
            size="sm"
            className="sx-ghost"
            value={task.projectId ?? NONE}
            options={projectOptions}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onPatch(task.id, { projectId: e.target.value === NONE ? null : e.target.value })}
          />
        </div>

        {/* ── 1. 설명 + AI 업무지시서 — 체크리스트 위, 컴팩트하게 ── */}
        {/* ── 스프린트의 법칙 3가지 — 충족 전에는 진행 상태로 못 옮긴다 (2026-09-22) ── */}
        {(() => {
          const unmet = unmetSprintRules({ ...task, doneCriteria: criteria });
          if (unmet.length === 0) {
            return (
              <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--green-600, #16a34a)" }}>
                ✓ Sprint rules met — outcome, owner/dates, definition of done
              </div>
            );
          }
          return (
            <Alert tone="warning" title={`Sprint rules — ${unmet.length} unmet (task can't start yet)`}>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {unmet.map((u) => <li key={u}>{u}</li>)}
              </ul>
            </Alert>
          );
        })()}

        <div style={{ paddingTop: 2 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 4 }}>
            <SectionLabel>Objective</SectionLabel>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {aiError && <span style={{ fontSize: "var(--text-2xs)", color: "var(--red-600)" }}>{aiError}</span>}
              <Button
                variant="soft"
                size="sm"
                leftIcon={<Sparkles size={13} />}
                loading={aiBusy}
                onClick={runWorkOrder}
                title="AI drafts a structured work order from the title, description and checklist"
              >
                AI work order
              </Button>
            </span>
          </div>
          {/* Notes와 같은 에디터 — "/" 블록·이미지 붙여넣기, 내용만큼 자동 확장
              (2026-09-22 지시: 잘린 줄 몰라서 task를 잘못 본 사례 방지) */}
          <MemoEditor
            key={`obj-${task.id}-${objNonce}`}
            value={textToHtml(task.description)}
            files={PM_STORE}
            onSave={(html) => {
              notifyNewMentions(stripHtml(task.description), stripHtml(html));
              onPatch(task.id, { description: html });
            }}
          />
        </div>

        {/* ── 완성의 기준 (스프린트 법칙 ③) ── */}
        <div style={{ paddingTop: 2 }}>
          <SectionLabel>Definition of done</SectionLabel>
          <Input
            size="sm"
            className="sx-ghost"
            placeholder="What counts as complete — organized data, analyzed causes, or a reviewed result?"
            value={criteria}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCriteria(e.target.value)}
            onBlur={() => { if (criteria !== (task.doneCriteria ?? "")) onPatch(task.id, { doneCriteria: criteria }); }}
          />
        </div>

        {/* ── 2. 체크리스트 ── */}
        <FormField
          label={`Checklist (${task.checklist.filter((c) => c.done).length}/${task.checklist.length})`}
          hint={task.checklist.length >= CONVERT_HINT_AT ? "Big checklist · consider converting to a project." : undefined}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {task.checklist.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Checkbox
                  checked={item.done}
                  onChange={(e) => setChecklist(task.checklist.map((c, ci) => (ci === i ? { ...c, done: e.target.checked } : c)))}
                >
                  <span style={item.done ? { textDecoration: "line-through", color: "var(--text-subtle)" } : undefined}>{item.text}</span>
                </Checkbox>
                <button
                  type="button"
                  aria-label="Remove item"
                  onClick={() => setChecklist(task.checklist.filter((_, ci) => ci !== i))}
                  style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--text-subtle)", display: "inline-grid", placeItems: "center" }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6 }}>
              <Input
                size="sm"
                placeholder="Add item…"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && newItem.trim()) {
                    setChecklist([...task.checklist, { text: newItem.trim(), done: false }]);
                    setNewItem("");
                  }
                }}
              />
              <Button
                variant="soft"
                size="sm"
                iconOnly
                aria-label="Add item"
                disabled={!newItem.trim()}
                onClick={() => {
                  setChecklist([...task.checklist, { text: newItem.trim(), done: false }]);
                  setNewItem("");
                }}
              >
                <Plus size={14} />
              </Button>
            </div>
          </div>
        </FormField>

        {/* ── Folder (Google Drive, read-only browse) ── */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          <SectionLabel>Folder</SectionLabel>
          <DriveFolderBrowser
            folderUrl={task.driveFolder}
            onChangeFolder={(url) => onPatch(task.id, { driveFolder: url })}
          />
        </div>

        {/* ── 3. Notes — Objective와 역할이 겹쳐 없앴다 (2026-10-06 지시). 기존 내용은
            Objective로 옮겼고, 이 칸은 내용이 남아 있는 태스크에서만 보인다 — 봇이
            "대표님 요청" 원문을 아직 Notes에 넣기 때문 (봇 배포 후에는 나타날 일이 없다). ── */}
        {notesHaveContent(task.memo) && (
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          <SectionLabel>Notes</SectionLabel>
          <MemoEditor
            value={task.memo}
            files={PM_STORE}
            onSave={(html) => {
              const strip = (h: string) => new DOMParser().parseFromString(h, "text/html").body.textContent ?? "";
              notifyNewMentions(strip(task.memo), strip(html));
              onPatch(task.id, { memo: html });
            }}
          />
        </div>
        )}

        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}><SectionLabel>Daily log</SectionLabel><DailyLog kind="task" targetId={task.id}/></div>

        {/* ── 4. 댓글 (맨 아래) — @이름 멘션 시 상단 벨 알림 발송 ── */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          <SectionLabel>Comments{comments && comments.length > 0 ? ` (${comments.length})` : ""}</SectionLabel>
          {comments === null ? (
            <div style={{ display: "grid", placeItems: "center", padding: 16, color: "var(--text-muted)" }}>
              <Spinner />
            </div>
          ) : comments.length === 0 ? (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)", padding: "2px 0 10px" }}>
              No comments yet. Mention a teammate with @name.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12 }}>
              {comments.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 8 }}>
                  <UserAvatar memberKey={c.authorKey} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)" }}>
                        {memberName(c.authorKey)}
                      </span>
                      <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{formatTimestamp(c.createdAt)}</span>
                      {c.authorKey === me.id && (
                        <button
                          type="button"
                          aria-label="Delete comment"
                          onClick={() => setDeleteCommentId(c.id)}
                          style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--text-subtle)", display: "inline-grid", placeItems: "center" }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--text-default)", marginTop: 2 }}>
                      <MentionText body={c.body} />
                    </div>
                    <ReactionBar
                      reactions={reactions[c.id] ?? []}
                      myId={me.id}
                      onToggle={(emoji, on) => toggleCommentReaction(c.id, emoji, on)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <MentionComposer avatarName={me.fullName} onSubmit={(body) => onAddComment(task, body)} />
        </div>

      </div>

      <Modal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        title="Convert to project?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button onClick={() => { setConvertOpen(false); onConvert(task); }}>Convert</Button>
          </>
        }
      >
        This task becomes a project named “{task.title}”, and each checklist item becomes its own task inside it. The original task goes away.
      </Modal>

      <Modal
        open={deleteCommentId !== null}
        onClose={() => setDeleteCommentId(null)}
        title="Delete comment"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteCommentId(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteCommentId) onDeleteComment(task, deleteCommentId);
                setDeleteCommentId(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        This can’t be undone.
      </Modal>
    </Drawer>
  );
}
