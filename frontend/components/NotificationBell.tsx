"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bell, X, CheckCheck, Trash2 } from "lucide-react";
import { useProducts } from "@/lib/products-context";
import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/auth";
import { api } from "@/lib/api";

const READ_KEY = "urbn_notif_read";

function loadReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]")); }
  catch { return new Set(); }
}

function saveReadIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" });
}

function getImportance(message: string): "high" | "medium" | "low" {
  const msg = message.toLowerCase();
  if (msg.includes("reject") || msg.includes("decision") || msg.includes("ceo") || msg.includes("action required")) return "high";
  if (msg.includes("approved") || msg.includes("placed") || msg.includes("awaiting") || msg.includes("received") || msg.includes("confirmed")) return "medium";
  return "low";
}

const IMPORTANCE_STYLES = {
  high:   { dot: "bg-red-400",    row: "border-l-2 border-l-red-300/60" },
  medium: { dot: "bg-amber-400",  row: "border-l-2 border-l-amber-300/60" },
  low:    { dot: "bg-slate-300",  row: "border-l-2 border-l-transparent" },
};

export function NotificationBell() {
  const { notifications, refreshNotifications } = useProducts();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("unread");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
    setReadIds(loadReadIds());
  }, []);

  const role: Role | null = (typeof window !== "undefined" ? getSession()?.role : null) ?? null;
  const mine = role ? notifications.filter((n) => n.targetRoles.includes(role)) : [];
  const withRead = mine.map((n) => ({ ...n, read: readIds.has(n.id) }));
  const unread = withRead.filter((n) => !n.read);
  const visible = filter === "unread" ? unread : withRead;
  const unreadCount = unread.length;

  function markRead(id: string) {
    setReadIds((prev) => {
      const next = new Set([...prev, id]);
      saveReadIds(next);
      return next;
    });
  }

  function markAllRead() {
    setReadIds((prev) => {
      const next = new Set([...prev, ...mine.map((n) => n.id)]);
      saveReadIds(next);
      return next;
    });
  }

  async function dismiss(id: string) {
    markRead(id);
    await api.notifications.dismiss(Number(id)).catch(() => {});
    await refreshNotifications();
  }

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
        className="fixed z-[1000] w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 flex flex-col"
        style={{ top: pos.top, right: pos.right, maxHeight: "calc(100vh - 80px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unreadCount > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5">{unreadCount} new</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button onClick={markAllRead} title="Mark all read"
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition">
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
            <button onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100 transition">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex border-b border-slate-100 px-4 gap-1 pt-2">
          {(["unread", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`pb-2 px-2 text-xs font-medium capitalize transition border-b-2 ${filter === f ? "border-blue-500 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {f === "unread" ? `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}` : "All"}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-100">
          {(["high", "medium", "low"] as const).map((lvl) => (
            <span key={lvl} className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${IMPORTANCE_STYLES[lvl].dot}`} />
              {lvl === "high" ? "Action needed" : lvl === "medium" ? "Update" : "Info"}
            </span>
          ))}
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              {filter === "unread" ? "All caught up ✓" : "No notifications yet."}
            </p>
          ) : (
            visible.map((n) => {
              const imp = getImportance(n.message);
              const style = IMPORTANCE_STYLES[imp];
              return (
                <div key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 last:border-0 transition ${style.row} ${n.read ? "bg-white" : "bg-blue-50/30"}`}>
                  <span className={`mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full ${n.read ? "bg-slate-200" : style.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`text-xs font-semibold truncate ${n.read ? "text-slate-400" : "text-slate-800"}`}>{n.productName}</p>
                      <span className="shrink-0 text-[10px] text-slate-300 whitespace-nowrap">{relativeTime(n.createdAt)}</span>
                    </div>
                    <p className={`text-xs mt-0.5 leading-snug ${n.read ? "text-slate-400" : imp === "high" ? "text-red-600" : imp === "medium" ? "text-slate-600" : "text-slate-500"}`}>
                      {n.message}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    {!n.read && (
                      <button onClick={() => markRead(n.id)} title="Mark read"
                        className="rounded p-0.5 text-slate-300 hover:text-blue-500 transition">
                        <CheckCheck size={13} />
                      </button>
                    )}
                    <button onClick={() => dismiss(n.id)} title="Dismiss"
                      className="rounded p-0.5 text-slate-300 hover:text-red-400 transition">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {visible.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2 text-center">
            <p className="text-[10px] text-slate-300">{mine.length} total · {unreadCount} unread</p>
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
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {dropdown}
    </div>
  );
}
