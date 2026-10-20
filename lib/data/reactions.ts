import { api } from "./http";
import type { Reaction } from "@/types/domain";

/* 공용 이모지 리액션 (emoji_reactions 테이블). Board 게시글/댓글과 Sprint
   댓글이 공유한다 — CRM 댓글은 기존 comment_reactions 테이블을 그대로 쓴다. */

export type ReactionKind = "board_post" | "board_comment" | "pm_comment";

/** Slack처럼 자주 쓰는 것만 — 픽커 그리드(6열)에 노출되는 전체 목록. */
export const EMOJI_SET = ["👍", "🙏", "🙌", "✅", "👀", "🎉", "😂", "❤️", "💪", "🔥", "😮", "😢"];

export const fetchEmojiReactions = (kind: ReactionKind, ids?: string[]) => api<Record<string, Reaction[]>>(`reactions?ids=${encodeURIComponent((ids ?? []).join(","))}`);
export const setEmojiReaction = (kind: ReactionKind, targetId: string, userKey: string, emoji: string, on: boolean) => api<void>("reactions", {kind, targetId, userKey, emoji, on});

/** Pure helper: apply a toggle to a Reaction[] (optimistic UI updates). */
export function applyReaction(reactions: Reaction[], userKey: string, emoji: string, on: boolean): Reaction[] {
  const others = reactions.filter((r) => r.emoji !== emoji);
  const cur = reactions.find((r) => r.emoji === emoji);
  const userIds = new Set(cur?.userIds ?? []);
  if (on) userIds.add(userKey);
  else userIds.delete(userKey);
  return userIds.size ? [...others, { emoji, userIds: [...userIds] }] : others;
}
