"use client";

import { useState } from "react";

/** 레거시 plain-text objective → HTML. */
function projTextToHtml(t: string): string {
  if (!t || t.includes("<")) return t;
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
}
import { Trash2, Plus, CircleDot, Flag, User as UserIcon, Users, Lock, CalendarClock } from "lucide-react";
import { Drawer } from "@/components/ds/feedback/Drawer";
import { Button } from "@/components/ds/core/Button";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { ProgressBar } from "@/components/ds/feedback/ProgressBar";
import type { PmPriority, PmProject, PmProjectStatus, PmTask } from "@/types/domain";
import { TEAM_MEMBERS, memberName } from "@/lib/mock/team";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { PRIORITY_COLOR, PRIORITY_LABEL, PRIORITY_ORDER, PROJECT_STATUS_LABEL, pillStyle, rollup, compareTasks } from "./pmFormat";
import { TaskList } from "./TaskList";
import { DriveFolderBrowser } from "./DriveFolderBrowser";
import { DailyLog } from "./DailyLog";
import { MemoEditor } from "./MemoEditor";
import { DateField } from "@/components/ds/forms/DateField";
import { pmFileUrl, uploadPmFile } from "@/lib/data/pm";

interface ProjectDrawerProps {
  project: PmProject | null;
  /** All tasks — the drawer filters to this project's children. */
  tasks: PmTask[];
  onClose: () => void;
  onPatch: (id: string, patch: Partial<PmProject>) => void;
  onDelete: (project: PmProject) => void;
  onOpenTask: (id: string) => void;
  onQuickAddTask: (title: string, projectId: string | null) => void;
  /** 태스크 테이블 인라인 편집 (due/status/assignee). */
  onPatchTask: (id: string, patch: Partial<PmTask>) => void;
}

/** 멤버 토글 칩 — 부담당자/비공개 열람 멤버 다중 선택. */
function MemberChips({ selected, exclude = [], onToggle, readOnly = false }: {
  selected: string[];
  exclude?: string[];
  onToggle: (id: string, on: boolean) => void;
  /** true면 선택된 멤버만 표시하고 토글 불가 (권한 없는 사용자용). */
  readOnly?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "3px 0" }}>
      {TEAM_MEMBERS.filter((m) => !exclude.includes(m.id) && (!readOnly || selected.includes(m.id))).map((m) => {
        const on = selected.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            disabled={readOnly}
            onClick={() => { if (!readOnly) onToggle(m.id, !on); }}
            style={{
              border: `1px solid ${on ? "var(--color-primary)" : "var(--border-default)"}`,
              background: on ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent",
              color: on ? "var(--color-primary)" : "var(--text-muted)",
              borderRadius: 999, padding: "3px 10px", cursor: readOnly ? "default" : "pointer",
              fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-sans)",
            }}
          >
            {m.fullName}
          </button>
        );
      })}
    </div>
  );
}

/** Right-hand panel for a project — same pattern as the task drawer: fields
   save on blur/change, and the project's tasks are listed (and addable)
   inside. Clicking a task switches to the task drawer. */
export function ProjectDrawer({ project, ...rest }: ProjectDrawerProps) {
  if (!project) return null;
  return <ProjectDrawerInner key={project.id} project={project} {...rest} />;
}

