"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useProducts } from "@/lib/products-context";
import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/auth";

export function NotificationBell() {
  const { notifications, dismissNotification } = useProducts();
  const [open, setOpen] = useState(false);

  const role: Role | null = (typeof window !== "undefined" ? getSession()?.role : null) ?? null;
  const mine = role ? notifications.filter((n) => n.targetRoles.includes(role)) : [];

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-600">
        <Bell size={19} />
        {mine.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
            {mine.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-xl shadow-blue-900/10">
            <div className="border-b border-blue-50 px-4 py-3 text-sm font-semibold text-slate-800">
              Notifications {role && <span className="ml-2 text-xs font-normal text-slate-400">({role})</span>}
            </div>
            {mine.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">You&apos;re all caught up.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {mine.map((n) => (
                  <div key={n.id} className="flex items-start justify-between gap-2 border-b border-blue-50 px-4 py-3 last:border-0 hover:bg-blue-50/50">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{n.productName}</p>
                      <p className="mt-0.5 text-xs text-blue-600">{n.message}</p>
                    </div>
                    <button onClick={() => dismissNotification(n.id)} className="shrink-0 text-xs text-slate-400 hover:text-slate-700">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
