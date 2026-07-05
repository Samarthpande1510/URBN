"use client";

import { useState, useEffect } from "react";
import { useProducts, type ProductRow } from "@/lib/products-context";
import { api, apiErrorMessage } from "@/lib/api";
import { getSession, Session } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { GridBeam } from "@/components/ui/grid-beam";
import { Modal } from "@/components/Modal";
import { Plus, X } from "lucide-react";

const STAGE_PILL_STYLE: Record<string, string> = {
  "NPD TESTING: PENDING":        "bg-[#eff6ff] text-[#64748b] border-[#bfdbfe]/60",
  "NPD TESTING: PASS":           "bg-green-500/15 text-green-400 border-green-500/30",
  "NPD TESTING: FAIL":           "bg-red-500/15 text-red-400 border-red-500/30",
  "EMAILED TO FACTORY":          "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "REVISED SAMPLE REQUESTED":    "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "REVISED SAMPLE PENDING":      "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "REVISED SAMPLE RECEIVED":     "bg-green-500/10 text-green-400 border-green-500/25",
  "REVISED TESTING: PENDING":    "bg-[#eff6ff] text-[#64748b] border-[#bfdbfe]/60",
  "REVISED TESTING: PASS":       "bg-green-500/15 text-green-400 border-green-500/30",
  "REVISED TESTING: FAIL":       "bg-red-500/15 text-red-400 border-red-500/30",
  "REJECTED":                    "bg-red-500/15 text-red-400 border-red-500/30",
  "DECISION PENDING":            "bg-amber-500/10 text-amber-500 border-amber-500/30",
  "GOLDEN SAMPLES PENDING":      "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "PURCHASE TEAM NOTIFIED":      "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "ORDER CONFIRMED":             "bg-green-500/10 text-green-400 border-green-500/25",
  "PRODUCT DETAILS SAVED":       "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "BOM CONFIRMED":               "bg-purple-500/15 text-purple-300 border-purple-500/35",
  "COMPLIANCE INITIATED":        "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "COMPLIANCE CONFIRMED":        "bg-green-500/10 text-green-400 border-green-500/25",
  "PACKAGING INITIATED":         "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "PACKAGING RELEASED":          "bg-green-500/10 text-green-400 border-green-500/25",
  "GOLDEN SAMPLE TRACKING STARTED": "bg-amber-500/10 text-amber-400 border-amber-500/25",
  "GOLDEN SAMPLE RECEIVED":      "bg-green-500/10 text-green-400 border-green-500/25",
  "ORDER PLACED":                "bg-green-500/15 text-green-400 border-green-500/30",
  "ORDER HELD":                  "bg-amber-500/10 text-amber-400 border-amber-500/25",
  "ORDER DROPPED":               "bg-red-500/10 text-red-400 border-red-500/25",
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
    if (!gw?.purchaseNotifiedAt) { stages.push(p.status === "Pending Decision" ? "DECISION PENDING" : "GOLDEN SAMPLES PENDING"); return stages; }
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

function fmt(v: string | null) {
  if (!v) return null;
  return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function DeadlineBadge({ deadline }: { deadline?: string | null }) {
  if (!deadline) return null;
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0)  return <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">{Math.abs(days)}d overdue</span>;
  if (days <= 3) return <span className="rounded bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-400">{days}d left</span>;
  if (days <= 7) return <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">{days}d left</span>;
  return null;
}

type VerdictType = "place" | "hold" | "drop";
interface ColorRow { color: string; quantity: string }
interface VerdictState { productId: number; type: VerdictType; colors: ColorRow[]; remarks: string }

function PendingRow({ p, canOrder, onAction }: {
  p: ProductRow;
  canOrder: boolean;
  onAction: (id: number, type: VerdictType) => void;
}) {
  const od = p.orderDecision!;
  return (
    <tr className="border-b border-[#bfdbfe]/20">
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
          {(p.sampleVersion ?? 1) >= 1 && (
            <span className="rounded-md border border-purple-500/50 bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-600 tracking-wide">v{p.sampleVersion ?? 1} {p.status === "Approved" ? "Approved" : ""}</span>
          )}
        </p>
        <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode}</p>
        {od.improvedGoldenSampleExpected && (
          <span className="ml-1 inline-block mt-1 text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-400 px-1.5 py-0.5 rounded">Improvement req.</span>
        )}
      </td>
      <td className="px-4 py-3 w-48 space-y-1.5">
        {p.verdictRemarks && (
          <p className="text-xs text-amber-700 italic leading-snug break-words whitespace-normal">"{p.verdictRemarks}"</p>
        )}
        {p.orderDecision?.improvementNotes && (
          <div className="rounded border border-amber-400/30 bg-amber-400/5 px-2 py-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500 mb-0.5">Improvement needed</p>
            <p className="text-xs text-amber-700 italic leading-snug break-words whitespace-normal">"{p.orderDecision.improvementNotes}"</p>
          </div>
        )}
        {!p.verdictRemarks && !p.orderDecision?.improvementNotes && (
          <span className="text-xs text-[#94a3b8]">—</span>
        )}
      </td>
      <td className="px-4 py-3 w-40">
        <StagePills stages={getPipelineTrail(p)} />
      </td>
      <td className="px-4 py-3 tabular-nums text-[#d97706] whitespace-nowrap text-xs">
        {p.statusChangedAt ? fmt(p.statusChangedAt) : "—"}
      </td>
      {canOrder && (
        <td className="px-4 py-3">
          <div className="flex gap-1.5 flex-wrap">
            {([
              { key: "place" as VerdictType, label: "✓ Place Order", cls: "border-green-500/30 bg-green-500/5 text-green-500 hover:bg-green-500/15" },
              { key: "hold"  as VerdictType, label: "⏸ Hold",        cls: "border-[#bfdbfe]/50 bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe]" },
              { key: "drop"  as VerdictType, label: "✕ Drop",        cls: "border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/15" },
            ]).map(({ key, label, cls }) => (
              <button key={key} onClick={() => onAction(p.id, key)}
                className={`rounded border px-2.5 py-1 text-xs font-medium transition ${cls}`}>
                {label}
              </button>
            ))}
          </div>
        </td>
      )}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          <DeadlineBadge deadline={p.deadline} />
          <span className="tabular-nums text-[#d97706] text-xs">
            {new Date(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </td>
    </tr>
  );
}

function HeldRow({ p, canOrder, onDrop, onReinstate, onPlace }: {
  p: ProductRow;
  canOrder: boolean;
  onDrop: (id: number) => void;
  onReinstate: (p: ProductRow) => void;
  onPlace: (id: number) => void;
}) {
  const od = p.orderDecision!;
  return (
    <tr className="border-b border-amber-500/10">
      <td className="pl-4 pr-2 py-3">
        {p.imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageDataUrl} alt={p.codeName} className="h-12 w-12 rounded-md object-cover border border-amber-500/20" />
        ) : (
          <div className="h-12 w-12 rounded-md border border-amber-500/20 bg-amber-500/10 flex items-center justify-center text-[10px] font-semibold text-amber-400 select-none">
            {p.codeName.slice(0, 2).toUpperCase()}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900 leading-snug flex items-center gap-1.5">
          {p.codeName}
          {(p.sampleVersion ?? 1) >= 1 && (
            <span className="rounded-md border border-purple-500/50 bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-600 tracking-wide">v{p.sampleVersion ?? 1} {p.status === "Approved" ? "Approved" : ""}</span>
          )}
        </p>
        <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode}</p>
      </td>
      <td className="px-4 py-3 w-48 space-y-1.5">
        {p.verdictRemarks && (
          <p className="text-xs text-amber-700 italic leading-snug break-words whitespace-normal">"{p.verdictRemarks}"</p>
        )}
        {p.orderDecision?.improvementNotes && (
          <div className="rounded border border-amber-400/30 bg-amber-400/5 px-2 py-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500 mb-0.5">Improvement needed</p>
            <p className="text-xs text-amber-700 italic leading-snug break-words whitespace-normal">"{p.orderDecision.improvementNotes}"</p>
          </div>
        )}
        {!p.verdictRemarks && !p.orderDecision?.improvementNotes && (
          <span className="text-xs text-[#94a3b8]">—</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-xs text-amber-400">{od.decidedBy ?? "—"}</span>
      </td>
      <td className="px-4 py-3 w-40">
        <StagePills stages={getPipelineTrail(p)} />
      </td>
      <td className="px-4 py-3 tabular-nums text-[#d97706] whitespace-nowrap text-xs">
        {od.decidedAt ? fmt(od.decidedAt) : "—"}
      </td>
      {canOrder && (
        <td className="px-4 py-3">
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => onPlace(p.id)}
              className="rounded border border-green-500/30 bg-green-500/5 px-2.5 py-1 text-xs font-medium text-green-500 hover:bg-green-500/15 transition">
              ✓ Place Order
            </button>
            <button onClick={() => onReinstate(p)}
              className="rounded border border-[#93c5fd]/50 bg-[#eff6ff] px-2.5 py-1 text-xs font-medium text-[#1d4ed8] hover:bg-[#dbeafe] transition">
              ↺ Reinstate
            </button>
            <button onClick={() => onDrop(p.id)}
              className="rounded border border-red-500/30 bg-red-500/5 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/15 transition">
              ✕ Drop
            </button>
          </div>
        </td>
      )}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          <DeadlineBadge deadline={p.deadline} />
          <span className="tabular-nums text-[#d97706] text-xs">
            {new Date(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </td>
    </tr>
  );
}

function PlacedRow({ p }: { p: ProductRow }) {
  const od = p.orderDecision!;
  return (
    <tr className="border-b border-green-500/10">
      <td className="pl-4 pr-2 py-3">
        {p.imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageDataUrl} alt={p.codeName} className="h-12 w-12 rounded-md object-cover border border-green-500/20" />
        ) : (
          <div className="h-12 w-12 rounded-md border border-green-500/20 bg-green-500/10 flex items-center justify-center text-[10px] font-semibold text-green-500 select-none">
            {p.codeName.slice(0, 2).toUpperCase()}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900 leading-snug flex items-center gap-1.5">
          {p.codeName}
          {(p.sampleVersion ?? 1) >= 1 && (
            <span className="rounded-md border border-purple-500/50 bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-600 tracking-wide">v{p.sampleVersion ?? 1} {p.status === "Approved" ? "Approved" : ""}</span>
          )}
        </p>
        <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode}</p>
      </td>
      <td className="px-4 py-3 w-48">
        {p.verdictRemarks ? (
          <p className="text-xs text-amber-700 italic leading-snug break-words whitespace-normal">"{p.verdictRemarks}"</p>
        ) : <span className="text-xs text-[#94a3b8]">—</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {od.colors.length > 0 ? od.colors.map((c, i) => (
            <span key={i} className="rounded border border-green-500/30 bg-green-500/5 px-1.5 py-0.5 text-[10px] text-green-600">{c.color} ×{c.quantity}</span>
          )) : <span className="text-xs text-[#94a3b8]">—</span>}
        </div>
      </td>
      <td className="px-4 py-3 tabular-nums text-[#d97706] whitespace-nowrap text-xs">
        {od.decidedAt ? fmt(od.decidedAt) : "—"}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <a href="/golden-product" className="text-xs text-[#1d4ed8] hover:underline">View in Golden Sample →</a>
      </td>
    </tr>
  );
}

export type ApprovedView = "all" | "pending" | "held" | "placed";

export function ApprovedBody({ view = "all" }: { view?: ApprovedView }) {
  const { products, addNotification, refreshProducts, search } = useProducts();
  const { showToast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [modal, setModal] = useState<VerdictState | null>(null);
  useEffect(() => { setSession(getSession()); }, []);

  const canOrder = true;

  const q = search.toLowerCase();
  const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  const matchesSearch = (p: ProductRow) =>
    !q || p.codeName.toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q);

  const showPending = view === "all" || view === "pending";
  const showHeld = view === "all" || view === "held";
  const showPlaced = view === "placed";

  const visible = products
    .filter((p) => p.status === "Approved" && p.orderDecision?.state === "pending" && matchesSearch(p))
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));

  const heldOrders = products
    .filter((p) => p.status === "Approved" && p.orderDecision?.state === "held" && matchesSearch(p))
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));

  const placedOrders = products
    .filter((p) => p.status === "Approved" && p.orderDecision?.state === "placed" && matchesSearch(p))
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));

  function openModal(id: number, type: VerdictType) {
    setModal({ productId: id, type, colors: [{ color: "", quantity: "" }], remarks: "" });
  }

  function closeModal() { setModal(null); }

  async function confirmVerdict() {
    if (!modal) return;
    const p = products.find((x) => x.id === modal.productId); if (!p) return;
    const od = p.orderDecision!;

    try {
      if (modal.type === "place") {
        const validColors = modal.colors.filter((c) => c.color.trim()).map((c) => ({ color: c.color.trim(), quantity: parseInt(c.quantity) || 0 }));
        await api.products.patchOrderDecision(p.id, { state: "placed", internal_code: od.internalCode, colors: validColors }, p.version);
        await api.golden.notifyPurchase(p.id, p.version + 1);
        await api.golden.confirmOrder(p.id, p.version + 2);
        await refreshProducts();
        addNotification({ targetRoles: ["CEO", "Dev", "Sales", "QA"], productId: p.id, productName: p.codeName, message: `Order placed for ${p.codeName} — Golden Sample started.` });
        showToast("Order placed — Golden Sample started");
      } else if (modal.type === "hold") {
        await api.products.patchOrderDecision(p.id, { state: "held", internal_code: od.internalCode, remarks: modal.remarks.trim() || od.remarks }, p.version);
        await refreshProducts();
        addNotification({ targetRoles: ["CEO", "Dev"], productId: p.id, productName: p.codeName, message: `Order for ${p.codeName} put on hold.` });
        showToast("Order put on hold");
      } else {
        await api.products.patchOrderDecision(p.id, { state: "dropped", internal_code: od.internalCode, remarks: modal.remarks.trim() || od.remarks }, p.version);
        await refreshProducts();
        addNotification({ targetRoles: ["CEO", "Dev"], productId: p.id, productName: p.codeName, message: `Order for ${p.codeName} dropped.` });
        showToast("Order dropped");
      }
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    }
    closeModal();
  }

  async function reinstateOrder(p: ProductRow) {
    try {
      const od = p.orderDecision!;
      await api.products.patchOrderDecision(p.id, { state: "pending", internal_code: od.internalCode }, p.version);
      await refreshProducts();
      showToast("Order reinstated");
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    }
  }

  const modalProduct = modal ? products.find((x) => x.id === modal.productId) : null;

  return (
    <>
      {view === "all" && (
        <p className="mt-1 text-sm text-[#1d4ed8]">
          Products approved and awaiting order placement before moving to Golden Sample.
        </p>
      )}

      {/* Pending orders table */}
      {showPending && (
        <GridBeam rows={6} cols={8} colorVariant="colorful" theme="dark" active className="mt-4 overflow-hidden rounded-md border border-[#bfdbfe]/40 bg-[#ffffff]/80">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#bfdbfe]/40 text-[#0f172a]">
                  <th className="pl-4 pr-2 py-3 w-14" />
                  <th className="px-4 py-3 font-medium">
                    Product
                    <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Code name · Factory · Internal code</p>
                  </th>
                  <th className="px-4 py-3 font-medium w-48">
                    Remarks
                    <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Decision Pending feedback</p>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    Stages
                    <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Pipeline trail</p>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    Last updated
                    <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">When status changed</p>
                  </th>
                  {canOrder && (
                    <th className="px-4 py-3 font-medium">
                      Actions
                      <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Place / hold / drop</p>
                    </th>
                  )}
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">
                    Deadline
                    <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Target date</p>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={canOrder ? 7 : 6} className="px-5 py-16 text-center">
                      <p className="text-sm text-[#64748b]">No approved products awaiting order.</p>
                      <p className="mt-1 text-xs text-[#94a3b8]">Products appear here after passing Decision Pending.</p>
                    </td>
                  </tr>
                ) : (
                  visible.map((p) => (
                    <PendingRow key={p.id} p={p} canOrder={canOrder} onAction={openModal} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GridBeam>
      )}

      {/* Held orders table */}
      {showHeld && heldOrders.length > 0 && (
        <div className={view === "all" ? "mt-8" : "mt-4"}>
          {view === "all" && (
            <>
              <h2 className="text-base font-semibold text-slate-900 mb-1">Orders on Hold</h2>
              <p className="text-xs text-amber-400 mb-4">These orders were paused. Place the order, reinstate, or drop them.</p>
            </>
          )}
          <GridBeam rows={4} cols={8} colorVariant="sunset" theme="dark" active className="overflow-hidden rounded-md border border-amber-500/25 bg-[#ffffff]/80">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-amber-500/20 text-[#0f172a]">
                    <th className="pl-4 pr-2 py-3 w-14" />
                    <th className="px-4 py-3 font-medium">
                      Product
                      <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Code name · Internal code</p>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Remarks
                      <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Decision Pending feedback</p>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Held by
                      <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Who put on hold</p>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Stages
                      <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Pipeline trail</p>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Last updated
                      <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">When held</p>
                    </th>
                    {canOrder && (
                      <th className="px-4 py-3 font-medium">
                        Actions
                        <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Place / reinstate / drop</p>
                      </th>
                    )}
                    <th className="px-4 py-3 text-right font-medium whitespace-nowrap">
                      Deadline
                      <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Target date</p>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {heldOrders.map((p) => (
                    <HeldRow key={p.id} p={p} canOrder={canOrder}
                      onDrop={(id) => openModal(id, "drop")}
                      onReinstate={reinstateOrder}
                      onPlace={(id) => openModal(id, "place")} />
                  ))}
                </tbody>
              </table>
            </div>
          </GridBeam>
        </div>
      )}
      {showHeld && heldOrders.length === 0 && view === "held" && (
        <div className="mt-4 rounded-md border border-dashed border-[#bfdbfe]/50 px-5 py-16 text-center text-sm text-[#64748b]">
          No orders on hold.
        </div>
      )}

      {/* Placed orders table */}
      {showPlaced && (
        <GridBeam rows={4} cols={8} colorVariant="colorful" theme="dark" active className="mt-4 overflow-hidden rounded-md border border-green-500/25 bg-[#ffffff]/80">
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-green-500/20 text-[#0f172a]">
                  <th className="pl-4 pr-2 py-3 w-14" />
                  <th className="px-4 py-3 font-medium">
                    Product
                    <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Code name · Internal code</p>
                  </th>
                  <th className="px-4 py-3 font-medium w-48">
                    Remarks
                    <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Decision Pending feedback</p>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    Colours
                    <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Ordered quantities</p>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    Placed
                    <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">When the order was placed</p>
                  </th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Golden Sample</th>
                </tr>
              </thead>
              <tbody>
                {placedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <p className="text-sm text-[#64748b]">No placed orders yet.</p>
                      <p className="mt-1 text-xs text-[#94a3b8]">Orders placed from Order Pending or Order On Hold appear here.</p>
                    </td>
                  </tr>
                ) : (
                  placedOrders.map((p) => <PlacedRow key={p.id} p={p} />)
                )}
              </tbody>
            </table>
          </div>
        </GridBeam>
      )}

      {/* Universal popup form modal */}
      <Modal open={!!modal} onClose={closeModal}>
        {modal && modalProduct && (
          <div className="space-y-0">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#bfdbfe]/30 pb-4 mb-5">
              <div>
                <p className="font-semibold text-slate-900">{modalProduct.codeName}</p>
                <p className="text-xs text-[#64748b] mt-0.5">{modalProduct.factory ?? modalProduct.skuCode}</p>
              </div>
              <button onClick={closeModal} className="text-[#94a3b8] hover:text-[#1d4ed8] transition shrink-0"><X size={18} /></button>
            </div>

            {modal.type === "place" && (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-500">Place Order — colours &amp; quantities</p>
                <div className="space-y-2">
                  {modal.colors.map((row, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={row.color}
                        onChange={(e) => setModal((m) => m ? { ...m, colors: m.colors.map((c, j) => j === i ? { ...c, color: e.target.value } : c) } : m)}
                        placeholder={`Colour ${i + 1}`}
                        className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#f8faff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-green-400 placeholder:text-[#94a3b8]" />
                      <input type="number" min={0} value={row.quantity}
                        onChange={(e) => setModal((m) => m ? { ...m, colors: m.colors.map((c, j) => j === i ? { ...c, quantity: e.target.value } : c) } : m)}
                        placeholder="Qty"
                        className="w-24 rounded-md border border-[#bfdbfe]/50 bg-[#f8faff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-green-400 placeholder:text-[#94a3b8]" />
                      {modal.colors.length > 1 && (
                        <button onClick={() => setModal((m) => m ? { ...m, colors: m.colors.filter((_, j) => j !== i) } : m)}
                          className="text-[#94a3b8] hover:text-red-400 transition px-1"><X size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setModal((m) => m ? { ...m, colors: [...m.colors, { color: "", quantity: "" }] } : m)}
                  className="flex items-center gap-1.5 text-xs text-[#1d4ed8] hover:underline">
                  <Plus size={12} /> Add another colour
                </button>
                <div className="flex justify-start gap-2 pt-2">
                  <button onClick={confirmVerdict} disabled={!modal.colors.some((c) => c.color.trim())}
                    className="rounded-md bg-green-500 px-4 py-2 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-40 transition">
                    Confirm Order → Golden Sample
                  </button>
                  <button onClick={closeModal}
                    className="rounded-md border border-[#bfdbfe]/50 px-4 py-2 text-xs text-[#64748b] hover:bg-[#eff6ff] transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {(modal.type === "hold" || modal.type === "drop") && (
              <div className="space-y-4">
                <p className={`text-xs font-semibold uppercase tracking-wide ${modal.type === "hold" ? "text-amber-400" : "text-red-400"}`}>
                  {modal.type === "hold" ? "Put order on hold" : "Drop order"}
                </p>
                <textarea value={modal.remarks}
                  onChange={(e) => setModal((m) => m ? { ...m, remarks: e.target.value } : m)}
                  placeholder="Optional remarks…" rows={3}
                  className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#f8faff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#94a3b8] resize-none" />
                <div className="flex justify-start gap-2">
                  <button onClick={confirmVerdict}
                    className={`rounded-md px-4 py-2 text-xs font-semibold text-white transition ${modal.type === "hold" ? "bg-amber-500 hover:bg-amber-600" : "bg-red-500 hover:bg-red-600"}`}>
                    {modal.type === "hold" ? "Confirm Hold" : "Confirm Drop"}
                  </button>
                  <button onClick={closeModal}
                    className="rounded-md border border-[#bfdbfe]/50 px-4 py-2 text-xs text-[#64748b] hover:bg-[#eff6ff] transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
