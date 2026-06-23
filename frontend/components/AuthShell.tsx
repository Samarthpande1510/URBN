import { ReactNode } from "react";
import Image from "next/image";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full bg-[#020b1e]">

      {/* ── Left panel — decorative ── */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between overflow-hidden p-12">
        <div className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "url(/auth-bg.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0 bg-[#020b1e]/40" />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <Image src="/logo.png" alt="URBN" width={36} height={36} className="rounded-lg" />
          <span className="text-base font-semibold tracking-wide text-white">URBN</span>
        </div>

        {/* Bottom copy */}
        <div className="relative z-10">
          <h2 className="text-2xl font-semibold text-white">Product lifecycle made simple.</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Know where every product stands, who made each call, and what comes next. No chasing updates, no missed decisions, no confusion on the floor.
          </p>

        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-[#0a0a0a] px-4 py-12 sm:px-8">

        {/* Card */}
        <div className="w-full max-w-[400px]">

          {/* Logo — visible on mobile and inside card */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Image src="/logo.png" alt="URBN" width={32} height={32} className="rounded-lg" />
            <span className="text-sm font-semibold text-white">URBN</span>
          </div>

          <div className="rounded-lg border border-white/8 bg-[#141414] px-8 py-8 shadow-2xl shadow-black/60">

            {/* Card header */}
            <div className="mb-6">
              <div className="hidden lg:flex mb-6 items-center gap-2">
                <Image src="/logo.png" alt="URBN" width={28} height={28} className="rounded-md" />
                <span className="text-sm font-semibold text-white">URBN</span>
              </div>
              <h1 className="text-xl font-semibold text-white">{title}</h1>
              <p className="mt-1 text-sm text-[#6b6b6b]">{subtitle}</p>
            </div>

            <div className="border-t border-white/8 pt-6">
              {children}
            </div>

          </div>

          {/* Footer link outside card */}
          <p className="mt-5 text-center text-sm text-[#4a4a4a]">{footer}</p>

          {/* Fine print */}
          <p className="mt-8 text-center text-[11px] text-[#333333]">
            By continuing, you agree to URBN&apos;s internal use policy.
          </p>
        </div>

      </div>

    </div>
  );
}
