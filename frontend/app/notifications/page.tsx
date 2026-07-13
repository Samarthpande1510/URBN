"use client";

import { useEffect, useState } from "react";
import { parseServerDate } from "@/lib/datetime";
import { AppShell } from "@/components/AppShell";
import { useProducts } from "@/lib/products-context";
import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/auth";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
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
  const diff = Date.now() - parseServerDate(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return parseServerDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" });
}

function getImportance(message: string): "high" | "medium" | "low" {
  const msg = message.toLowerCase();
  if (msg.includes("reject") || msg.includes("decision") || msg.includes("awaiting ceo")) return "high";
  if (msg.includes("approved") || msg.includes("placed") || msg.includes("received") || msg.includes("confirmed") || msg.includes("awaiting")) return "medium";
  return "low";
}

const IMP_CONFIG = {
  high:   { dot: "bg-red-400",   border: "border-l-red-300",   bg: "bg-red-50/40",    label: "Action needed", labelCls: "bg-red-100 text-red-700",   msgCls: "text-red-700" },
  medium: { dot: "bg-amber-400", border: "border-l-amber-300", bg: "bg-amber-50/30",  label: "Update",        labelCls: "bg-amber-100 text-amber-700", msgCls: "text-slate-700" },
  low:    { dot: "bg-slate-300", border: "border-l-slate-200", bg: "bg-white",        label: "Info",          labelCls: "bg-slate-100 text-slate-500",  msgCls: "text-slate-600" },
};

export default function NotificationsPage() {
  const { notifications, refreshNotifications } = useProducts();
  const [role, setRole] = useState<Role | null>(null);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [filterImp, setFilterImp] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    setRole(getSession()?.role ?? null);
    setReadIds(loadReadIds());
  }, []);

  const mine = role ? notifications.filter((n) => n.targetRoles.includes(role)) : [];
  const withRead = mine.map((n) => ({ ...n, read: readIds.has(n.id), importance: getImportance(n.message) as "high" | "medium" | "low" }));
  const unread = withRead.filter((n) => !n.read);

  let displayed = tab === "unread" ? unread : withRead;
  if (filterImp !== "all") displayed = displayed.filter((n) => n.importance === filterImp);

  function markRead(id: string) {
    setReadIds((prev) => { const next = new Set([...prev, id]); saveReadIds(next); return next; });
  }

  function markAllRead() {
    setReadIds((prev) => { const next = new Set([...prev, ...mine.map((n) => n.id)]); saveReadIds(next); return next; });
  }

  async function dismiss(id: string) {
    markRead(id);
    await api.notifications.dismiss(Number(id)).catch(() => {});
    await refreshNotifications();
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            <span className="text-blue-600 font-medium">{unread.length} unread</span>
            <span className="mx-1.5 text-slate-300">·</span>
            {mine.length} total
          </p>
        </div>
        {unread.length > 0 && (
          <button onClick={markAllRead}
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 transition shadow-sm">
            <CheckCheck size={15} /> Mark all read
          </button>
        )}
      </div>

      {/* Tabs + importance filter */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-blue-100 bg-white p-1 w-fit shadow-sm">
          {(["unread", "all"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === t ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-blue-50"}`}>
              {t === "unread" ? `Unread${unread.length > 0 ? ` (${unread.length})` : ""}` : `All (${mine.length})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-1">Filter:</span>
          {(["all", "high", "medium", "low"] as const).map((imp) => (
            <button key={imp} onClick={() => setFilterImp(imp)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition border ${
                filterImp === imp
                  ? imp === "high" ? "bg-red-100 text-red-700 border-red-200"
                    : imp === "medium" ? "bg-amber-100 text-amber-700 border-amber-200"
                    : imp === "low" ? "bg-slate-100 text-slate-600 border-slate-200"
                    : "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}>
              {imp === "all" ? "All" : imp === "high" ? "Action needed" : imp === "medium" ? "● Updates" : "· Info"}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Action needed — rejection, CEO decisions</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Update — status changes, approvals</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />Info — general activity</span>
      </div>

      {/* List */}
      <div className="mt-4 space-y-2">
        {displayed.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-blue-100 px-5 py-16 text-center">
            <Bell size={28} className="mx-auto mb-3 text-blue-200" />
            <p className="text-sm text-slate-500">{tab === "unread" ? "All caught up ✓" : "No notifications yet."}</p>
          </div>
        ) : (
          displayed.map((n) => {
            const cfg = IMP_CONFIG[n.importance];
            return (
              <div key={n.id}
                className={`flex items-start gap-4 rounded-xl border border-l-4 px-5 py-4 transition ${cfg.border} ${n.read ? "border-slate-100 bg-white" : `border-blue-100 ${cfg.bg}`}`}>
                <div className="mt-1.5 shrink-0">
                  <span className={`block h-2 w-2 rounded-full ${n.read ? "bg-slate-200" : cfg.dot}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-sm font-semibold ${n.read ? "text-slate-400" : "text-slate-800"}`}>{n.productName}</p>
                    {!n.read && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.labelCls}`}>{cfg.label}</span>
                    )}
                  </div>
                  <p className={`mt-0.5 text-sm ${n.read ? "text-slate-400" : cfg.msgCls}`}>{n.message}</p>
                  <p className="mt-1 text-[11px] text-slate-400 tabular-nums">{relativeTime(n.createdAt)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {!n.read && (
                    <button onClick={() => markRead(n.id)}
                      className="rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition">
                      Mark read
                    </button>
                  )}
                  <button onClick={() => dismiss(n.id)} title="Dismiss"
                    className="rounded-lg border border-slate-100 p-1.5 text-slate-400 hover:border-red-200 hover:text-red-400 transition">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {displayed.length > 0 && (
        <p className="mt-4 text-xs text-slate-400">{displayed.length} notification{displayed.length !== 1 ? "s" : ""} shown</p>
      )}
    </AppShell>
  );
}
