/* AI work-order generator (executive Task manager). `generateWorkOrder` calls
   the server route `/api/work-order` (OpenAI structured output). Failures are
   THROWN so callers can tell the user — never silently replaced with the local
   mock (that misled users into treating canned text as an AI result). */

export interface WorkOrderSection {
  heading: string;
  bullets: string[];
}

export interface WorkOrder {
  title: string;
  overview: string;
  sections: WorkOrderSection[];
  deliverable: string;
  due: string;
}

export interface WorkOrderInput {
  rawTask: string;
  due?: string;
}

export interface WorkOrderResult {
  order: WorkOrder;
  /** ai_logs row id for rating / final-version capture; null when no rating record was returned. */
  logId: string | null;
}

/** Generate a work order via the OpenAI route. Throws on failure. */
export async function generateWorkOrder(input: WorkOrderInput): Promise<WorkOrderResult> {
  const res = await fetch("/api/work-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) { const error = await res.json() as {error?:string}; throw new Error(error.error || `AI work order failed (${res.status})`); }
  const { _logId, ...order } = (await res.json()) as WorkOrder & { _logId?: string | null };
  return { order, logId: _logId ?? null };
}
