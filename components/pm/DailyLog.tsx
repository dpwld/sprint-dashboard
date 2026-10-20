"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { Input } from "@/components/ds/forms/Input";
import { Spinner } from "@/components/ds/core/Spinner";
import type { PmDailyLog } from "@/types/domain";
import { memberName } from "@/lib/mock/team";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { deleteDailyLog, fetchDailyLogs, insertDailyLog, pmToday, type DailyLogKind } from "@/lib/data/pm";

/* Daily log — a dated one-liner journal per project OR task ("Mon 7/27:
   Meshing the CAD geometry"), so anyone can trace what happened from
   inception to completion. Enter keeps the input focused for chained
   entries. */

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${DAY[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

export function DailyLog({ kind, targetId }: { kind: DailyLogKind; targetId: string }) {
  const me = useCurrentUser();
  const [logs, setLogs] = useState<PmDailyLog[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [logDate, setLogDate] = useState(pmToday());
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchDailyLogs(kind, targetId)
      .then((rows) => { if (alive) setLogs(rows); })
      .catch((err) => {
        console.error("daily logs load failed:", err);
        if (alive) { setLogs([]); setLoadError(true); }
      });
    return () => { alive = false; };
  }, [kind, targetId]);

  async function add() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    try {
      const saved = await insertDailyLog(kind, targetId, logDate, text, me.id);
      setLogs((prev) => [saved, ...(prev ?? [])].sort((a, b) => b.logDate.localeCompare(a.logDate)));
      setBody("");
    } catch (err) {
      console.error("daily log insert failed:", err);
      setError(err instanceof Error ? err.message : "Failed to save the daily log.");
    }
  }

  async function remove(id: string) {
    const prev = logs;
    setLogs((ls) => (ls ?? []).filter((l) => l.id !== id));
    try {
      await deleteDailyLog(kind, id);
    } catch (err) {
      console.error("daily log delete failed:", err);
      setLogs(prev);
      setError(err instanceof Error ? err.message : "Failed to delete the daily log.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <Input
          size="sm"
          type="date"
          value={logDate}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogDate(e.target.value)}
          style={{ width: 140, flexShrink: 0 }}
          aria-label="Log date"
        />
        <Input
          size="sm"
          placeholder="What happened today?  (Enter)"
          value={body}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBody(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add(); }}
        />
        <Button variant="soft" size="sm" iconOnly aria-label="Add log" disabled={!body.trim()} onClick={add}>
          <Plus size={14} />
        </Button>
      </div>
      {error && <span style={{ fontSize: "var(--text-2xs)", color: "var(--red-600)" }}>{error}</span>}

      {logs === null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
          <Spinner size="sm" /> Loading…
        </div>
      ) : loadError ? (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--red-600)" }}>Couldn’t load the log.</span>
      ) : logs.length === 0 ? (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>No entries yet · jot a quick line each day.</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {logs.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: "var(--text-sm)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-muted)", width: 76, flexShrink: 0 }}>
                {dayLabel(l.logDate)}
              </span>
              <span style={{ flex: 1, minWidth: 0, color: "var(--text-default)" }}>{l.body}</span>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", flexShrink: 0 }}>{memberName(l.authorKey)}</span>
              {l.authorKey === me.id && (
                <button
                  type="button"
                  aria-label="Delete entry"
                  onClick={() => remove(l.id)}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-subtle)", padding: 0, display: "inline-grid", placeItems: "center", flexShrink: 0 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
