"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useProducts } from "@/lib/products-context";
import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/auth";
import { Bell, CheckCheck, Trash2 } from "lucide-react";

function fmt(v: string) {
  return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function NotificationsPage() {
  const { notifications, markNotificationRead, markAllNotificationsRead, dismissNotification } = useProducts();
  const [role, setRole] = useState<Role | null>(null);
  const [tab, setTab] = useState<"unread" | "all">("unread");

  useEffect(() => { setRole(getSession()?.role ?? null); }, []);

  const mine = role ? notifications.filter((n) => n.targetRoles.includes(role)) : [];
  const unread = mine.filter((n) => !n.read);
  const displayed = tab === "unread" ? unread : mine;

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
          <p className="mt-1 text-sm text-blue-700">
            {unread.length > 0 ? `${unread.length} unread` : "All caught up"} · {mine.length} total
          </p>
        </div>
        {unread.length > 0 && role && (
          <button
            onClick={() => markAllNotificationsRead(role)}
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 transition shadow-sm"
          >
            <CheckCheck size={15} /> Mark all read
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 rounded-lg border border-blue-100 bg-white p-1 w-fit shadow-sm">
        {(["unread", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              tab === t ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-blue-50"
            }`}
          >
            {t === "unread" ? `Unread${unread.length > 0 ? ` (${unread.length})` : ""}` : `All (${mine.length})`}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {displayed.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-blue-100 px-5 py-16 text-center">
            <Bell size={28} className="mx-auto mb-3 text-blue-200" />
            <p className="text-sm text-slate-500">{tab === "unread" ? "No unread notifications." : "No notifications yet."}</p>
          </div>
        ) : (
          displayed.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-4 rounded-xl border px-5 py-4 transition ${
                n.read
                  ? "border-blue-50 bg-white"
                  : "border-blue-200 bg-blue-50/60"
              }`}
            >
              {/* Unread dot */}
              <div className="mt-1.5 shrink-0">
                <span className={`block h-2 w-2 rounded-full ${n.read ? "bg-slate-200" : "bg-blue-500"}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{n.productName}</p>
                  {!n.read && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">NEW</span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                <p className="mt-1 text-[11px] text-slate-400 tabular-nums">{fmt(n.createdAt)}</p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {!n.read && (
                  <button
                    onClick={() => markNotificationRead(n.id)}
                    className="rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition"
                  >
                    Mark read
                  </button>
                )}
                <button
                  onClick={() => dismissNotification(n.id)}
                  className="rounded-lg border border-slate-100 p-1.5 text-slate-400 hover:border-red-200 hover:text-red-400 transition"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {displayed.length > 0 && (
        <p className="mt-4 text-xs text-slate-400">{displayed.length} notification{displayed.length !== 1 ? "s" : ""} shown</p>
      )}
    </AppShell>
  );
}
