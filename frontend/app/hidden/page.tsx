"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useProducts, ProductRow } from "@/lib/products-context";
import { api, apiErrorMessage } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { PRIORITY_DOT, STATUS_DOT } from "@/lib/colors";
import { Chip } from "@/components/Chip";
import { EyeOff, Eye } from "lucide-react";

// Mirrors the dashboard's pill styles + pipeline trail so hidden rows look identical.
const STAGE_PILL_STYLE: Record<string, string> = {
  "NPD TESTING: PENDING":    "bg-[#eff6ff] text-[#64748b] border-[#bfdbfe]/60",
  "NPD TESTING: PASS":       "bg-green-500/15 text-green-400 border-green-500/30",
  "NPD TESTING: FAIL":       "bg-red-500/15 text-red-400 border-red-500/30",
  "EMAILED TO FACTORY":      "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "DECISION PENDING":        "bg-amber-500/10 text-amber-500 border-amber-500/30",
  "GOLDEN SAMPLES PENDING":  "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "ORDER PENDING":           "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "REVISED SAMPLE REQUESTED":"bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "REVISED SAMPLE PENDING":  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "REVISED SAMPLE RECEIVED": "bg-[#eff6ff] text-[#0ea5e9] border-[#0ea5e9]/25",
  "REVISED TESTING: PENDING":"bg-orange-500/10 text-orange-400 border-orange-500/25",
  "REVISED TESTING: PASS":   "bg-green-500/15 text-green-400 border-green-500/30",
  "REVISED TESTING: FAIL":   "bg-red-500/15 text-red-400 border-red-500/30",
  "REJECTED":                "bg-red-500/10 text-red-400 border-red-500/25",
  "PURCHASE TEAM NOTIFIED":  "bg-[#eff6ff] text-[#0ea5e9] border-[#0ea5e9]/25",
  "ORDER CONFIRMED":         "bg-[#eff6ff] text-[#0ea5e9] border-[#0ea5e9]/40",
  "PRODUCT DETAILS SAVED":   "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "BOM CONFIRMED":           "bg-purple-500/15 text-purple-300 border-purple-500/35",
  "COMPLIANCE INITIATED":    "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "COMPLIANCE CONFIRMED":    "bg-green-500/15 text-green-400 border-green-500/30",
  "PACKAGING INITIATED":     "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "PACKAGING RELEASED":      "bg-green-500/10 text-green-300 border-green-500/25",
  "GOLDEN SAMPLE TRACKING STARTED": "bg-amber-500/10 text-amber-400 border-amber-500/25",
  "GOLDEN SAMPLE RECEIVED":  "bg-green-500/20 text-green-300 border-green-400/40",
  "ORDER PLACED":            "bg-green-500/15 text-green-400 border-green-500/30",
  "ORDER HELD":              "bg-amber-500/10 text-amber-400 border-amber-500/25",
  "ORDER DROPPED":           "bg-red-500/10 text-red-400 border-red-500/25",
};
const DEFAULT_PILL = "bg-[#eff6ff] text-[#64748b] border-[#bfdbfe]/60";

function StagePills({ stages }: { stages: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {stages.map((s, i) => (
        <span key={i} className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium leading-tight whitespace-nowrap ${STAGE_PILL_STYLE[s] ?? DEFAULT_PILL}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

function getPipelineTrail(p: ProductRow): string[] {
  const stages: string[] = [];
  const fc = p.factoryComm;
  const gw = p.goldenWorkflow;
  const od = p.orderDecision;
  const v = p.sampleVersion ?? 1;

  if (!p.npdReport) { stages.push("NPD TESTING: PENDING"); return stages; }
  stages.push(p.npdReport.outcome === "Pass" ? "NPD TESTING: PASS" : "NPD TESTING: FAIL");

  if (p.status === "Rejected" || p.status === "Archived") { stages.push("REJECTED"); return stages; }

  if (p.status === "On hold" || (v > 1 && fc && !gw)) {
    stages.push("EMAILED TO FACTORY");
    stages.push("REVISED SAMPLE REQUESTED");
    const sampleReceived = !!fc?.improvementSampleReceivedAt;
    if (!sampleReceived) stages.push("REVISED SAMPLE PENDING");
    else if (p.npdReport && v > 1) {
      stages.push("REVISED SAMPLE RECEIVED");
      stages.push(p.npdReport.outcome === "Pass" ? "REVISED TESTING: PASS" : "REVISED TESTING: FAIL");
    } else stages.push("REVISED SAMPLE RECEIVED");
    return stages;
  }

  if (v > 1 && fc && p.status === "Pending NPD") {
    stages.push("EMAILED TO FACTORY", "REVISED SAMPLE REQUESTED", "REVISED SAMPLE RECEIVED", "REVISED TESTING: PENDING");
    return stages;
  }

  if (p.status === "Approved" || p.status === "Pending NPD" || p.status === "Pending Decision") {
    if (fc?.replyReceivedAt) stages.push("EMAILED TO FACTORY", "REVISED SAMPLE REQUESTED", "REVISED SAMPLE RECEIVED");
    if (!gw?.purchaseNotifiedAt) {
      stages.push(p.status === "Pending Decision" ? "DECISION PENDING" : "ORDER PENDING");
      return stages;
    }
    stages.push("PURCHASE TEAM NOTIFIED");
    if (gw.orderConfirmedAt) stages.push("ORDER CONFIRMED");
    if (gw.details) stages.push("PRODUCT DETAILS SAVED");
    if (gw.details?.bomConfirmedAt) stages.push("BOM CONFIRMED");
    const compTracks = gw.compliance?.tracks ?? [];
    if (compTracks.length > 0) stages.push(compTracks.every((t) => t.confirmedAt) ? "COMPLIANCE CONFIRMED" : "COMPLIANCE INITIATED");
    if (gw.packaging?.kldEmailedToDesignerAt) stages.push("PACKAGING RELEASED");
    else if (gw.packaging) stages.push("PACKAGING INITIATED");
    const gs = gw.goldenSample;
    if (gs?.status === "Received") stages.push("GOLDEN SAMPLE RECEIVED");
    else if (gs?.status === "In progress" || gs?.status === "Requested") stages.push("GOLDEN SAMPLE TRACKING STARTED");
    if (od?.state === "placed") stages.push("ORDER PLACED");
    else if (od?.state === "held") stages.push("ORDER HELD");
    else if (od?.state === "dropped") stages.push("ORDER DROPPED");
    return stages;
  }

  return stages.length ? stages : ["NPD TESTING: PENDING"];
}

export default function HiddenPage() {
  const { products, refreshProducts, search } = useProducts();
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  const q = search.toLowerCase();
  const hiddenProducts = products.filter((p) => {
    if (!p.hidden) return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });

  async function unhide(p: ProductRow) {
    setBusyId(p.id);
    try {
      await api.products.unhide(p.id, p.version);
      await refreshProducts();
      showToast(`${p.codeName} restored to dashboard`);
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Hidden</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">
        Completed products hidden from the dashboard. Nothing is deleted — restore any product back to the dashboard anytime.
      </p>

      <div className="mt-6 rounded-lg border border-[#bfdbfe]/50 bg-white overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#bfdbfe]/40 text-[#0f172a]">
              <th className="pl-4 pr-2 py-3 w-14" />
              <th className="px-4 py-3 font-medium">Product Name</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Current Status</th>
              <th className="px-4 py-3 font-medium">Product Stages</th>
              <th className="px-4 py-3 font-medium w-32" />
            </tr>
          </thead>
          <tbody>
            {hiddenProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <EyeOff size={26} className="mx-auto mb-3 text-[#bfdbfe]" />
                  <p className="text-sm text-[#64748b]">No hidden products.</p>
                  <p className="mt-1 text-xs text-[#94a3b8]">Use the Hide button on completed products in the dashboard to declutter it.</p>
                </td>
              </tr>
            ) : (
              hiddenProducts.map((p) => (
                <tr key={p.id} className="border-b border-[#bfdbfe]/20 last:border-0">
                  <td className="pl-4 pr-2 py-3">
                    {p.imageDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageDataUrl} alt={p.codeName} className="h-12 w-12 rounded-md object-cover border border-[#bfdbfe]/40" />
                    ) : (
                      <div className="h-12 w-12 rounded-md border border-[#bfdbfe]/30 bg-[#eff6ff] flex items-center justify-center text-[10px] font-semibold text-[#2a4a6a] select-none">
                        {p.codeName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900 leading-snug flex items-center gap-1.5">
                      {p.codeName}
                      {(p.sampleVersion ?? 1) > 1 && (
                        <span className="rounded border border-purple-400/40 bg-purple-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-500">v{p.sampleVersion}</span>
                      )}
                    </p>
                    <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Chip color={STATUS_DOT[p.status]} label={p.status} />
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <StagePills stages={getPipelineTrail(p)} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => unhide(p)}
                      disabled={busyId === p.id}
                      className="flex items-center gap-1.5 rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#1d4ed8] hover:bg-[#dbeafe] transition whitespace-nowrap disabled:opacity-50"
                    >
                      <Eye size={13} />
                      {busyId === p.id ? "Restoring…" : "Unhide"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hiddenProducts.length > 0 && (
        <p className="mt-3 text-xs text-[#94a3b8]">{hiddenProducts.length} hidden product{hiddenProducts.length !== 1 ? "s" : ""} — all data preserved.</p>
      )}
    </AppShell>
  );
}
