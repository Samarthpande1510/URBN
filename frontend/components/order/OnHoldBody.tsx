"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/Modal";
import { useProducts, Status, ProductRow, HoldStatus } from "@/lib/products-context";
import { PRIORITY_DOT } from "@/lib/colors";
import { Chip } from "@/components/Chip";
import { getSession, Session } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { GridBeam } from "@/components/ui/grid-beam";
import { ChevronDown, ChevronUp, X } from "lucide-react";

// ─── constants ────────────────────────────────────────────────────────────────

const HOLD_STATUSES: HoldStatus[] = [
  "Feedback Shared",
  "Factory Replied (Product on hold)",
  "Factory Replied (Awaiting Sample)",
  "Factory Replied (Product Rejected)",
  "Factory Replied (Pending Points)",
];

const HOLD_STATUS_STYLE: Record<HoldStatus, string> = {
  "Feedback Shared":                    "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "Factory Replied (Product on hold)":  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "Factory Replied (Awaiting Sample)":  "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "Factory Replied (Product Rejected)": "bg-red-500/10 text-red-400 border-red-500/25",
  "Factory Replied (Pending Points)":   "bg-orange-500/10 text-orange-400 border-orange-500/25",
};

const STAGE_PILL_STYLE: Record<string, string> = {
  "NPD TESTING: PASS":        "bg-green-500/15 text-green-400 border-green-500/30",
  "NPD TESTING: FAIL":        "bg-red-500/15 text-red-400 border-red-500/30",
  "EMAILED TO FACTORY":       "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "IMPROVEMENT REQUIREMENT":  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "REVISED SAMPLE REQUESTED": "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "REVISED SAMPLE PENDING":   "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "REVISED SAMPLE RECEIVED":  "bg-[#eff6ff] text-[#0ea5e9] border-[#0ea5e9]/25",
  "REJECTED":                 "bg-red-500/10 text-red-400 border-red-500/25",
  "ORDER PLACED":             "bg-green-500/15 text-green-400 border-green-500/30",
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
  for (const entry of p.activityLog) {
    if (entry.stages) stages.push(...entry.stages);
  }
  if (stages.length === 0) stages.push("NPD TESTING: PENDING");
  return stages;
}

function fmt(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0)  return <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">{Math.abs(days)}d overdue</span>;
  if (days <= 3) return <span className="rounded bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-400">{days}d left</span>;
  if (days <= 7) return <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">{days}d left</span>;
  return null;
}

// ─── Popup form ───────────────────────────────────────────────────────────────

