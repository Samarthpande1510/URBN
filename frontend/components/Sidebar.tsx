"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FlaskConical, Award, LogOut, X } from "lucide-react";
import { logout } from "@/lib/auth";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/npd-testing", label: "NPD Testing", icon: FlaskConical },
  { href: "/golden-product", label: "Golden Product", icon: Award },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  function handleSignOut() {
    logout();
    router.push("/login");
  }

  const navContent = (
    <>
      <div>
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Logo" width={28} height={28} className="rounded-md" />
            <span className="text-base font-semibold text-[#ddeeff]">URBN</span>
          </div>
          <button onClick={onClose} className="text-[#90bce0] hover:text-[#ddeeff] md:hidden">
            <X size={20} />
          </button>
        </div>
        <nav className="mt-8 space-y-1">
          {LINKS.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active ? "bg-[#1a4a8a]/50 text-[#ddeeff] border border-[#2a6aaa]/40" : "text-[#90bce0] hover:bg-[#1a3a6e]/30 hover:text-[#ddeeff]"
                }`}
              >
                <Icon size={17} />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <button
        onClick={handleSignOut}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#90bce0] transition hover:bg-[#1a3a6e]/30 hover:text-[#ddeeff]"
      >
        <LogOut size={17} />
        Sign out
      </button>
    </>
  );

  return (
    <>
      <aside className="hidden h-screen w-60 shrink-0 flex-col justify-between bg-gradient-to-b from-[#050e24] to-[#071428] px-4 py-6 md:flex border-r border-[#1a3a6e]/40">
        {navContent}
      </aside>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <aside className="absolute left-0 top-0 flex h-screen w-60 flex-col justify-between bg-gradient-to-b from-[#050e24] to-[#071428] px-4 py-6 shadow-xl border-r border-[#1a3a6e]/40">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}