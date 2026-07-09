"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeLoading } from "@/lib/loading";

const SHOW_DELAY = 180;   // don't flash the overlay for near-instant requests
const MIN_VISIBLE = 350;  // once shown, keep it up briefly to avoid flicker

export function GlobalLoader() {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [show, setShow] = useState(false);

  // Subscribe to the global in-flight request count.
  useEffect(() => {
    setMounted(true);
    return subscribeLoading(setActive);
  }, []);

  // Show after a short delay; once shown, honor a minimum visible time.
  useEffect(() => {
    if (active) {
      const t = setTimeout(() => setShow(true), SHOW_DELAY);
      return () => clearTimeout(t);
    }
    if (show) {
      const t = setTimeout(() => setShow(false), MIN_VISIBLE);
      return () => clearTimeout(t);
    }
  }, [active, show]);

  if (!mounted || !show) return null;

  return createPortal(
    <div className="global-loader fixed inset-0 z-[3000] flex items-center justify-center bg-white/40 backdrop-blur-[2px]">
      <div className="global-loader-card flex flex-col items-center gap-3 rounded-2xl bg-white/95 px-9 py-7 shadow-xl shadow-blue-900/10 ring-1 ring-blue-100/80">
        <span className="block h-8 w-8 rounded-full border-[3px] border-blue-100 border-t-blue-600 animate-spin" />
        <span className="text-xs font-medium tracking-wide text-slate-500">Working…</span>
      </div>
    </div>,
    document.body
  );
}
