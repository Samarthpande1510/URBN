"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useProducts } from "@/lib/products-context";
import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/auth";

export function NotificationBell() {
  const { notifications, dismissNotification } = useProducts();
  const [open, setOpen] = useState(false);

  // Read role directly on every render — getSession() is just a localStorage read,
  // safe in "use client" components (always runs in the browser after hydration).
  const role: Role | null = (typeof window !== "undefined" ? getSession()?.role : null) ?? null;

  const mine = role ? notifications.filter((n) => n.targetRoles.includes(role)) : [];

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-[#90bce0] transition hover:bg-[#1a3a6e]/30">
        <Bell size={19} />
        {mine.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#e8a020] text-[10px] font-bold text-[#020b1e]">
            {mine.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[#1a3a6e]/50 bg-[#060f26] shadow-lg">
            <div className="border-b border-[#1a3a6e]/50 px-4 py-3 text-sm font-semibold text-[#ddeeff]">
              Notifications {role && <span className="ml-2 text-xs font-normal text-[#5a8fc4]">({role})</span>}
            </div>
            {mine.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[#3a6a9a]">You&apos;re all caught up.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {mine.map((n) => (
                  <div key={n.id} className="flex items-start justify-between gap-2 border-b border-[#1a3a6e]/40 px-4 py-3 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-[#ddeeff]">{n.productName}</p>
                      <p className="mt-0.5 text-xs text-[#90bce0]">{n.message}</p>
                    </div>
                    <button onClick={() => dismissNotification(n.id)} className="shrink-0 text-xs text-[#3a6a9a] hover:text-[#ddeeff]">✕</button>
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
