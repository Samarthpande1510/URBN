"use client";

import { ReactNode, useEffect, useState } from "react";
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
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 15);

  function fmtTime(ts: string) {
    const d = new Date(ts);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  return (
    <aside className="hidden 2xl:flex w-72 shrink-0 flex-col border-l border-[#1a3a6e]/40 bg-[#010916]/85 backdrop-blur-sm h-screen sticky top-0 overflow-hidden">
      <div className="border-b border-[#1a3a6e]/40 px-5 py-4">
        <p className="text-xs font-normal uppercase tracking-widest text-[#5a8fc4]">Activity</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0">
        {entries.length === 0 && (
          <p className="text-xs text-[#3a5a8a] mt-4">No activity yet.</p>
        )}
        {entries.map((e, i) => (
          <div key={i} className="py-3 border-b border-[#1a3a6e]/20 last:border-0">
            <p className="text-xs font-medium text-[#ddeeff] leading-snug">{e.action}</p>
            <p className="mt-0.5 text-[11px] text-[#38bdf8]">{e.productName}</p>
            <p className="mt-0.5 text-[10px] text-[#3a5a8a] tabular-nums">{fmtTime(e.timestamp)}</p>
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-y-auto bg-[#020b1e]/60">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 flex-1">{children}</main>
      </div>
      <ActivityFeed />
    </div>
  );
}
