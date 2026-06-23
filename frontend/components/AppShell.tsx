"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { getSession } from "@/lib/auth";

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
      <div className="relative flex flex-1 flex-col overflow-y-auto">
        {/* blurred background — scoped to this panel only */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "url(/app-bg.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(8px) brightness(0.5) saturate(1.2)",
              transform: "scale(1.05)",
            }}
          />
          <div className="absolute inset-0 bg-[#020b1e]/60" />
        </div>
        {/* content */}
        <div className="relative z-10 flex flex-1 flex-col">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}