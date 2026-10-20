import { MENTION_NAMES } from "@/lib/mentions";

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Wrap bare URLs in text nodes with anchors (run on blur, before save). */
export function linkify(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (t.parentElement?.closest("a")) continue;
    if (URL_RE.test(t.textContent ?? "")) targets.push(t);
    URL_RE.lastIndex = 0;
  }
  for (const t of targets) {
    const text = t.textContent ?? "";
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(URL_RE)) {
      fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
      const a = document.createElement("a");
      a.href = match[0];
      a.textContent = match[0];
      a.target = "_blank";
      a.rel = "noreferrer noopener";
      fragment.appendChild(a);
      last = match.index + match[0].length;
    }
    fragment.appendChild(document.createTextNode(text.slice(last)));
    t.replaceWith(fragment);
  }
}

const mentionRe = () =>
  new RegExp(`@(?:${MENTION_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");

/** Highlight @mentions as people tags (run on blur, before save — like linkify). */
export function mentionify(root: HTMLElement) {
  if (!MENTION_NAMES.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (t.parentElement?.closest("a,[data-mention]")) continue;
    if (mentionRe().test(t.textContent ?? "")) targets.push(t);
  }
  for (const t of targets) {
    const text = t.textContent ?? "";
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(mentionRe())) {
      fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
      const tag = document.createElement("span");
      tag.setAttribute("data-mention", "");
      tag.style.cssText = "color:var(--color-primary);font-weight:600;background:color-mix(in srgb, var(--color-primary) 8%, transparent);border-radius:4px;padding:0 3px";
      tag.textContent = match[0];
      fragment.appendChild(tag);
      last = match.index + match[0].length;
    }
    fragment.appendChild(document.createTextNode(text.slice(last)));
    t.replaceWith(fragment);
  }
}
