"use client";

import { AppShell } from "@/components/AppShell";
import { OnHoldBody } from "@/components/order/OnHoldBody";

export default function OnHoldPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">On Hold</h1>
      <OnHoldBody />
    </AppShell>
  );
}
