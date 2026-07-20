"use client";

import { useState, useEffect } from "react";
import { parseServerDate } from "@/lib/datetime";
import { Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useProducts, ProductRow } from "@/lib/products-context";
import { api, apiErrorMessage } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { getSession, Session } from "@/lib/auth";

const STAGE_PILL_STYLE: Record<string, string> = {
  "NPD TESTING: PENDING":    "bg-[#eff6ff] text-[#64748b] border-[#bfdbfe]/60",
  "NPD TESTING: PASS":       "bg-green-500/15 text-green-400 border-green-500/30",
  "NPD TESTING: FAIL":       "bg-red-500/15 text-red-400 border-red-500/30",
  "EMAILED TO FACTORY":      "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "IMPROVEMENT REQUIREMENT": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "GOLDEN SAMPLES PENDING":  "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "ORDER PENDING":           "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "REVISED SAMPLE REQUESTED":"bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "REVISED SAMPLE PENDING":  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "REVISED SAMPLE RECEIVED": "bg-[#eff6ff] text-[#0ea5e9] border-[#0ea5e9]/25",
  "REVISED TESTING: PENDING":"bg-orange-500/10 text-orange-400 border-orange-500/25",
  "REVISED TESTING: PASS":   "bg-green-500/15 text-green-400 border-green-500/30",
  "REVISED TESTING: FAIL":   "bg-red-500/15 text-red-400 border-red-500/30",
  "FACTORY DENIED IMPROVEMENT":"bg-red-500/10 text-red-400 border-red-500/25",
  "PRODUCT DROPPED":         "bg-red-900/20 text-red-500 border-red-800/40",
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
};
const DEFAULT_PILL = "bg-[#eff6ff] text-[#64748b] border-[#bfdbfe]/60";

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
    if (!sampleReceived) { stages.push("REVISED SAMPLE PENDING"); }
    else if (p.npdReport && v > 1) { stages.push("REVISED SAMPLE RECEIVED"); stages.push(p.npdReport.outcome === "Pass" ? "REVISED TESTING: PASS" : "REVISED TESTING: FAIL"); }
    else { stages.push("REVISED SAMPLE RECEIVED"); }
    return stages;
  }

  if (v > 1 && fc && p.status === "Pending NPD") {
    stages.push("EMAILED TO FACTORY");
    stages.push("REVISED SAMPLE REQUESTED");
    stages.push("REVISED SAMPLE RECEIVED");
    stages.push("REVISED TESTING: PENDING");
    return stages;
  }

  if (p.status === "Approved" || p.status === "Pending NPD" || p.status === "Pending Decision") {
    if (fc?.replyReceivedAt) { stages.push("EMAILED TO FACTORY"); stages.push("REVISED SAMPLE REQUESTED"); stages.push("REVISED SAMPLE RECEIVED"); }
    if (!gw?.purchaseNotifiedAt) { stages.push(p.status === "Pending Decision" ? "DECISION PENDING" : "ORDER PENDING"); return stages; }
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

  return stages.length > 0 ? stages : ["NPD TESTING: PENDING"];
}

