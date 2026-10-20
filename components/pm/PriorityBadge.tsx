import { Flag } from "lucide-react";
import type { PmPriority } from "@/types/domain";
import { PRIORITY_COLOR, PRIORITY_LABEL } from "./pmFormat";

export function PriorityBadge({ priority }: { priority: PmPriority }) {
  return (
    <span
      className="sx-priority"
      aria-label={`${PRIORITY_LABEL[priority]} priority`}
      style={{ color: PRIORITY_COLOR[priority], background: `color-mix(in srgb, ${PRIORITY_COLOR[priority]} 9%, var(--surface-card))` }}
    >
      <Flag size={10} aria-hidden />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
