"use client";

import { AppShell } from "@/components/AppShell";
import { RejectedBody } from "@/components/order/RejectedBody";

export default function RejectedPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Rejected</h1>
      <RejectedBody />
    </AppShell>
  );
}
