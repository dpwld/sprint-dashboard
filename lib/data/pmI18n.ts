import { api } from "./http";

/* Sprint 한/영 토글용 번역 캐시 (pm_i18n). 팀 전체가 공유 — 한 번 번역되면
   모두에게 즉시 적용되고, 원문(source)이 바뀐 항목만 재번역한다. */

/** 'text'는 체크리스트 항목·프로젝트 설명 등 임의 문자열 — target_id는 원문 해시. */
export type PmI18nKind = "task" | "project" | "text";
export type PmLang = "en" | "ko";

export interface PmI18nRow {
  kind: PmI18nKind;
  targetId: string;
  lang: PmLang;
  source: string;
  text: string;
}

export const fetchPmI18n = () => api<PmI18nRow[]>("i18n");
export const upsertPmI18n = (rows: PmI18nRow[]) => api<void>("i18n", { rows });

/** kind='text' 행의 target_id: 원문 SHA-256 앞 16바이트를 uuid 형태로. 같은
   문자열은 어디에 나와도 한 번만 번역·저장된다. */
export async function textKeyUuid(source: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const h = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** 대상 언어로 번역이 필요한가? (이미 그 언어로 쓰인 원문은 그대로 표시) */
export function needsTranslation(text: string, target: PmLang): boolean {
  const hasHangul = /[가-힯ᄀ-ᇿ]/.test(text);
  if (target === "ko") return !hasHangul && /[a-zA-Z]/.test(text);
  return hasHangul;
}
