"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { EmptyState } from "@/components/ds/feedback/EmptyState";
import type { PmProject, PmTask } from "@/types/domain";
import { pmToday } from "@/lib/data/pm";
import { PRIORITY_COLOR, PRIORITY_LABEL } from "./pmFormat";
import { PriorityBadge } from "./PriorityBadge";

/* 캘린더 뷰 — 노션식 월 달력. 태스크는 시작일~마감일을 잇는 "연속 바"로
   주 단위로 이어 그려지고(주가 바뀌면 다음 줄로 이어짐, 이어지는 쪽 모서리는
   각지게), 바 색은 우선순위(urgent 빨강 / high 주황 / medium 노랑 / low 파랑).
   태스크가 많아지면 그 주의 행 높이가 자동으로 늘어나 전부 보인다.
   바 클릭 = 태스크 드로어. */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HEADER_H = 32; // 날짜 숫자 영역
const LANE_H = 26; // 바 한 줄 높이
const MS_DAY = 86400000;

function parseDay(s: string): number {
  return Math.floor(new Date(s + "T00:00:00").getTime() / MS_DAY);
}

interface Seg {
  task: PmTask;
  col: number; // 0-6 (주 안의 시작 칸)
  span: number; // 칸 수
  contLeft: boolean; // 앞 주에서 이어짐
  contRight: boolean; // 다음 주로 이어짐
  lane: number;
}

