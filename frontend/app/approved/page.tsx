"use client";

import { AppShell } from "@/components/AppShell";
import { ApprovedBody } from "@/components/order/ApprovedBody";

export default function ApprovedPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Approved</h1>
      <ApprovedBody />
    </AppShell>
  );
}
