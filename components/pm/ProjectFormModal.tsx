"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ds/feedback/Modal";
import { Button } from "@/components/ds/core/Button";
import { FormField } from "@/components/ds/forms/FormField";
import { Input } from "@/components/ds/forms/Input";
import { Textarea } from "@/components/ds/forms/Textarea";
import { Select } from "@/components/ds/forms/Select";
import type { PmPriority, PmProject, PmProjectStatus } from "@/types/domain";
import { TEAM_MEMBERS } from "@/lib/mock/team";
import { PROJECT_STATUS_LABEL, PRIORITY_LABEL, PRIORITY_ORDER } from "./pmFormat";
import type { PmProjectInput } from "@/lib/data/pm";

/** Create or edit a project (장기 과제). Edit mode also offers delete —
   child tasks survive (project_id becomes null). */
export function ProjectFormModal({
  open,
  project,
  busy,
  onClose,
  onCreate,
  onSave,
  onDelete,
}: {
  open: boolean;
  /** null = create mode. */
  project: PmProject | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: PmProjectInput) => Promise<boolean>;
  onSave: (id: string, patch: Partial<PmProject>) => Promise<boolean>;
  onDelete: (project: PmProject) => void;
}) {
  // Mounted fresh per open (keyed by the caller), so props seed state directly.
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<PmProjectStatus>(project?.status ?? "active");
  const [priority, setPriority] = useState<PmPriority>(project?.priority ?? "medium");
  const [ownerKey, setOwnerKey] = useState(project?.ownerKey ?? "");
  const [targetDate, setTargetDate] = useState(project?.targetDate ?? "");

  async function submit() {
    if (!name.trim()) return;
    const payload = { name: name.trim(), description, status, priority, ownerKey, targetDate: targetDate || null };
    const ok = project ? await onSave(project.id, payload) : await onCreate(payload);
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Edit project" : "New project"}
      subtitle="Long-running work · progress tracked across sprints"
      size="md"
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>
            {project && (
              <Button variant="danger" size="sm" leftIcon={<Trash2 size={14} />} onClick={() => onDelete(project)}>
                Delete
              </Button>
            )}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={busy} disabled={!name.trim()} onClick={submit}>{project ? "Save" : "Create"}</Button>
          </span>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <FormField label="Name" required>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Description" optional>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <FormField label="Status">
            <Select
              value={status}
              options={(Object.keys(PROJECT_STATUS_LABEL) as PmProjectStatus[]).map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }))}
              onChange={(e) => setStatus(e.target.value as PmProjectStatus)}
            />
          </FormField>
          <FormField label="Priority">
            <Select
              value={priority}
              options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
              onChange={(e) => setPriority(e.target.value as PmPriority)}
            />
          </FormField>
          <FormField label="Owner (DRI)">
            <Select
              value={ownerKey}
              options={[{ value: "", label: "Unassigned" }, ...TEAM_MEMBERS.map((m) => ({ value: m.id, label: m.fullName }))]}
              onChange={(e) => setOwnerKey(e.target.value)}
            />
          </FormField>
          <FormField label="Target date" optional>
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}
