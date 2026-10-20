"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

/* Workspace DateField — 노션식 날짜 입력 (2026-09-22 지시): 필드를 클릭하면 아래에
   달력 팝오버가 뜨고, 날짜 클릭으로 선택한다. 값은 yyyy-mm-dd 문자열. */

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };

export function DateField({
  value,
  onChange,
  placeholder = "Set date…",
  clearable = true,
  className = "",
  style,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  // 팝오버가 보고 있는 달 — 열 때 선택값(없으면 오늘) 기준
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  function openPicker() {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    setView({ y: base.getFullYear(), m: base.getMonth() });
    setOpen((v) => !v);
  }

  const first = new Date(view.y, view.m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = first.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const tIso = todayIso();

  return (
    <div ref={wrapRef} className={className} style={{ position: "relative", ...style }}>
      <button
        type="button"
        onClick={openPicker}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, width: "100%",
          border: "1px solid transparent", background: "none", cursor: "pointer",
          borderRadius: "var(--radius-sm)", padding: "5px 8px", font: "inherit",
          fontSize: "var(--text-sm)", color: value ? "var(--text-strong)" : "var(--text-subtle)",
          fontVariantNumeric: "tabular-nums", textAlign: "left",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-sunken)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
      >
        <CalendarDays size={13} style={{ color: "var(--text-subtle)", flexShrink: 0 }} />
        {value ? value.replace(/-/g, ". ") + "." : placeholder}
      </button>

      {open && (
        <div
          className="sx-anim-pop"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 70, width: 252,
            background: "var(--surface-card)", border: "1px solid var(--border-default)",
            borderRadius: 12, boxShadow: "var(--shadow-lg, 0 12px 32px rgba(0,0,0,.14))", padding: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-strong)", paddingLeft: 4 }}>{monthLabel}</span>
            <span style={{ display: "inline-flex", gap: 2 }}>
              <button type="button" aria-label="Previous month" style={navBtn} onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}>
                <ChevronLeft size={14} />
              </button>
              <button type="button" aria-label="Next month" style={navBtn} onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}>
                <ChevronRight size={14} />
              </button>
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {DOW.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--text-subtle)", padding: "2px 0" }}>{d}</div>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <div key={`e${i}`} />;
              const dayIso = iso(view.y, view.m, d);
              const selected = value === dayIso;
              const isToday = dayIso === tIso;
              return (
                <button
                  key={dayIso}
                  type="button"
                  onClick={() => { onChange(dayIso); setOpen(false); }}
                  style={{
                    border: "none", cursor: "pointer", borderRadius: 8, padding: "5px 0",
                    fontSize: "var(--text-xs)", fontVariantNumeric: "tabular-nums",
                    background: selected ? "var(--color-primary)" : "transparent",
                    color: selected ? "#fff" : isToday ? "var(--color-primary)" : "var(--text-default)",
                    fontWeight: selected || isToday ? 700 : 400,
                    outline: isToday && !selected ? "1px solid var(--color-primary-soft, #c7dbff)" : "none",
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, borderTop: "1px solid var(--border-subtle)", paddingTop: 6 }}>
            <button type="button" style={footBtn} onClick={() => { onChange(tIso); setOpen(false); }}>Today</button>
            {clearable && value && (
              <button type="button" style={{ ...footBtn, color: "var(--text-muted)" }} onClick={() => { onChange(null); setOpen(false); }}>
                <X size={11} style={{ verticalAlign: "-1px" }} /> Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)",
  borderRadius: 6, padding: "3px 5px", display: "inline-flex",
};
const footBtn: React.CSSProperties = {
  border: "none", background: "none", cursor: "pointer", color: "var(--color-primary)",
  fontSize: "var(--text-xs)", fontWeight: 600, padding: "2px 6px", borderRadius: 6,
};
