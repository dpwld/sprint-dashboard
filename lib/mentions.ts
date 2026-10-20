import { TEAM_MEMBERS } from "@/lib/mock/team";
import { insertMentionNotifications } from "@/lib/data/notifications";

/* @멘션 파싱 + 알림 팬아웃. 코멘트 본문에서 "@이름"(이름 = 팀 디렉터리의
   전체 이름 또는 이름 첫 단어, 대소문자 무시)을 찾아 멤버 키로 변환한다. */

interface MentionPattern {
  key: string;
  /** Longest first so the full member name wins over a first name. */
  names: string[];
}

const patterns = (): MentionPattern[] => TEAM_MEMBERS
  .map((m) => ({
    key: m.id,
    names: [m.fullName, m.fullName.split(" ")[0]].filter((n, i, a) => n && a.indexOf(n) === i),
  }));

/** Member keys @mentioned in `body` (deduped, order of first appearance). */
export function extractMentionKeys(body: string): string[] {
  const lower = body.toLowerCase();
  const found: { key: string; at: number }[] = [];
  for (const p of patterns()) {
    let best = -1;
    for (const name of p.names) {
      const at = lower.indexOf("@" + name.toLowerCase());
      if (at !== -1 && (best === -1 || at < best)) best = at;
    }
    if (best !== -1) found.push({ key: p.key, at: best });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.key);
}

/** All member names, longest first — used to highlight mentions in rendered text. */
export const MENTION_NAMES: string[] = [];
export function refreshMentionNames() { MENTION_NAMES.splice(0, MENTION_NAMES.length, ...patterns().flatMap(p => p.names).sort((a,b) => b.length-a.length)); }

/** Split `body` into plain/mention segments for rendering. */
export function splitMentions(body: string): { text: string; mention: boolean }[] {
  if (!body.includes("@") || !MENTION_NAMES.length) return [{ text: body, mention: false }];
  const pattern = new RegExp(`@(?:${MENTION_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const out: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: body.slice(last, at), mention: false });
    out.push({ text: m[0], mention: true });
    last = at + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out;
}

/** 이메일 첨부 — 클라이언트가 base64로 만들어 보내면 서버가 MIME으로 싣는다. */
export interface EmailAttachment {
  filename: string;
  mimeType: string;
  dataBase64: string;
}

/** 이메일 알림 팬아웃 (본인 Gmail 발신, best-effort). 결과를 돌려줘 호출자가
   "왜 안 갔는지"(스코프 없음·토큰 없음)를 토스트로 알릴 수 있게 한다. */
export async function notifyByEmail(opts: {
  recipients: string[];
  subject: string;
  bodyText?: string;
  /** external 전용 — 문서 PDF 등 파일 첨부 (multipart/mixed 발송). */
  attachments?: EmailAttachment[];
  /** external 전용 — 참조/숨은참조. 한 통에 헤더로 구분되어 발송된다. */
  cc?: string[];
  bcc?: string[];
  /** external 전용 — 컴포저가 만든 HTML 본문 (서버가 서명을 붙인다). */
  bodyHtml?: string;
  link?: string;
  /** true면 외부 수신자용 — 서비스 브랜딩/링크 없이 본문만 보낸다. recipients에 이메일 주소 허용. */
  external?: boolean;
}): Promise<{ sent?: number; error?: string } | null> {
  if (opts.recipients.length === 0) return null;
  try {
    const res = await fetch("/api/pm/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    const result = (await res.json()) as { sent?: number; error?: string };
    if (result.error && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("integration-error", {detail:result.error}));
    return result;
  } catch {
    return {error:"Notification request failed"};
  }
}

/** Create bell notifications for everyone mentioned in `body` (minus the
   actor). Best-effort: errors are logged, never thrown — the comment itself
   must not fail because a notification couldn't be written. */
export async function notifyMentions(opts: { body: string; actorKey: string; title: string; link: string }): Promise<void> {
  const recipients = extractMentionKeys(opts.body).filter((k) => k !== opts.actorKey);
  if (recipients.length === 0) return;
  try {
    await insertMentionNotifications({
      recipients,
      actorKey: opts.actorKey,
      title: opts.title,
      body: opts.body.length > 140 ? opts.body.slice(0, 140) + "…" : opts.body,
      link: opts.link,
    });
  } catch (err) {
    console.error("mention notify failed:", err);
  }
  // 벨과 별개로 이메일도 발송 (Gmail 스코프·토큰이 없으면 서버가 스킵).
  void notifyByEmail({ recipients, subject: opts.title, bodyText: opts.body, link: opts.link });
}
