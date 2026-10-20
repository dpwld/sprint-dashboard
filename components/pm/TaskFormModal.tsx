"use client";

import { useState } from "react";
import { Modal } from "@/components/ds/feedback/Modal";
import { Button } from "@/components/ds/core/Button";
import { FormField } from "@/components/ds/forms/FormField";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import type { PmPriority, PmProject } from "@/types/domain";
import { TEAM_MEMBERS } from "@/lib/mock/team";
import { PRIORITY_ORDER, PRIORITY_LABEL } from "./pmFormat";
import { pmToday, type PmTaskInput } from "@/lib/data/pm";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";

const NONE = "__none__";

/** Quick-create modal. Defaults: current sprint, medium priority, me unassigned. */
export function TaskFormModal({
  open,
  projects,
  busy,
  onClose,
  onCreate,
}: {
  open: boolean;
  projects: PmProject[];
  busy: boolean;
  onClose: () => void;
  onCreate: (input: PmTaskInput) => Promise<boolean>;
}) {
  const me = useCurrentUser();
  const [title, setTitle] = useState("");
  // 담당자는 본인으로 시작 — 대부분 자기 할 일을 적는다 (다른 사람이면 바꾸면 됨).
  const [assigneeKey, setAssigneeKey] = useState(() => (TEAM_MEMBERS.some((m) => m.id === me.id) ? me.id : ""));
  const [priority, setPriority] = useState<PmPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [startedOn, setStartedOn] = useState(pmToday());
  const [projectId, setProjectId] = useState(NONE);


  // "추가하고 하나 더": 제목·기한만 비우고 담당자·프로젝트·시작일은 이어 쓴다 (연달아 같은 프로젝트 태스크를 적는 흐름).
  function reset() {
    setTitle("");
    setPriority("medium");
    setDueDate("");
  }

  async function submit(addAnother: boolean) {
    if (!title.trim()) return;
    const ok = await onCreate({
      title: title.trim(),
      description: "",
      projectId: projectId === NONE ? null : projectId,
      sprintId: null,
      assigneeKey,
      status: "todo",
      priority,
      dueDate: dueDate || null,
      startedOn: startedOn || null,
    });
    if (ok) {
      reset();
      if (!addAnother) onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      size="md"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {/* HubSpot의 "Create and add another" 패턴 — 연속 입력 */}
          <Button variant="soft" loading={busy} disabled={!title.trim()} onClick={() => submit(true)}>
            Create and add another
          </Button>
          <Button loading={busy} disabled={!title.trim()} onClick={() => submit(false)}>
            Create
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <FormField label="Title" required>
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" />
        </FormField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FormField label="Assignee" hint="Single owner (DRI)">
            <Select
              value={assigneeKey}
              options={[{ value: "", label: "Unassigned" }, ...TEAM_MEMBERS.map((m) => ({ value: m.id, label: m.fullName }))]}
              onChange={(e) => setAssigneeKey(e.target.value)}
            />
          </FormField>
          <FormField label="Priority">
            <Select
              value={priority}
              options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
              onChange={(e) => setPriority(e.target.value as PmPriority)}
            />
          </FormField>
          <FormField label="Start date" hint="Auto-filled with today">
            <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
          </FormField>
          <FormField label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          <FormField label="Project">
            <Select
              value={projectId}
              options={[{ value: NONE, label: "misc. (no project)" }, ...projects.filter((p) => p.status === "active").map((p) => ({ value: p.id, label: p.name }))]}
              onChange={(e) => setProjectId(e.target.value)}
            />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}
