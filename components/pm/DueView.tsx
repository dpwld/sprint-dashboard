"use client";

import { useState } from "react";
import { Tabs } from "@/components/ds/navigation/Tabs";
import type { PmProject, PmTask } from "@/types/domain";
import { isOpen, daysUntil, compareTasks } from "./pmFormat";
import { TaskList } from "./TaskList";

type DueTab = "overdue" | "today" | "d1" | "d2" | "d3" | "later";

/** HubSpot-style due-based triage across ALL open tasks (sprint-independent):
   Overdue / Today / D-1 / D-2 / D-3 / Later. Keeping Overdue empty is the goal. */
export function DueView({
  tasks,
  projects,
  onOpen,
}: {
  tasks: PmTask[];
  projects: PmProject[];
  onOpen: (id: string) => void;
}) {
  const open = tasks.filter(isOpen);
  const bucket = (t: PmTask): DueTab => {
    const d = daysUntil(t.dueDate);
    if (d === null) return "later";
    if (d < 0) return "overdue";
    if (d === 0) return "today";
    if (d === 1) return "d1";
    if (d === 2) return "d2";
    if (d === 3) return "d3";
    return "later";
  };
  const by: Record<DueTab, PmTask[]> = { overdue: [], today: [], d1: [], d2: [], d3: [], later: [] };
  for (const t of open) by[bucket(t)].push(t);
  (Object.keys(by) as DueTab[]).forEach((k) =>
    by[k].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || compareTasks(a, b)),
  );

  const [tab, setTab] = useState<DueTab>(by.overdue.length > 0 ? "overdue" : "today");

  const EMPTY: Record<DueTab, string> = {
    overdue: "Nothing overdue 🎉",
    today: "Nothing due today",
    d1: "Nothing due tomorrow",
    d2: "Nothing due in 2 days",
    d3: "Nothing due in 3 days",
    later: "Nothing further out",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, height: "100%" }}>
      <Tabs
        variant="enclosed"
        value={tab}
        onChange={(v) => setTab(v as DueTab)}
        items={[
          { value: "overdue", label: "Overdue", count: by.overdue.length },
          { value: "today", label: "Today", count: by.today.length },
          { value: "d1", label: "D-1", count: by.d1.length },
          { value: "d2", label: "D-2", count: by.d2.length },
          { value: "d3", label: "D-3", count: by.d3.length },
          { value: "later", label: "Later", count: by.later.length },
        ]}
      />
      <div className="sx-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <TaskList
          tasks={by[tab]}
          projects={projects}
          onOpen={onOpen}
          emptyTitle={EMPTY[tab]}
          emptyDescription={tab === "overdue" ? "Keeping this tab empty is the goal." : undefined}
        />
      </div>
    </div>
  );
}
