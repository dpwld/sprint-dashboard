/* 이미지 확대 보기 — 메모/게시글 등에 첨부된 이미지를 클릭해 원본 크기로 본다
   (2026-09-28 피드백). React 상태 없이 body 오버레이로 띄워 contentEditable
   에디터에서도 쓸 수 있다. 클릭/Escape로 닫힘. */

export function openImageLightbox(src: string): void {
  if (!src) return;
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9999;background:rgba(10,12,16,.88);" +
    "display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:28px;";
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.style.cssText =
    "max-width:96%;max-height:96%;object-fit:contain;border-radius:8px;" +
    "box-shadow:0 8px 40px rgba(0,0,0,.5);background:#fff;";
  overlay.appendChild(img);
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  // 닫기 클릭이 드로어의 "바깥 클릭 닫기" 감지로 전파돼 작업 드로어까지 닫히는
  // 것을 막는다 (2026-09-28 QA).
  // Drawer의 바깥 감지는 pointerdown 리스너라 pointer 계열도 함께 막아야 한다.
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click"] as const) {
    overlay.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === "click") close();
    });
  }
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}
