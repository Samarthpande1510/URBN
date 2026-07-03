"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import { useProducts } from "@/lib/products-context";
import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/auth";

export function NotificationBell() {
  const { notifications, markNotificationRead } = useProducts();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  const role: Role | null = (typeof window !== "undefined" ? getSession()?.role : null) ?? null;
  const mine = role ? notifications.filter((n) => n.targetRoles.includes(role)) : [];
  const unreadCount = mine.filter((n) => !n.read).length;

  useEffect(() => { setMounted(true); }, []);

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  }

  const dropdown = open && mounted ? createPortal(
    <>
      <div className="fixed inset-0 z-[999]" onClick={() => setOpen(false)} />
      <div
        className="fixed z-[1000] w-80 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-xl shadow-blue-900/10"
        style={{ top: pos.top, right: pos.right }}
      >
        <div className="border-b border-blue-50 px-4 py-3 text-sm font-semibold text-slate-800">
          Notifications {role && <span className="ml-2 text-xs font-normal text-slate-400">({role})</span>}
        </div>
        {mine.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">You&apos;re all caught up.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {mine.map((n) => (
              <div key={n.id} className={`flex items-start justify-between gap-2 border-b border-blue-50 px-4 py-3 last:border-0 hover:bg-blue-50/50 ${n.read ? "opacity-50" : ""}`}>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{n.productName}</p>
                  <p className="mt-0.5 text-xs text-blue-600">{n.message}</p>
                </div>
                {!n.read && (
                  <button onClick={() => markNotificationRead(n.id)} title="Mark as read" className="shrink-0 text-xs text-slate-400 hover:text-slate-700">✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <button ref={btnRef} onClick={toggle}
        className="relative rounded-full p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-600">
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {dropdown}
    </div>
  );
}
