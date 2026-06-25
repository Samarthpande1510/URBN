"use client";

import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useProducts, ProductRow, Status } from "@/lib/products-context";

const STAGE_PILL_STYLE: Record<string, string> = {
  "NPD TESTING: PENDING":    "bg-[#eff6ff] text-[#64748b] border-[#bfdbfe]/60",
  "NPD TESTING: PASS":       "bg-green-500/15 text-green-400 border-green-500/30",
  "NPD TESTING: FAIL":       "bg-red-500/15 text-red-400 border-red-500/30",
  "EMAILED TO FACTORY":      "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "IMPROVEMENT REQUIREMENT": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "GOLDEN SAMPLES PENDING":  "bg-purple-500/10 text-purple-400 border-purple-500/25",
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
  for (const entry of p.activityLog) {
    if (entry.stages) stages.push(...entry.stages);
  }
  if (stages.length === 0) stages.push("NPD TESTING: PENDING");
  return stages;
}
import { useToast } from "@/components/Toast";
import { getSession, Session } from "@/lib/auth";

export default function ArchivedPage() {
  const { products, setProducts, deleteProduct, addNotification, search } = useProducts();
  const { showToast } = useToast();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => { setSession(getSession()); }, []);
  const isCEO = session?.role === "CEO";

  const q = search.toLowerCase();
  const archived = products.filter((p) => {
    if (p.status !== "Archived") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });

  function handleRestore(p: ProductRow) {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      status: "Pending NPD" as Status,
      statusChangedAt: now,
      factoryComm: undefined,
      activityLog: [...x.activityLog, { action: "Restored to Pending NPD from archive", timestamp: now }],
    }));
    addNotification({ targetRoles: ["CEO", "Dev"], productId: p.id, productName: p.codeName, message: "Product restored to Pending NPD from archive." });
    showToast(`${p.codeName} restored`);
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
          <div className="space-y-2">
            {archived.map((p) => (
              <div key={p.id} className="rounded-md border border-[#bfdbfe]/30 bg-[#ffffff] overflow-hidden">

                <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#1d4ed8]">{p.codeName}</p>
                    <p className="mt-0.5 text-xs text-[#94a3b8]">
                      {p.skuCode}
                      {p.factory ? ` · ${p.factory}` : ""}
                      {p.statusChangedAt ? ` · Archived ${new Date(p.statusChangedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                    </p>
                    {p.rejectedBy && (
                      <p className="mt-0.5 text-xs text-[#94a3b8]">Rejected by <span className="text-[#64748b]">{p.rejectedBy}</span></p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {getPipelineTrail(p).map((s, i) => (
                        <span key={i} className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium leading-tight whitespace-nowrap ${STAGE_PILL_STYLE[s] ?? DEFAULT_PILL}`}>
                          {s}
                        </span>
                      ))}
                    </div>
                    {p.npdReport?.notes && (
                      <p className="mt-1 text-xs text-[#94a3b8] italic">QA note: {p.npdReport.notes}</p>
                    )}
                    {p.rejectionComments && p.rejectionComments.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {p.rejectionComments.map((c, i) => (
                          <p key={i} className="text-xs text-[#94a3b8]">
                            <span className="text-[#64748b]">{c.by}:</span> {c.reason}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handleRestore(p)}
                      className="rounded border border-[#93c5fd]/40 px-3 py-1.5 text-xs font-medium text-[#1d4ed8] transition hover:bg-[#2563eb]/30 hover:text-[#0f172a]"
                    >
                      Restore
                    </button>
                    {isCEO && (
                      <button
                        onClick={() => setConfirmId(p.id)}
                        className="flex items-center gap-1.5 rounded border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {confirmId === p.id && (
                  <div className="border-t border-red-500/20 bg-red-500/5 px-5 py-3 flex flex-wrap items-center gap-3">
                    <p className="flex-1 min-w-0 text-xs text-red-300">
                      Permanently delete <span className="font-semibold">{p.codeName}</span>? This cannot be undone.
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => setConfirmId(null)} className="rounded border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-1.5 text-xs text-[#1d4ed8] hover:bg-[#eff6ff]">Cancel</button>
                      <button onClick={() => handleDelete(p)} className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">Yes, delete permanently</button>
                    </div>
                  </div>
                )}

              </div>
            ))}
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
