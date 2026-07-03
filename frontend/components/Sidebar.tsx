"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FlaskConical, ClipboardList, FileCheck2, PauseCircle, Award, Bell, Archive, PackageX, LogOut, X } from "lucide-react";
import { logout, getSession } from "@/lib/auth";
import type { Role, Session } from "@/lib/auth";
import { useProducts } from "@/lib/products-context";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/dashboard",          label: "Dashboard",          icon: LayoutDashboard },
  { href: "/npd-testing",        label: "NPD Testing",        icon: FlaskConical },
  { href: "/decision-pending",   label: "Decision Pending",   icon: ClipboardList },
  { href: "/order-confirmation", label: "Order Confirmation", icon: FileCheck2 },
  { href: "/hold-insights",      label: "Hold",                icon: PauseCircle },
  { href: "/golden-product",     label: "Golden Sample",      icon: Award },
  { href: "/notifications",      label: "Notifications",      icon: Bell },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { notifications } = useProducts();
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => { setRole(getSession()?.role ?? null); }, []);
  const unreadCount = role ? notifications.filter((n) => n.targetRoles.includes(role) && !n.read).length : 0;

  async function handleSignOut() {
    await logout();
    router.push("/login");
  }

  const navContent = (
    <>
      <div>
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Logo" width={28} height={28} className="rounded-md" />
            <span className="text-base font-semibold text-white">URBN</span>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white md:hidden">
            <X size={20} />
          </button>
        </div>
        <nav className="mt-8 space-y-0.5">
          {LINKS.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-white/15 text-white font-medium"
                    : "text-blue-100/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={17} />
                <span className="flex-1">{link.label}</span>
                {link.href === "/notifications" && unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-0.5">
        <div className="h-px bg-white/10 mb-2" />
        <Link
          href="/archived"
          onClick={onClose}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
            pathname === "/archived" ? "bg-white/15 text-white font-medium" : "text-blue-100/80 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Archive size={17} />
          Archived
        </Link>
        <Link
          href="/order-archive"
          onClick={onClose}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
            pathname === "/order-archive" ? "bg-white/15 text-white font-medium" : "text-blue-100/80 hover:bg-white/10 hover:text-white"
          }`}
        >
          <PackageX size={17} />
          Order Archive
        </Link>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-blue-100/70 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden h-screen w-60 shrink-0 flex-col justify-between bg-gradient-to-b from-blue-700 to-blue-900 px-4 py-6 md:flex shadow-xl shadow-blue-900/20">
        {navContent}
      </aside>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-blue-950/40 backdrop-blur-sm" onClick={onClose} />
          <aside className="absolute left-0 top-0 flex h-screen w-60 flex-col justify-between bg-gradient-to-b from-blue-700 to-blue-900 px-4 py-6 shadow-xl">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
