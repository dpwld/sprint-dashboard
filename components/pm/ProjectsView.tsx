"use client";

import { Plus, FolderKanban } from "lucide-react";
import { useState } from "react";
import { Card, CardBody } from "@/components/ds/data/Card";
import { Badge } from "@/components/ds/core/Badge";
import { Button } from "@/components/ds/core/Button";
import { ProgressBar } from "@/components/ds/feedback/ProgressBar";
import { EmptyState } from "@/components/ds/feedback/EmptyState";
import type { PmProject, PmProjectStatus, PmTask } from "@/types/domain";
import { TEAM_MEMBERS, memberName } from "@/lib/mock/team";
import { Select } from "@/components/ds/forms/Select";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, rollup, isOverdue, isOpen } from "./pmFormat";
import { Avatar } from "@/components/ds/core/Avatar";

/** 장기 과제 뷰 — 프로젝트 카드에 하위 태스크 rollup %를 표시. 스프린트와
   독립적으로 "이 프로젝트가 몇 % 왔는지"가 보인다 (Jira Initiative 패턴). */
export function ProjectsView({
  projects,
  tasks,
  onNew,
  onEdit,
  onReorder,
  tr,
}: {
  projects: PmProject[];
  tasks: PmTask[];
  onNew: () => void;
  onEdit: (project: PmProject) => void;
  onReorder: (dragId: string, targetId: string) => void;
  /** 표시 언어 번역(렌더 전용) — 설명 등에 적용, 저장 데이터는 원문. */
  tr?: (text: string) => string;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  // 필터: 상태별 · 담당자(owner)별
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const filtered = projects.filter(
    (p) => (statusFilter === "all" || p.status === statusFilter) && (!ownerFilter || p.ownerKey === ownerFilter),
  );
  const active = filtered.filter((p) => p.status !== "archived");
  const archived = filtered.filter((p) => p.status === "archived");

  /** Everyone touching the project: owner first, then task assignees. */
  const participants = (p: PmProject) => {
    const keys: string[] = [];
    if (p.ownerKey) keys.push(p.ownerKey);
    for (const t of tasks) {
      if (t.projectId === p.id && t.assigneeKey && !keys.includes(t.assigneeKey)) keys.push(t.assigneeKey);
    }
    return keys;
  };

  if (active.length === 0 && archived.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban size={24} />}
        title="No projects yet"
        description="Create a project for long-running work; linked tasks roll up into its progress."
        actions={<Button size="sm" leftIcon={<Plus size={14} />} onClick={onNew}>New project</Button>}
      />
    );
  }

  const renderCard = (p: PmProject) => {
    const children = tasks.filter((t) => t.projectId === p.id);
          const r = rollup(children);
          const openCount = children.filter(isOpen).length;
          const overdueCount = children.filter(isOverdue).length;
          return (
            <Card
              key={p.id}
              interactive
              onClick={() => onEdit(p)}
              draggable
              onDragStart={(e: React.DragEvent) => {
                e.dataTransfer.setData("text/pm-project", p.id);
                e.dataTransfer.effectAllowed = "move";
                // defer: re-rendering the dragged card during dragstart cancels the drag in Chrome
                setTimeout(() => setDragId(p.id), 0);
              }}
              onDragEnd={() => { setDragId(null); setDropId(null); }}
              onDragOver={(e: React.DragEvent) => {
                if (e.dataTransfer.types.includes("text/pm-project")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropId(p.id);
                }
              }}
              onDragLeave={() => setDropId((v) => (v === p.id ? null : v))}
              onDrop={(e: React.DragEvent) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/pm-project");
                if (id && id !== p.id) onReorder(id, p.id);
                setDragId(null);
                setDropId(null);
              }}
              title="Click: edit · Drag: reorder"
              style={{ opacity: dragId === p.id ? 0.5 : 1, outline: dropId === p.id ? "1.5px solid var(--color-primary)" : "none" }}
            >
              <CardBody>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{p.name}</span>
                  <Badge tone={PROJECT_STATUS_TONE[p.status]} dot>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                </div>
                {p.description && (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tr ? tr(p.description) : p.description}
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <ProgressBar value={r.pct} tone={r.pct === 100 ? "success" : "primary"} size="sm" label={`${r.done}/${r.total} done`} showValue />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                    {participants(p).length ? (
                      participants(p).slice(0, 5).map((k) => (
                        <span key={k} title={memberName(k)} style={{ marginRight: -4 }}>
                          <Avatar name={memberName(k)} size="xs" />
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>No members</span>
                    )}
                    {participants(p).length > 5 && (
                      <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginLeft: 8 }}>+{participants(p).length - 5}</span>
                    )}
                  </span>
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    {overdueCount > 0 && <Badge tone="danger" size="sm">{overdueCount} overdue</Badge>}
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {openCount} open
                    </span>
                    {p.targetDate && (
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>~{p.targetDate}</span>
                    )}
                  </span>
                </div>
              </CardBody>
            </Card>
          );
  };

  const grid = (list: PmProject[]) => (
    <div className="sx-grid-m1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
      {list.map(renderCard)}
    </div>
  );

  return (
    <div className="sx-scroll" style={{ height: "100%", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Select
          size="sm"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
          options={[
            { value: "all", label: "All statuses" },
            ...(Object.keys(PROJECT_STATUS_LABEL) as PmProjectStatus[]).map((st) => ({ value: st, label: PROJECT_STATUS_LABEL[st] })),
          ]}
          style={{ width: 150 }}
        />
        <Select
          size="sm"
          aria-label="Filter by owner"
          value={ownerFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOwnerFilter(e.target.value)}
          options={[{ value: "", label: "All members" }, ...TEAM_MEMBERS.map((m) => ({ value: m.id, label: m.fullName }))]}
          style={{ width: 170 }}
        />
      </div>
      <div>
        <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)", paddingBottom: 8 }}>
          Active ({active.length})
        </div>
        {active.length ? grid(active) : (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>No active projects.</span>
        )}
      </div>
      {archived.length > 0 && (
        <div>
          <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)", paddingBottom: 8 }}>
            Archived ({archived.length})
          </div>
          {grid(archived)}
        </div>
      )}
    </div>
  );
}
