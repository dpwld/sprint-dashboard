"use client";

import { useMemo, useState } from "react";
import { AtSign } from "lucide-react";
import { Badge } from "@/components/ds/core/Badge";
import { Tag } from "@/components/ds/core/Tag";
import { Card, CardBody } from "@/components/ds/data/Card";
import type { PmComment, PmProject, PmTask } from "@/types/domain";
import { memberName } from "@/lib/mock/team";
import { extractMentionKeys } from "@/lib/mentions";
import { isOpen, isOverdue, compareTasks } from "./pmFormat";
import { TaskList } from "./TaskList";
import { UserAvatar } from "@/components/common/UserAvatar";

/** Lightweight Asana-Workload: per-person cards in a 2-column grid with an
   assigned-task table AND a mentions table (tasks whose comments @mention
   the person). Filter chips narrow to specific members / overdue only. */
export function PeopleView({
  tasks,
  projects,
  comments,
  onOpen,
  initialMemberKey = null,
}: {
  tasks: PmTask[];
  projects: PmProject[];
  /** All task comments, grouped by the caller per task id. */
  comments: Record<string, PmComment[]>;
  onOpen: (id: string) => void;
  /** Global-search deep link — pre-select this member's filter chip. */
  initialMemberKey?: string | null;
}) {
  const [memberFilter, setMemberFilter] = useState<Set<string>>(new Set(initialMemberKey ? [initialMemberKey] : [])); // empty = everyone
  const [overdueOnly, setOverdueOnly] = useState(false);

  // task id → member keys mentioned anywhere in its comment thread.
  const mentionsByTask = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const [taskId, list] of Object.entries(comments)) {
      const keys = new Set<string>();
      for (const c of list) for (const k of extractMentionKeys(c.body)) keys.add(k);
      if (keys.size > 0) map[taskId] = keys;
    }
    return map;
  }, [comments]);

  // Everyone who has an open task or a mention; "" (unassigned) last.
  const allKeys = useMemo(() => {
    const keys = new Set<string>(tasks.filter(isOpen).map((t) => t.assigneeKey));
    for (const set of Object.values(mentionsByTask)) for (const k of set) keys.add(k);
    return [...keys].sort((a, b) => {
      if (a === "") return 1;
      if (b === "") return -1;
      return memberName(a).localeCompare(memberName(b));
    });
  }, [tasks, mentionsByTask]);

  const visibleKeys = allKeys.filter((k) => memberFilter.size === 0 || memberFilter.has(k));

  const toggleMember = (k: string) =>
    setMemberFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  if (allKeys.length === 0) {
    return <TaskList tasks={[]} projects={projects} onOpen={onOpen} emptyTitle="No open tasks" />;
  }

  const applyCase = (list: PmTask[]) => (overdueOnly ? list.filter(isOverdue) : list);

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Filters: members + case */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", marginRight: 2 }}>Filter</span>
        {allKeys.map((k) => (
          <Tag key={k || "unassigned"} size="sm" active={memberFilter.has(k)} onClick={() => toggleMember(k)}>
            {k ? memberName(k) : "Unassigned"}
          </Tag>
        ))}
        <span style={{ width: 1, height: 16, background: "var(--border-default)", margin: "0 4px" }} />
        <Tag size="sm" active={overdueOnly} dotColor="var(--red-500)" onClick={() => setOverdueOnly((v) => !v)}>
          Overdue only
        </Tag>
        {(memberFilter.size > 0 || overdueOnly) && (
          <Tag size="sm" onClick={() => { setMemberFilter(new Set()); setOverdueOnly(false); }}>
            Clear
          </Tag>
        )}
      </div>

      {/* 2-column person grid */}
      <div className="sx-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div className="sx-grid-m1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))", gap: 14, alignItems: "start" }}>
          {visibleKeys.map((key) => {
            const mine = tasks.filter((t) => t.assigneeKey === key);
            const open = applyCase(mine.filter(isOpen)).sort(compareTasks);
            const overdue = mine.filter(isOverdue);
            const doneRecent = mine.filter((t) => t.status === "done");
            const mentioned = applyCase(
              tasks.filter((t) => key !== "" && mentionsByTask[t.id]?.has(key) && isOpen(t)),
            ).sort(compareTasks);
            return (
              <Card key={key || "unassigned"}>
                <CardBody>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                    {key ? <UserAvatar memberKey={key} size="sm" /> : null}
                    <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>
                      {key ? memberName(key) : "Unassigned"}
                    </span>
                    <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
                      <Badge tone="info">{open.length} open</Badge>
                      {overdue.length > 0 && <Badge tone="danger" dot>{overdue.length} overdue</Badge>}
                      <Badge tone="success">{doneRecent.length} done</Badge>
                    </span>
                  </div>

                  <TaskList tasks={open} projects={projects} onOpen={onOpen} hide={["assignee", "status"]} emptyTitle="No open tasks" />

                  {/* Mention table — tasks whose comments @mention this person */}
                  {key !== "" && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)", paddingBottom: 6 }}>
                        <AtSign size={11} /> Mentioned in ({mentioned.length})
                      </div>
                      {mentioned.length > 0 ? (
                        <TaskList tasks={mentioned} projects={projects} onOpen={onOpen} hide={["assignee", "status"]} emptyTitle="" />
                      ) : (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
                          No open tasks mention {memberName(key).split(" ")[0]} in comments.
                        </div>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
