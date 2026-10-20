"use client";

import { useSyncExternalStore } from "react";

const query = "(max-width: 767px)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Keep server and hydration output identical, then follow the viewport. */
export function useMobile() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
