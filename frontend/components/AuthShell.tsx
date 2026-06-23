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
        {/* Background image */}
        <div className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "url(/auth-bg.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0 bg-[#020b1e]/30" />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <Image src="/logo.png" alt="URBN" width={40} height={40} className="rounded-xl" />
          <span className="text-lg font-bold tracking-wide text-white">URBN</span>
        </div>

        {/* Bottom copy */}
        <div className="relative z-10">
          <h2 className="text-2xl font-semibold text-white">URBN</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            Simplify tracking.<br />
            Every decision, logged and visible.
          </p>

          {/* Progress demo strip */}
          <div className="mt-10 flex gap-2">
            {["Order", "Details", "Compliance", "Packaging", "Golden"].map((label, i) => (
              <div key={label} className="flex-1">
                <div className={`h-1 rounded-full ${i < 3 ? "bg-[#5b9eff]" : "bg-white/10"}`} />
                <p className="mt-1.5 text-[10px] text-white/30 truncate">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-20">

        {/* Mobile logo */}
        <div className="mb-10 flex items-center gap-3 lg:hidden">
          <Image src="/logo.png" alt="URBN" width={36} height={36} className="rounded-xl" />
          <span className="text-base font-bold text-white">URBN</span>
        </div>

        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold text-white">{title}</h1>
          <p className="mt-2 text-sm text-[#90bce0]">{subtitle}</p>

          <div className="mt-10">{children}</div>

          <p className="mt-8 text-sm text-[#5a8fc4]">{footer}</p>
        </div>
      </div>

    </div>
  );
}
