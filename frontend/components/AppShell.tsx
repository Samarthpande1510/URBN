"use client";

import { ReactNode, useEffect, useState } from "react";
import { parseServerDate } from "@/lib/datetime";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { getSession } from "@/lib/auth";
import { useProducts } from "@/lib/products-context";

function ActivityFeed() {
  const { products } = useProducts();

  const entries = products
    .flatMap((p) =>
      p.activityLog.map((e) => ({ ...e, productName: p.codeName }))
    )
    .sort((a, b) => parseServerDate(b.timestamp).getTime() - parseServerDate(a.timestamp).getTime())
    .slice(0, 15);

  function fmtTime(ts: string) {
    const d = parseServerDate(ts);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  }

  return (
    <aside className="hidden 2xl:flex w-72 shrink-0 flex-col border-l border-blue-100 bg-white/70 backdrop-blur-sm h-screen sticky top-0 overflow-hidden">
      <div className="border-b border-blue-100 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Activity</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0">
        {entries.length === 0 && (
          <p className="text-xs text-slate-400 mt-4">No activity yet.</p>
        )}
        {entries.map((e, i) => (
          <div key={i} className="py-3 border-b border-blue-50 last:border-0">
            <p className="text-xs font-medium text-slate-700 leading-snug">{e.action}</p>
            <p className="mt-0.5 text-[11px] text-blue-500">{e.productName}</p>
            <p className="mt-0.5 text-[10px] text-slate-400 tabular-nums">{fmtTime(e.timestamp)}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!getSession()) {
      router.push("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex h-screen min-w-0 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-transparent">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 flex-1 min-w-0">{children}</main>
      </div>
      <ActivityFeed />
    </div>
  );
}