function ProjectDrawerInner({
  project,
  tasks,
  onClose,
  onPatch,
  onDelete,
  onOpenTask,
  onQuickAddTask,
  onPatchTask,
}: Omit<ProjectDrawerProps, "project"> & { project: PmProject }) {
  const me = useCurrentUser();
  // Visibility(비공개 여부·열람 멤버)는 프로젝트 owner와 admin만 바꿀 수 있다.
  const canEditVisibility = me.role === "admin" || project.ownerKey === me.id;
  const [name, setName] = useState(project.name);

  const [newTask, setNewTask] = useState("");
  const [adding, setAdding] = useState(false);

  const children = tasks.filter((t) => t.projectId === project.id);
  const sorted = [...children].sort((a, b) => {
    const rank = (t: PmTask) => (t.status === "done" ? 2 : t.status === "hold" ? 1 : 0);
    return rank(a) - rank(b) || compareTasks(a, b);
  });
  const r = rollup(children);

  const addTask = () => {
    if (!newTask.trim()) return;
    onQuickAddTask(newTask.trim(), project.id);
    setNewTask("");
  };

  return (
    <Drawer
      open
      closeOnOutside
      onClose={onClose}
      title={project.name || "Project"}
      width={640}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {/* 삭제는 오클릭 방지를 위해 은은한 아이콘으로 — hover 시에만 위험색. */}
          <button
            type="button"
            aria-label="Delete project"
            title="Delete project"
            onClick={() => onDelete(project)}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red-500, #ef4444)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-subtle)")}
            style={{ border: "none", background: "none", cursor: "pointer", padding: 6, borderRadius: 8, color: "var(--text-subtle)", display: "inline-grid", placeItems: "center" }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Input
          className="sx-ghost sx-ghost-title"
          value={name}
          placeholder="Untitled project"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== project.name) onPatch(project.id, { name: name.trim() }); }}
          style={{ fontWeight: 700, fontSize: 22, color: "var(--text-strong)" }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "118px 1fr", rowGap: 2, columnGap: 6, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "0 6px" }}>
            <CircleDot size={13} /> Status
          </span>
          <Select
            size="sm"
            className="sx-ghost"
            value={project.status}
            options={(Object.keys(PROJECT_STATUS_LABEL) as PmProjectStatus[]).map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }))}
            onChange={(e) => onPatch(project.id, { status: e.target.value as PmProjectStatus })}
          />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "0 6px" }}>
            <Flag size={13} /> Priority
          </span>
          <Select
            size="sm"
            className="sx-ghost"
            value={project.priority}
            options={PRIORITY_ORDER.map((pr) => ({ value: pr, label: PRIORITY_LABEL[pr] }))}
            onChange={(e) => onPatch(project.id, { priority: e.target.value as PmPriority })}
            style={pillStyle(PRIORITY_COLOR[project.priority])}
          />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "0 6px" }}>
            <UserIcon size={13} /> Owner
          </span>
          <Select
            size="sm"
            className="sx-ghost"
            value={project.ownerKey}
            options={[{ value: "", label: "Unassigned" }, ...TEAM_MEMBERS.map((m) => ({ value: m.id, label: m.fullName }))]}
            onChange={(e) => onPatch(project.id, { ownerKey: e.target.value })}
          />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "0 6px" }}>
            <Users size={13} /> Co-owners
          </span>
          <MemberChips
            selected={project.coOwnerKeys}
            exclude={project.ownerKey ? [project.ownerKey] : []}
            onToggle={(id, on) =>
              onPatch(project.id, { coOwnerKeys: on ? [...project.coOwnerKeys, id] : project.coOwnerKeys.filter((k) => k !== id) })}
          />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "0 6px" }}>
            <Lock size={13} /> Visibility
          </span>
          {canEditVisibility ? (
            <Select
              size="sm"
              className="sx-ghost"
              value={project.visibility}
              options={[
                { value: "team", label: "Everyone" },
                { value: "private", label: "Private · selected people only" },
              ]}
              onChange={(e) => onPatch(project.id, { visibility: e.target.value as PmProject["visibility"] })}
            />
          ) : (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-default)", padding: "0 6px" }}
              title={`Only the project owner (${memberName(project.ownerKey)}) and admins can change visibility.`}>
              {project.visibility === "private" ? "Private · selected people only" : "Everyone"}
            </span>
          )}
          {project.visibility === "private" && (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "0 6px" }}>
                <Lock size={13} /> Visible to
              </span>
              <MemberChips
                selected={project.memberKeys}
                exclude={[project.ownerKey, ...project.coOwnerKeys].filter(Boolean)}
                readOnly={!canEditVisibility}
                onToggle={(id, on) =>
                  onPatch(project.id, { memberKeys: on ? [...project.memberKeys, id] : project.memberKeys.filter((k) => k !== id) })}
              />
            </>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "0 6px" }}>
            <CalendarClock size={13} /> Target
          </span>
          <DateField value={project.targetDate} onChange={(v) => onPatch(project.id, { targetDate: v })} />
        </div>
        {project.visibility === "private" && (
          <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", padding: "0 6px" }}>
            Private. Only the owner, co-owners, the people selected above and admins can see this project and its tasks.
          </div>
        )}

        <div>
          <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)", paddingBottom: 4 }}>
            Objective
          </div>
        {/* Notes와 같은 에디터 — "/" 블록·이미지, 내용만큼 자동 확장 (2026-09-22 지시) */}
        <MemoEditor
          key={`pobj-${project.id}`}
          value={projTextToHtml(project.description)}
          files={{ upload: uploadPmFile, url: pmFileUrl }}
          onSave={(html) => onPatch(project.id, { description: html })}
        />
        </div>

        {children.length > 0 && (
          <ProgressBar value={r.pct} tone={r.pct === 100 ? "success" : "primary"} size="sm" label={`${r.done}/${r.total} done`} showValue />
        )}

        {/* ── Project folder (Google Drive, read-only browse) ── */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)", paddingBottom: 8 }}>
            Project folder
          </div>
          <DriveFolderBrowser
            folderUrl={project.driveFolder}
            onChangeFolder={(url) => onPatch(project.id, { driveFolder: url })}
          />
        </div>

        {/* ── Daily log ── */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)", paddingBottom: 8 }}>
            Daily log
          </div>
          <DailyLog kind="project" targetId={project.id} />
        </div>

        {/* ── Tasks in this project ── */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)", paddingBottom: 8 }}>
            Tasks ({children.length})
          </div>
          <TaskList
            tasks={sorted}
            projects={[]}
            onOpen={onOpenTask}
            onPatch={onPatchTask}
            hide={["project"]}
            emptyTitle="No tasks yet"
            emptyDescription="Add the first task below."
          />
          {/* 눈에 띄는 "+ Add task" 버튼 — 누르면 입력창으로 펼쳐진다 (Enter로 연속 추가). */}
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                width: "100%", marginTop: 10, padding: "9px 0",
                border: "1.5px dashed var(--border-default)", borderRadius: 9,
                background: "transparent", cursor: "pointer",
                color: "var(--color-primary)", fontSize: "var(--text-sm)", fontWeight: 600,
              }}
            >
              <Plus size={15} /> Add task
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <Input
                size="sm"
                autoFocus
                placeholder="Task title…  (Enter to add, Esc to close)"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter") addTask();
                  if (e.key === "Escape") { setNewTask(""); setAdding(false); }
                }}
                onBlur={() => { if (!newTask.trim()) setAdding(false); }}
              />
              <Button variant="soft" size="sm" leftIcon={<Plus size={14} />} disabled={!newTask.trim()} onClick={addTask}>
                Add
              </Button>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