function HoldForm({ p, isReadOnly, onClose }: { p: ProductRow; isReadOnly: boolean; onClose: () => void }) {
  const { setProducts, addNotification } = useProducts();
  const { showToast } = useToast();

  const [observations, setObservations] = useState(
    p.factoryComm?.sentObservations ?? p.npdReport?.notes ?? ""
  );
  const [factoryReply, setFactoryReply] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<HoldStatus | "">("");
  const [sampleReceived, setSampleReceived] = useState(p.factoryComm?.factorySampleReceived ?? false);
  const [sampleDate, setSampleDate] = useState(p.factoryComm?.factorySampleDate ?? "");
  const [showLog, setShowLog] = useState(false);

  const statusLog = p.factoryComm?.holdStatusLog ?? [];

  useEffect(() => {
    setObservations(p.factoryComm?.sentObservations ?? p.npdReport?.notes ?? "");
    setFactoryReply("");
    setSelectedStatus("");
    setSampleReceived(p.factoryComm?.factorySampleReceived ?? false);
    setSampleDate(p.factoryComm?.factorySampleDate ?? "");
    setShowLog(false);
  }, [p.id]);

  function addStatus() {
    if (!selectedStatus) return;
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => {
      if (x.id !== p.id) return x;
      const ec = x.factoryComm ?? { decidedAction: "EMAIL_FACTORY", decidedAt: now, acknowledgedAt: null, replyAt: null, replyText: null, tentativeReturnDate: null, editHistory: [] };
      return {
        ...x,
        statusChangedAt: now,
        factoryComm: {
          ...ec,
          sentObservations: observations,
          replyText: factoryReply || ec.replyText,
          replyAt: factoryReply ? (ec.replyAt ?? now) : ec.replyAt,
          holdStatusLog: [...(ec.holdStatusLog ?? []), { status: selectedStatus as HoldStatus, timestamp: now }],
          factorySampleReceived: sampleReceived,
          factorySampleDate: sampleDate || null,
        },
        activityLog: [...x.activityLog, {
          action: `Factory status: ${selectedStatus}${factoryReply ? ` · ${factoryReply}` : ""}`,
          timestamp: now,
          note: factoryReply || undefined,
        }],
      };
    }));
    addNotification({ targetRoles: ["CEO", "Dev"], productId: p.id, productName: p.codeName, message: `${p.codeName} → ${selectedStatus}` });
    showToast("Status logged");
    setSelectedStatus("");
    setFactoryReply("");
  }

  function saveObservations() {
    if (observations === (p.factoryComm?.sentObservations ?? p.npdReport?.notes ?? "") &&
        sampleReceived === (p.factoryComm?.factorySampleReceived ?? false) &&
        sampleDate === (p.factoryComm?.factorySampleDate ?? "")) return;
    const now = new Date().toISOString();
    const changes: string[] = [];
    if (observations !== (p.factoryComm?.sentObservations ?? p.npdReport?.notes ?? "")) changes.push("observations updated");
    if (sampleReceived !== (p.factoryComm?.factorySampleReceived ?? false)) changes.push(`sample: ${sampleReceived ? "received" : "not received"}`);
    setProducts((prev) => prev.map((x) => {
      if (x.id !== p.id) return x;
      const ec = x.factoryComm ?? { decidedAction: "EMAIL_FACTORY", decidedAt: now, acknowledgedAt: null, replyAt: null, replyText: null, tentativeReturnDate: null, editHistory: [] };
      return {
        ...x,
        statusChangedAt: now,
        factoryComm: { ...ec, sentObservations: observations, factorySampleReceived: sampleReceived, factorySampleDate: sampleDate || null },
        activityLog: [...x.activityLog, { action: changes.join(" · "), timestamp: now }],
      };
    }));
    showToast("Saved");
  }

  return (
    <div className="max-h-[85vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[#bfdbfe]/30 px-5 py-4">
        <div>
          <p className="font-semibold text-slate-900">{p.codeName} — On Hold</p>
          <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode} · on hold since {fmt(p.statusChangedAt ?? null)}</p>
        </div>
        <button onClick={onClose} className="text-[#94a3b8] hover:text-[#1d4ed8] transition shrink-0"><X size={18} /></button>
      </div>

      <div className="px-5 py-5 space-y-5">

        {/* Observations */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide font-medium text-[#1d4ed8] mb-1.5">
            Observations sent to factory
          </label>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            disabled={isReadOnly}
            rows={3}
            placeholder="QA observations shared with the factory…"
            className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#94a3b8] resize-none disabled:opacity-60 disabled:cursor-default"
          />
        </div>

        {/* Sample received */}
        <div className="rounded-md border border-[#bfdbfe]/30 bg-[#f8faff] px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#0f172a]">Factory sample received</p>
              <p className="text-[11px] text-[#94a3b8] mt-0.5">Toggle when the physical sample arrives</p>
            </div>
            <button type="button" disabled={isReadOnly} onClick={() => setSampleReceived((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full border-2 transition-colors disabled:pointer-events-none ${sampleReceived ? "bg-green-500 border-green-500" : "bg-[#e2e8f0] border-[#e2e8f0]"}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${sampleReceived ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          {sampleReceived && (
            <div>
              <label className="block text-[11px] text-[#64748b] mb-1">Date sample was sent by factory</label>
              <input type="date" value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} disabled={isReadOnly}
                className="rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-1.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] disabled:opacity-60 disabled:cursor-default" />
            </div>
          )}
        </div>

        {!isReadOnly && (
          <button onClick={saveObservations}
            className="w-full rounded-md border border-[#bfdbfe]/50 py-2 text-sm text-[#1d4ed8] hover:bg-[#eff6ff] transition">
            Save observations & sample
          </button>
        )}

        {/* Status log — stacked timeline */}
        <div>
          <p className="text-[10px] uppercase tracking-wide font-medium text-[#1d4ed8] mb-2">Factory response log</p>

          {statusLog.length === 0 ? (
            <p className="text-xs text-[#94a3b8] mb-3">No statuses logged yet.</p>
          ) : (
            <div className="mb-4 space-y-2">
              {statusLog.map((entry, i) => (
                <div key={i} className="flex items-center gap-3">
                  {/* connector line */}
                  <div className="flex flex-col items-center self-stretch">
                    <div className={`h-2.5 w-2.5 rounded-full border-2 shrink-0 mt-0.5 ${HOLD_STATUS_STYLE[entry.status].split(" ")[1].replace("text-", "border-")}`}
                      style={{ backgroundColor: "transparent" }} />
                    {i < statusLog.length - 1 && <div className="flex-1 w-px bg-[#bfdbfe]/50 my-0.5" />}
                  </div>
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${HOLD_STATUS_STYLE[entry.status]}`}>
                        {entry.status}
                      </span>
                      <span className="text-[11px] text-[#94a3b8] tabular-nums">{fmt(entry.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add next status */}
          {!isReadOnly && (
            <div className="rounded-md border border-[#bfdbfe]/40 bg-[#f8faff] p-4 space-y-3">
              <p className="text-[11px] text-[#64748b]">Add next status update</p>
              <div className="flex flex-wrap gap-2">
                {HOLD_STATUSES.map((s) => (
                  <button key={s} type="button"
                    onClick={() => setSelectedStatus(selectedStatus === s ? "" : s)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                      selectedStatus === s ? HOLD_STATUS_STYLE[s] : "border-[#bfdbfe]/50 bg-white text-[#64748b] hover:bg-[#dbeafe] hover:text-[#1d4ed8]"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
              <textarea value={factoryReply} onChange={(e) => setFactoryReply(e.target.value)} rows={2}
                placeholder="Factory reply / notes for this update (optional)…"
                className="w-full rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#94a3b8] resize-none" />
              <button onClick={addStatus} disabled={!selectedStatus}
                className="w-full rounded-md bg-[#2563eb] py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition">
                Log status update
              </button>
            </div>
          )}
        </div>

        {/* Activity log */}
        {p.activityLog.length > 0 && (
          <div className="border-t border-[#bfdbfe]/20 pt-3">
            <button onClick={() => setShowLog(!showLog)} className="flex items-center gap-1.5 text-xs text-[#64748b] hover:text-[#1d4ed8] transition">
              Activity log ({p.activityLog.length})
              {showLog ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showLog && (
              <div className="mt-2 space-y-1.5">
                {p.activityLog.map((entry, i) => (
                  <div key={i} className="flex gap-3 text-xs">
                    <span className="text-[#d97706] tabular-nums shrink-0 w-36">{fmt(entry.timestamp)}</span>
                    <span className="text-[#0f172a]">{entry.action}</span>
                    {entry.note && <span className="text-[#1d4ed8] truncate">— {entry.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type VerdictType = "order" | "approved" | "reject";

interface ColorRow { color: string; quantity: string }
interface VerdictState { type: VerdictType; remarks: string; colors: ColorRow[]; improvement: boolean; improvementNotes: string }

export function OnHoldBody() {
  const { products, setProducts, addNotification, search } = useProducts();
  const { showToast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [formId, setFormId] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Record<number, VerdictState>>({});
  useEffect(() => { setSession(getSession()); }, []);

  const isReadOnly = false;

  const q = search.toLowerCase();
  const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  const visible = products
    .filter((p) => {
      if (p.status !== "On hold") return false;
      if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
      return true;
    })
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));

  function openVerdict(id: number, type: VerdictType) {
    setVerdict((prev) => {
      if (prev[id]?.type === type) { const n = { ...prev }; delete n[id]; return n; }
      return { ...prev, [id]: { type, remarks: "", colors: [{ color: "", quantity: "" }], improvement: false, improvementNotes: "" } };
    });
  }

  function setVerdictColors(id: number, colors: ColorRow[]) {
    setVerdict((prev) => ({ ...prev, [id]: { ...prev[id], colors } }));
  }

  function confirmVerdict(p: ProductRow) {
    const v = verdict[p.id]; if (!v) return;
    const now = new Date().toISOString();
    const remarks = v.remarks.trim() || undefined;

    if (v.type === "order") {
      const code = "AP-" + Math.random().toString(36).slice(2, 5).toUpperCase();
      const validColors = v.colors.filter((c) => c.color.trim()).map((c) => ({ color: c.color.trim(), quantity: parseInt(c.quantity) || 0 }));
      setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
        ...x,
        status: "Approved" as Status,
        statusChangedAt: now,
        orderDecision: { state: "placed", internalCode: code, decidedAt: now, decidedBy: session?.name ?? null, colors: validColors, improvedGoldenSampleExpected: v.improvement, improvementNotes: v.improvementNotes.trim() || undefined },
        goldenWorkflow: {
          purchaseNotifiedAt: now,
          orderConfirmedAt: now,
          purchaseLog: [{ action: `Order placed (${code}) — ${validColors.map((c) => `${c.color} ×${c.quantity}`).join(", ")}`, timestamp: now }],
          details: null,
          compliance: null,
          packaging: null,
          goldenSample: { status: "Requested", expectedDate: "", receivedAt: null, approvedAt: null, improvementFixed: null, improvementFixedAt: null, improvementFixedNotes: null, log: [{ action: "Golden sample requested", timestamp: now }] },
          improvedGoldenSampleExpected: v.improvement,
        },
        activityLog: [...x.activityLog, {
          action: `Order placed (${code}) — ${validColors.length} colour${validColors.length !== 1 ? "s" : ""} · moving to Golden Sample${remarks ? ` · ${remarks}` : ""}`,
          timestamp: now,
          note: remarks,
          stages: v.improvement ? ["ORDER PLACED", "IMPROVEMENT REQUIREMENT"] : ["ORDER PLACED"],
        }],
      }));
      addNotification({ targetRoles: ["CEO", "Dev", "Sales"], productId: p.id, productName: p.codeName, message: `${p.codeName} — order placed (${code}). Golden sample tracking started.` });
      showToast(`${p.codeName} — order placed, golden sample started`);
    } else if (v.type === "approved") {
      const code = "AP-" + Math.random().toString(36).slice(2, 5).toUpperCase();
      const improvementNotes = v.improvementNotes.trim() || undefined;
      setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
        ...x, status: "Approved" as Status, statusChangedAt: now,
        orderDecision: { state: "pending", internalCode: code, decidedAt: null, decidedBy: null, colors: [], improvedGoldenSampleExpected: v.improvement, improvementNotes },
        activityLog: [...x.activityLog, {
          action: v.improvement
            ? `Sample received — Approved (${code}) — improvement requirement${remarks ? ` · ${remarks}` : ""}`
            : `Sample received — Approved (${code})${remarks ? ` · ${remarks}` : ""}`,
          timestamp: now, note: remarks,
          stages: v.improvement ? ["EMAILED TO FACTORY", "IMPROVEMENT REQUIREMENT"] : ["EMAILED TO FACTORY"],
        }],
      }));
      addNotification({ targetRoles: ["CEO", "Dev", "Sales"], productId: p.id, productName: p.codeName, message: `${p.codeName} approved — awaiting order.` });
      showToast(`${p.codeName} approved`);
    } else {
      setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
        ...x, status: "Rejected" as Status, statusChangedAt: now,
        activityLog: [...x.activityLog, { action: `Rejected from On Hold${remarks ? ` · ${remarks}` : ""}`, timestamp: now, note: remarks, stages: ["REJECTED"] }],
      }));
      addNotification({ targetRoles: ["CEO"], productId: p.id, productName: p.codeName, message: `${p.codeName} rejected — CEO review needed.` });
      showToast(`${p.codeName} sent to Rejected`);
    }
    setVerdict((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
  }

  const formProduct = products.find((x) => x.id === formId) ?? null;

  return (
    <>
      <p className="mt-1 text-sm text-[#1d4ed8]">
        Products waiting on factory resolution. Click a row to edit observations & factory response. Use the verdict buttons to move the product forward.
      </p>

      <GridBeam rows={6} cols={8} colorVariant="sunset" theme="dark" active className="mt-4 overflow-hidden rounded-md border border-[#bfdbfe]/40 bg-[#ffffff]/80">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#bfdbfe]/40 text-[#0f172a]">
                <th className="pl-4 pr-2 py-3 w-14" />
                <th className="px-4 py-3 font-medium">
                  Product
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Code name · Factory</p>
                </th>
                <th className="px-4 py-3 font-medium">
                  Factory Response
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Current hold status</p>
                </th>
                <th className="px-4 py-3 font-medium">
                  Sample
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Factory sample</p>
                </th>
                <th className="px-4 py-3 font-medium">
                  Stages
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Pipeline trail</p>
                </th>
                <th className="px-4 py-3 font-medium">
                  Last updated
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">When status changed</p>
                </th>
                {!isReadOnly && (
                  <th className="px-4 py-3 font-medium">
                    Verdict
                    <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Move forward</p>
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
                  <td colSpan={isReadOnly ? 7 : 8} className="px-5 py-16 text-center">
                    <p className="text-sm text-[#64748b]">No products currently on hold.</p>
                    <p className="mt-1 text-xs text-[#94a3b8]">Products appear here when a Hold decision is made in Decision Pending.</p>
                  </td>
                </tr>
              ) : (
                visible.map((p) => {
                  const statusLog = p.factoryComm?.holdStatusLog ?? [];
                  const hs = statusLog.length > 0 ? statusLog[statusLog.length - 1].status : undefined;
                  const v = verdict[p.id] ?? null;
                  const sampleReceived = p.factoryComm?.factorySampleReceived;
                  const sampleDate = p.factoryComm?.factorySampleDate;

                  return (
                    <>
                      <tr
                        key={p.id}
                        onClick={() => setFormId(p.id)}
                        className={`cursor-pointer border-b border-[#bfdbfe]/20 transition hover:bg-[#eff6ff] ${v ? "bg-[#eff6ff]" : ""}`}
                      >
                        {/* Thumbnail */}
                        <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                          {p.imageDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageDataUrl} alt={p.codeName}
                              className="h-12 w-12 rounded-md object-cover border border-[#bfdbfe]/40" />
                          ) : (
                            <div className="h-12 w-12 rounded-md border border-[#bfdbfe]/30 bg-[#eff6ff] flex items-center justify-center text-[10px] font-semibold text-[#2a4a6a] select-none">
                              {p.codeName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </td>

                        {/* Product */}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 leading-snug">{p.codeName}</p>
                          <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode}</p>
                        </td>

                        {/* Factory response */}
                        <td className="px-4 py-3">
                          {hs ? (
                            <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${HOLD_STATUS_STYLE[hs]}`}>
                              {hs}
                            </span>
                          ) : (
                            <span className="text-xs text-[#94a3b8]">No update yet</span>
                          )}
                        </td>

                        {/* Sample */}
                        <td className="px-4 py-3">
                          {sampleReceived ? (
                            <div>
                              <span className="inline-block rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-500">Received</span>
                              {sampleDate && <p className="text-[11px] text-[#94a3b8] mt-0.5">{new Date(sampleDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
                            </div>
                          ) : (
                            <span className="text-xs text-[#94a3b8]">Pending</span>
                          )}
                        </td>

                        {/* Stages */}
                        <td className="px-4 py-3 max-w-[180px]">
                          <StagePills stages={getPipelineTrail(p)} />
                        </td>

                        {/* Last updated */}
                        <td className="px-4 py-3 tabular-nums text-[#d97706] whitespace-nowrap text-xs">
                          {p.statusChangedAt ? fmt(p.statusChangedAt) : "—"}
                        </td>

                        {/* Verdict buttons */}
                        {!isReadOnly && (
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1.5 flex-wrap">
                              {([
                                { key: "order",    label: "Place Order",  style: v?.type === "order"    ? "border-green-500 bg-green-500/20 text-green-400"  : "border-[#bfdbfe]/50 bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe]" },
                                { key: "approved", label: "→ Approved",   style: v?.type === "approved" ? "border-[#3b82f6] bg-[#3b82f6]/20 text-[#3b82f6]"  : "border-[#bfdbfe]/50 bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe]" },
                                { key: "reject",   label: "✕ Reject",     style: v?.type === "reject"   ? "border-red-500 bg-red-500/20 text-red-400"         : "border-[#bfdbfe]/50 bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe]" },
                              ] as { key: VerdictType; label: string; style: string }[]).map(({ key, label, style }) => (
                                <button key={key} onClick={() => openVerdict(p.id, key)}
                                  className={`rounded border px-2.5 py-1 text-xs font-medium transition ${style}`}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </td>
                        )}

                        {/* Deadline */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <DeadlineBadge deadline={p.deadline} />
                            <span className="tabular-nums text-[#d97706] text-xs">
                              {new Date(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Verdict sub-row */}
                      {v && !isReadOnly && (
                        <tr key={`${p.id}-verdict`} className="border-b border-[#bfdbfe]/30 bg-[#f8faff]">
                          <td colSpan={8} className="px-6 py-4">

                            {v.type === "order" ? (
                              /* ── Place Order: colour + quantity form ── */
                              <div className="rounded-md border border-green-500/25 bg-green-500/5 p-4 space-y-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-green-400">Place Order — colours & quantities</p>

                                <div className="space-y-2">
                                  {v.colors.map((row, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                      <input
                                        value={row.color}
                                        onChange={(e) => {
                                          const next = v.colors.map((c, j) => j === i ? { ...c, color: e.target.value } : c);
                                          setVerdictColors(p.id, next);
                                        }}
                                        placeholder={`Colour ${i + 1} (e.g. Black)`}
                                        className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-green-400 placeholder:text-[#94a3b8]"
                                      />
                                      <input
                                        type="number"
                                        min={0}
                                        value={row.quantity}
                                        onChange={(e) => {
                                          const next = v.colors.map((c, j) => j === i ? { ...c, quantity: e.target.value } : c);
                                          setVerdictColors(p.id, next);
                                        }}
                                        placeholder="Qty"
                                        className="w-24 rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-green-400 placeholder:text-[#94a3b8]"
                                      />
                                      {v.colors.length > 1 && (
                                        <button
                                          onClick={() => setVerdictColors(p.id, v.colors.filter((_, j) => j !== i))}
                                          className="text-[#94a3b8] hover:text-red-400 transition px-1"
                                        >
                                          <X size={14} />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                <button
                                  onClick={() => setVerdictColors(p.id, [...v.colors, { color: "", quantity: "" }])}
                                  className="text-xs text-[#1d4ed8] hover:underline"
                                >
                                  + Add another colour
                                </button>

                                <textarea
                                  value={v.remarks}
                                  onChange={(e) => setVerdict((prev) => ({ ...prev, [p.id]: { ...prev[p.id], remarks: e.target.value } }))}
                                  placeholder="Remarks (optional)…"
                                  rows={2}
                                  className="w-full rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-green-400 placeholder:text-[#94a3b8] resize-none"
                                />

                                {/* Improvement requirement — only when moving from On Hold to Approved */}
                                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                                  <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={v.improvement}
                                      onChange={(e) => setVerdict((prev) => ({ ...prev, [p.id]: { ...prev[p.id], improvement: e.target.checked } }))}
                                      className="h-4 w-4 rounded accent-amber-400"
                                    />
                                    <div>
                                      <p className="text-xs font-medium text-amber-400">Improvement requirement</p>
                                      <p className="text-[11px] text-amber-500/60">Factory must implement improvements before golden sample is accepted</p>
                                    </div>
                                  </label>
                                  {v.improvement && (
                                    <textarea
                                      value={v.improvementNotes}
                                      onChange={(e) => setVerdict((prev) => ({ ...prev, [p.id]: { ...prev[p.id], improvementNotes: e.target.value } }))}
                                      placeholder="Describe the required improvements…"
                                      rows={2}
                                      className="mt-2 w-full rounded-md border border-amber-500/30 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-amber-400 placeholder:text-[#94a3b8] resize-none"
                                    />
                                  )}
                                </div>

                                <div className="flex gap-2 justify-end">
                                  <button onClick={() => setVerdict((prev) => { const n = { ...prev }; delete n[p.id]; return n; })}
                                    className="rounded-md border border-[#bfdbfe]/50 px-4 py-1.5 text-xs text-[#64748b] hover:bg-[#eff6ff] transition">
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => confirmVerdict(p)}
                                    disabled={!v.colors.some((c) => c.color.trim())}
                                    className="rounded-md border border-green-500/40 bg-green-500/20 px-4 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-500/30 disabled:opacity-40 transition"
                                  >
                                    Confirm Order → Golden Sample
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* ── Approved / Reject: simple remarks ── */
                              <div className={`rounded-md border p-4 ${v.type === "approved" ? "border-[#93c5fd]/40 bg-[#eff6ff]" : "border-red-500/25 bg-red-500/5"}`}>
                                <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${v.type === "approved" ? "text-[#1d4ed8]" : "text-red-400"}`}>
                                  {v.type === "approved" ? "Move to Approved — add remarks" : "Reject — add remarks"}
                                </p>
                                <textarea
                                  value={v.remarks}
                                  onChange={(e) => setVerdict((prev) => ({ ...prev, [p.id]: { ...prev[p.id], remarks: e.target.value } }))}
                                  placeholder="Optional remarks…"
                                  rows={2}
                                  className="w-full rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#94a3b8] resize-none"
                                />

                                {/* Improvement requirement — only when moving from On Hold to Approved */}
                                {v.type === "approved" && (
                                  <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={v.improvement}
                                        onChange={(e) => setVerdict((prev) => ({ ...prev, [p.id]: { ...prev[p.id], improvement: e.target.checked } }))}
                                        className="h-4 w-4 rounded accent-amber-400"
                                      />
                                      <div>
                                        <p className="text-xs font-medium text-amber-400">Improvement requirement</p>
                                        <p className="text-[11px] text-amber-500/60">Factory must implement improvements before golden sample is accepted</p>
                                      </div>
                                    </label>
                                    {v.improvement && (
                                      <textarea
                                        value={v.improvementNotes}
                                        onChange={(e) => setVerdict((prev) => ({ ...prev, [p.id]: { ...prev[p.id], improvementNotes: e.target.value } }))}
                                        placeholder="Describe the required improvements…"
                                        rows={2}
                                        className="mt-2 w-full rounded-md border border-amber-500/30 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-amber-400 placeholder:text-[#94a3b8] resize-none"
                                      />
                                    )}
                                  </div>
                                )}

                                <div className="mt-3 flex gap-2 justify-start">
                                  <button onClick={() => confirmVerdict(p)}
                                    className={`rounded-md border px-4 py-1.5 text-xs font-semibold transition ${
                                      v.type === "approved"
                                        ? "border-[#3b82f6]/40 bg-[#3b82f6]/20 text-[#3b82f6] hover:bg-[#3b82f6]/30"
                                        : "border-red-500/40 bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                    }`}>
                                    {v.type === "approved" ? "Confirm Approve" : "Confirm Reject"}
                                  </button>
                                  <button onClick={() => setVerdict((prev) => { const n = { ...prev }; delete n[p.id]; return n; })}
                                    className="rounded-md border border-[#bfdbfe]/50 px-4 py-1.5 text-xs text-[#64748b] hover:bg-[#eff6ff] transition">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GridBeam>

      {/* Factory comm popup */}
      <Modal open={!!formProduct} onClose={() => setFormId(null)}>
        {formProduct && <HoldForm key={formProduct.id} p={formProduct} isReadOnly={isReadOnly} onClose={() => setFormId(null)} />}
      </Modal>
    </>
  );
}
