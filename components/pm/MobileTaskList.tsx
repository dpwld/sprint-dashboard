"use client";

import { useState } from "react";
import { ChevronRight, ListTodo } from "lucide-react";
import { Badge } from "@/components/ds/core/Badge";
import { EmptyState } from "@/components/ds/feedback/EmptyState";
import { memberName } from "@/lib/mock/team";
import type { PmProject, PmTask } from "@/types/domain";
import { compareTasks, dday, isOverdue, STATUS_LABEL, STATUS_TONE } from "./pmFormat";

export function MobileTaskList({ tasks, projects, meKey, onOpen }: {
  tasks: PmTask[];
  projects: PmProject[];
  meKey: string;
  onOpen: (id: string) => void;
}) {
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [status, setStatus] = useState("open");
  const scoped = tasks.filter((t) => scope === "team" || t.assigneeKey === meKey);
  const visible = scoped.filter((t) => status === "all" || (status === "open" ? t.status !== "done" : isOverdue(t)))
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || compareTasks(a, b));
  return (
    <div className="sx-mobile-tasks sx-scroll">
      <div className="sx-mobile-tasks__filters">
        <div className="sx-mobile-segments" aria-label="Task scope">
          <button type="button" aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>My tasks</button>
          <button type="button" aria-pressed={scope === "team"} onClick={() => setScope("team")}>Team tasks</button>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Task status">
          <option value="open">Open</option><option value="overdue">Overdue</option><option value="all">All statuses</option>
        </select>
      </div>
      <p className="sx-mobile-tasks__count">{visible.length} {visible.length === 1 ? "task" : "tasks"} · selected team</p>
      {visible.length === 0 ? <EmptyState icon={<ListTodo size={24} />} title="No tasks here" description={scope === "mine" ? "Try Team tasks or choose another team." : "Choose another status or team."} /> : (
        <div className="sx-mobile-task-list">
          {visible.map((task) => {
            const due = dday(task.dueDate);
            return <button type="button" key={task.id} className="sx-mobile-task" onClick={() => onOpen(task.id)}>
              <span className="sx-mobile-task__project">{projects.find((p) => p.id === task.projectId)?.name ?? "No project"}</span>
              <span className="sx-mobile-task__title">{task.title}</span>
              <ChevronRight className="sx-mobile-task__chevron" size={18} />
              <span className="sx-mobile-task__meta">
                <Badge tone={STATUS_TONE[task.status]} dot>{STATUS_LABEL[task.status]}</Badge>
                {due && <span className={due.overdue ? "sx-mobile-task__overdue" : undefined}>{due.label}</span>}
                {scope === "team" && <span>{task.assigneeKey ? memberName(task.assigneeKey) : "Unassigned"}</span>}
              </span>
            </button>;
          })}
        </div>
      )}
    </div>
  );
}