function RemarkBlock({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div className={`rounded border px-3 py-2 ${color}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mb-0.5">{label}</p>
      <p className="text-xs italic leading-snug break-words">"{text}"</p>
    </div>
  );
}

export default function ArchivedPage() {
  const { products, deleteProduct, addNotification, refreshProducts, search } = useProducts();
  const { showToast } = useToast();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [restoreId, setRestoreId] = useState<number | null>(null);
  const [restoreRemarks, setRestoreRemarks] = useState("");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => { setSession(getSession()); }, []);
  const isCEO = session?.role === "CEO";

  const q = search.toLowerCase();
  const archived = products.filter((p) => {
    if (p.status !== "Archived") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });

  function openRestore(id: number) {
    setRestoreId(id);
    setRestoreRemarks("");
    setConfirmId(null);
  }

  async function handleRestore(p: ProductRow) {
    try {
      await api.products.moveToHold(p.id, restoreRemarks || undefined, p.version);
      await refreshProducts();
      addNotification({ targetRoles: ["CEO", "Dev"], productId: p.id, productName: p.codeName, message: `${p.codeName} restored from archive to On Hold.` });
      showToast(`${p.codeName} restored to On Hold`);
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    }
    setRestoreId(null);
    setRestoreRemarks("");
  }

  function handleDelete(p: ProductRow) {
    deleteProduct(p.id);
    setConfirmId(null);
    showToast(`${p.codeName} permanently deleted`);
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Archived</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">
        Products confirmed by the CEO for archiving. These are out of the pipeline for good.
      </p>
      <p className="mt-1 text-xs text-[#94a3b8]">
        {isCEO
          ? "As CEO, you can restore a product back into the pipeline or permanently delete it."
          : "Only the CEO can permanently delete archived products. You can view records here."}
      </p>

      <div className="mt-6">
        {archived.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#bfdbfe]/40 px-5 py-16 text-center">
            <p className="text-sm text-[#64748b]">No archived products.</p>
            <p className="mt-1 text-xs text-[#94a3b8]">Products appear here after the CEO confirms rejection.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {archived.map((p) => {
              const remarks: { label: string; text: string; color: string }[] = [];
              if (p.npdReport?.notes) remarks.push({ label: "QA observations", text: p.npdReport.notes, color: "border-blue-400/30 bg-blue-400/5 text-blue-700" });
              if (p.verdictRemarks) remarks.push({ label: "Decision Pending feedback", text: p.verdictRemarks, color: "border-amber-400/30 bg-amber-400/5 text-amber-700" });
              if (p.orderDecision?.remarks) remarks.push({ label: `Order ${p.orderDecision.state} — remarks`, text: p.orderDecision.remarks, color: "border-[#93c5fd]/30 bg-[#eff6ff] text-[#1d4ed8]" });
              if (p.orderDecision?.improvementNotes) remarks.push({ label: "Improvement sample requirement", text: p.orderDecision.improvementNotes, color: "border-purple-400/30 bg-purple-400/5 text-purple-700" });
              if ((p.rejectionComments ?? []).length > 0) {
                p.rejectionComments!.forEach((c) => remarks.push({ label: `Rejection note — ${c.by}`, text: c.reason, color: "border-red-400/30 bg-red-400/5 text-red-700" }));
              }
              if (p.archiveRemarks) remarks.push({ label: "Archive reason", text: p.archiveRemarks, color: "border-slate-400/30 bg-slate-50 text-slate-700" });

              return (
                <div key={p.id} className="rounded-md border border-[#bfdbfe]/30 bg-white overflow-hidden">
                  <div className="flex flex-wrap items-start gap-4 px-5 py-4">
                    {/* Image */}
                    {p.imageDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageDataUrl} alt={p.codeName} className="h-14 w-14 rounded-md object-cover border border-[#bfdbfe]/40 shrink-0" />
                    ) : (
                      <div className="h-14 w-14 rounded-md border border-[#bfdbfe]/30 bg-[#eff6ff] flex items-center justify-center text-[10px] font-semibold text-[#2a4a6a] select-none shrink-0">
                        {p.codeName.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{p.codeName}</p>
                        <span className="text-[10px] font-mono bg-[#eff6ff] border border-[#93c5fd]/30 text-[#3b82f6] px-1.5 py-0.5 rounded">{p.skuCode}</span>
                        <span className="text-[10px] bg-red-500/10 border border-red-500/25 text-red-400 px-1.5 py-0.5 rounded">ARCHIVED</span>
                      </div>
                      <p className="mt-0.5 text-xs text-[#94a3b8]">
                        {p.factory && <span>{p.factory}</span>}
                        {p.rejectedBy && <span> · Rejected by <span className="text-[#64748b]">{p.rejectedBy}</span></span>}
                        {p.statusChangedAt && <span> · Archived {parseServerDate(p.statusChangedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })}</span>}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {getPipelineTrail(p).map((s, i) => (
                          <span key={i} className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium leading-tight whitespace-nowrap ${STAGE_PILL_STYLE[s] ?? DEFAULT_PILL}`}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2 self-start">
                      <button
                        onClick={() => openRestore(p.id)}
                        className={`rounded border px-3 py-1.5 text-xs font-medium transition ${restoreId === p.id ? "border-amber-500 bg-amber-500/20 text-amber-500" : "border-[#93c5fd]/40 text-[#1d4ed8] hover:bg-[#eff6ff]"}`}
                      >
                        → On Hold
                      </button>
                      {isCEO && (
                        <button
                          onClick={() => { setConfirmId(p.id); setRestoreId(null); }}
                          className="flex items-center gap-1.5 rounded border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Remarks trail */}
                  {remarks.length > 0 && (
                    <div className="border-t border-[#bfdbfe]/20 px-5 py-3 space-y-2 bg-slate-50/60">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Remarks trail</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {remarks.map((r, i) => (
                          <RemarkBlock key={i} label={r.label} text={r.text} color={r.color} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Restore to On Hold panel */}
                  {restoreId === p.id && (
                    <div className="border-t border-amber-500/20 bg-amber-500/5 px-5 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-500 mb-2">Restore to On Hold — add remarks</p>
                      <textarea
                        value={restoreRemarks}
                        onChange={(e) => setRestoreRemarks(e.target.value)}
                        placeholder="Optional remarks about why this is being restored…"
                        rows={2}
                        className="w-full rounded-md border border-amber-500/30 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-amber-400 placeholder:text-[#94a3b8] resize-none"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handleRestore(p)}
                          className="rounded-md border border-amber-500/40 bg-amber-500/20 px-4 py-1.5 text-xs font-semibold text-amber-500 hover:bg-amber-500/30 transition"
                        >
                          Confirm → On Hold
                        </button>
                        <button
                          onClick={() => { setRestoreId(null); setRestoreRemarks(""); }}
                          className="rounded-md border border-[#bfdbfe]/50 px-4 py-1.5 text-xs text-[#64748b] hover:bg-[#eff6ff] transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Delete confirmation */}
                  {confirmId === p.id && (
                    <div className="border-t border-red-500/20 bg-red-500/5 px-5 py-3 flex flex-wrap items-center gap-3">
                      <p className="flex-1 min-w-0 text-xs text-red-300">
                        Permanently delete <span className="font-semibold">{p.codeName}</span>? This cannot be undone.
                      </p>
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => setConfirmId(null)} className="rounded border border-[#bfdbfe]/50 bg-white px-3 py-1.5 text-xs text-[#1d4ed8] hover:bg-[#eff6ff]">Cancel</button>
                        <button onClick={() => handleDelete(p)} className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">Yes, delete permanently</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {archived.length > 0 && (
        <p className="mt-6 text-xs text-[#2a4a6a]">
          {archived.length} archived {archived.length === 1 ? "product" : "products"}
          {!isCEO && " · Only the CEO can permanently delete records"}
        </p>
      )}
    </AppShell>
  );
}