export function CalendarView({
  tasks,
  onOpen,
}: {
  projects: PmProject[];
  tasks: PmTask[];
  onOpen: (id: string) => void;
}) {
  const today = pmToday();
  const todayDay = parseDay(today);
  const [cursor, setCursor] = useState(() => {
    const d = new Date(today + "T00:00:00");
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const first = new Date(cursor.y, cursor.m, 1);
  const firstCellDay = parseDay(
    `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-01`,
  ) - first.getDay();
  const lastDate = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const weekCount = Math.ceil((first.getDay() + lastDate) / 7);

  // 주별 세그먼트 + 레인 배치 (긴 바 먼저 깔아 빈틈을 줄인다).
  const weeks = useMemo(() => {
    const dated = tasks
      .filter((t) => t.dueDate)
      .map((t) => {
        const due = parseDay(t.dueDate!);
        const start = Math.min(t.startedOn ? parseDay(t.startedOn) : due, due);
        // 실수로 몇 달짜리 바가 되지 않게 31일로 제한.
        return { t, start: Math.max(start, due - 30), end: due };
      });

    return Array.from({ length: weekCount }, (_, w) => {
      const weekStart = firstCellDay + w * 7;
      const weekEnd = weekStart + 6;
      const segs: Seg[] = [];
      for (const { t, start, end } of dated) {
        if (end < weekStart || start > weekEnd) continue;
        const s = Math.max(start, weekStart);
        const e = Math.min(end, weekEnd);
        segs.push({
          task: t,
          col: s - weekStart,
          span: e - s + 1,
          contLeft: start < weekStart,
          contRight: end > weekEnd,
          lane: 0,
        });
      }
      segs.sort((a, b) => a.col - b.col || b.span - a.span);
      const laneEnds: number[] = []; // lane → 마지막으로 차지한 col(끝)
      for (const seg of segs) {
        let lane = laneEnds.findIndex((endCol) => endCol < seg.col);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(-1);
        }
        laneEnds[lane] = seg.col + seg.span - 1;
        seg.lane = lane;
      }
      return { weekStart, segs, lanes: laneEnds.length };
    });
  }, [tasks, firstCellDay, weekCount]);

  if (!tasks.some((t) => t.dueDate)) {
    return (
      <EmptyState
        icon={<CalendarDays size={24} />}
        title="No dated tasks"
        description="Tasks with a due date appear on the calendar."
      />
    );
  }

  const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goToday = () => {
    const d = new Date(today + "T00:00:00");
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--text-strong)" }}>{monthLabel}</span>
        {/* 우선순위 색 범례 */}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 10 }}>
          {(["urgent", "high", "medium", "low"] as const).map((p) => (
            <PriorityBadge key={p} priority={p} />
          ))}
        </span>
        <span style={{ flex: 1 }} />
        <Button variant="soft" size="sm" onClick={goToday}>Today</Button>
        <Button variant="ghost" size="sm" iconOnly aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft size={15} /></Button>
        <Button variant="ghost" size="sm" iconOnly aria-label="Next month" onClick={() => move(1)}><ChevronRight size={15} /></Button>
      </div>

      <div
        className="sx-scroll"
        style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)",
          background: "var(--surface-card)",
        }}
      >
        {/* 요일 헤더 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", position: "sticky", top: 0, zIndex: 3, background: "var(--surface-card)", borderBottom: "1px solid var(--border-subtle)" }}>
          {DOW.map((d) => (
            <div key={d} style={{ textAlign: "center", padding: "5px 0", fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--text-subtle)" }}>
              {d}
            </div>
          ))}
        </div>

        {weeks.map(({ weekStart, segs, lanes }) => {
          // 태스크가 많은 주는 행이 자동으로 길어져 전부 보인다.
          const height = HEADER_H + Math.max(1, lanes) * LANE_H + 8;
          return (
            <div key={weekStart} style={{ position: "relative", minHeight: height, borderBottom: "1px solid var(--border-subtle)" }}>
              {/* 날짜 칸 배경 */}
              <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                {Array.from({ length: 7 }, (_, i) => {
                  const day = weekStart + i;
                  const date = new Date(day * MS_DAY);
                  const inMonth = date.getMonth() === cursor.m;
                  const isToday = day === todayDay;
                  return (
                    <div
                      key={i}
                      style={{
                        borderRight: i === 6 ? "none" : "1px solid var(--border-subtle)",
                        background: inMonth ? "transparent" : "var(--surface-sunken)",
                        padding: "4px 6px",
                        display: "flex", justifyContent: "flex-end", alignItems: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-grid", placeItems: "center",
                          width: 22, height: 22, borderRadius: 999,
                          fontSize: "var(--text-2xs)", fontVariantNumeric: "tabular-nums",
                          fontWeight: isToday ? 700 : 500,
                          color: isToday ? "#fff" : inMonth ? "var(--text-default)" : "var(--text-subtle)",
                          background: isToday ? "var(--red-500)" : "transparent",
                        }}
                      >
                        {date.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 연속 바 — 주 경계를 넘으면 이어지는 쪽 모서리를 각지게 */}
              {segs.map((seg) => {
                const done = seg.task.status === "done";
                const color = PRIORITY_COLOR[seg.task.priority];
                return (
                  <button
                    key={seg.task.id + "-" + seg.col}
                    type="button"
                    onClick={() => onOpen(seg.task.id)}
                    title={`${seg.task.title} (${PRIORITY_LABEL[seg.task.priority]}) · ${seg.task.startedOn ?? seg.task.dueDate} → ${seg.task.dueDate}`}
                    style={{
                      position: "absolute",
                      top: HEADER_H + seg.lane * LANE_H,
                      left: `calc(${(seg.col / 7) * 100}% + ${seg.contLeft ? 0 : 3}px)`,
                      width: `calc(${(seg.span / 7) * 100}% - ${(seg.contLeft ? 0 : 3) + (seg.contRight ? 0 : 3)}px)`,
                      height: LANE_H - 5,
                      border: "none", cursor: "pointer", textAlign: "left",
                      borderRadius: 6,
                      borderTopLeftRadius: seg.contLeft ? 0 : 6,
                      borderBottomLeftRadius: seg.contLeft ? 0 : 6,
                      borderTopRightRadius: seg.contRight ? 0 : 6,
                      borderBottomRightRadius: seg.contRight ? 0 : 6,
                      // 원색 바는 눈이 아프고 흰 글씨가 묻힌다 — 옅은 배경 + 진한 글씨 (노션 톤).
                      background: `color-mix(in srgb, ${color} 18%, var(--surface-card))`,
                      // 왼쪽 색 스트라이프는 바가 실제로 시작하는 조각에만 (이어지는 조각 제외)
                      boxShadow: seg.contLeft ? "none" : `inset 3px 0 0 0 ${color}`,
                      opacity: done ? 0.45 : 1,
                      color: done ? "var(--text-subtle)" : `color-mix(in srgb, ${color} 72%, var(--text-strong))`,
                      fontSize: "var(--text-2xs)", fontWeight: 600,
                      padding: "0 8px 0 10px",
                      textDecoration: done ? "line-through" : "none",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      zIndex: 2,
                    }}
                  >
                    {/* 주가 바뀌어 이어지는 조각에도 제목을 반복 — 없으면 무슨 태스크인지 알 수 없다 */}
                    {PRIORITY_LABEL[seg.task.priority]} · {seg.task.title}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
