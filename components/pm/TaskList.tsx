"use client";

import { useMemo, useState } from "react";

import { DataTable, type Column } from "@/components/ds/data/DataTable";
import { Badge } from "@/components/ds/core/Badge";
import { Tag } from "@/components/ds/core/Tag";
import { EmptyState } from "@/components/ds/feedback/EmptyState";
import { ListTodo } from "lucide-react";
import { unmetSprintRules } from "@/lib/data/pm";
import type { PmProject, PmTask, PmTaskStatus } from "@/types/domain";
import { TEAM_MEMBERS, memberName } from "@/lib/mock/team";
import { Select } from "@/components/ds/forms/Select";
import { Input } from "@/components/ds/forms/Input";
import { STATUS_LABEL, STATUS_ORDER, STATUS_TONE, STATUS_COLOR, PRIORITY_ORDER, dday, pillStyle } from "./pmFormat";
import { PriorityBadge } from "./PriorityBadge";
import { Avatar } from "@/components/ds/core/Avatar";

/** 아바타만 보이는 담당자 픽커 — 네이티브 셀렉트를 투명하게 겹친다. */
function AvatarPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <span style={{ position: "relative", display: "inline-grid", placeItems: "center", width: 28, height: 28 }} onClick={(e) => e.stopPropagation()}>
      {value
        ? <Avatar name={memberName(value)} size="sm" />
        : <span style={{ width: 24, height: 24, borderRadius: 999, border: "1.5px dashed var(--border-default)", display: "inline-block" }} title="Unassigned" />}
      <select
        aria-label="Assignee"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
      >
        <option value="">Unassigned</option>
        {TEAM_MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
      </select>
    </span>
  );
}

/** Shared task table used by the list / due / backlog views. Pass `extra`
   columns (e.g. the backlog's pull-in action) to specialize. */
export function TaskList({
  tasks,
  projects,
  onOpen,
  onPatch,
  extra = [],
  hide = [],
  emptyTitle = "No tasks to show",
  emptyDescription,
}: {
  tasks: PmTask[];
  projects: PmProject[];
  onOpen: (id: string) => void;
  /** 있으면 assignee/due/status를 표에서 바로 편집 (프로젝트 드로어). */
  onPatch?: (id: string, patch: Partial<PmTask>) => void;
  extra?: Column<PmTask>[];
  /** Column keys to omit (e.g. ["assignee","status"] in per-person tables). */
  hide?: string[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "N/A";

  // 헤더 클릭 정렬 — null이면 호출자가 넘긴 기본 순서 유지.
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const sortedTasks = useMemo(() => {
    if (!sort) return tasks;
    const val = (t: PmTask): string | number => {
      switch (sort.key) {
        case "title": return t.title.toLowerCase();
        case "project": return projectName(t.projectId).toLowerCase();
        case "assignee": return t.assigneeKey ? memberName(t.assigneeKey).toLowerCase() : "\uffff";
        case "due": return t.dueDate ?? "9999-12-31";
        case "status": return STATUS_ORDER.indexOf(t.status);
        case "priority": return PRIORITY_ORDER.indexOf(t.priority);
        default: return 0;
      }
    };
    return [...tasks].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const c = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? c : -c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, sort, projects]);

  if (tasks.length === 0) {
    return <EmptyState icon={<ListTodo size={24} />} title={emptyTitle} description={emptyDescription} />;
  }

  const allColumns: Column<PmTask>[] = [
    {
      key: "title",
      header: "Task",
      strong: true,
      sortable: true,
      render: (t) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <PriorityBadge priority={t.priority} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.title}>{t.title}</span>
                        {t.status !== "done" && unmetSprintRules(t).length > 0 && (
                          <span title={"Sprint rules unmet:\n" + unmetSprintRules(t).join("\n")}
                            style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: "var(--amber-600, #b45309)", background: "var(--amber-50, #fffbeb)", borderRadius: 4, padding: "0 4px" }}>⚠</span>
                        )}
          {t.checklist.length > 0 && (
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              ☑ {t.checklist.filter((c) => c.done).length}/{t.checklist.length}
            </span>
          )}
        </span>
      ),
    },
    { key: "project", header: "Project", width: 180, sortable: true, render: (t) => (
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{projectName(t.projectId)}</span>
    ) },
    { key: "assignee", header: "Assignee", width: onPatch ? 52 : 140, sortable: true, render: (t) => (
      onPatch
        ? <AvatarPicker value={t.assigneeKey} onChange={(key) => onPatch(t.id, { assigneeKey: key })} />
        : t.assigneeKey
          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Avatar name={memberName(t.assigneeKey)} size="xs" />{memberName(t.assigneeKey)}</span>
          : <span style={{ color: "var(--text-subtle)" }}>Unassigned</span>
    ) },
    { key: "due", header: "Due", width: onPatch ? 140 : 110, sortable: true, render: (t) => {
      if (onPatch) {
        return (
          <span onClick={(e) => e.stopPropagation()}>
            <Input
              size="sm"
              className="sx-ghost"
              type="date"
              value={t.dueDate ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onPatch(t.id, { dueDate: e.target.value || null })}
              style={{ width: "100%", minWidth: 118 }}
            />
          </span>
        );
      }
      const d = dday(t.dueDate);
      if (!d) return <span style={{ color: "var(--text-subtle)" }}>N/A</span>;
      return <Tag size="sm" dotColor={d.overdue ? "var(--red-500)" : d.dueToday ? "var(--amber-500)" : null} active={d.overdue}>{d.label}</Tag>;
    } },
    { key: "status", header: "Status", width: 130, sortable: true, render: (t) => (
      onPatch
        ? (
          <span onClick={(e) => e.stopPropagation()}>
            <Select
              size="sm"
              className="sx-ghost"
              value={t.status}
              options={STATUS_ORDER.map((st) => ({ value: st, label: STATUS_LABEL[st] }))}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onPatch(t.id, { status: e.target.value as PmTaskStatus })}
              style={{ ...pillStyle(STATUS_COLOR[t.status]), width: "100%", minWidth: 96 }}
            />
          </span>
        )
        : <Badge tone={STATUS_TONE[t.status]} dot>{STATUS_LABEL[t.status]}</Badge>
    ) },
    ...extra,
  ];
  const columns = allColumns.filter((c) => !hide.includes(c.key));

  return (
    <DataTable<PmTask>
      columns={columns}
      data={sortedTasks}
      rowKey={(t) => t.id}
      density="default"
      hover
      stickyHeader
      sortKey={sort?.key ?? null}
      sortDir={sort?.dir ?? null}
      onSort={(key: string, dir: "asc" | "desc") => setSort({ key, dir })}
      onRowClick={(t) => onOpen(t.id)}
    />
  );
}
