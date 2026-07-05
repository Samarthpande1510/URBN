"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Circle, X } from "lucide-react";
import { GridBeam } from "@/components/ui/grid-beam";
import { AppShell } from "@/components/AppShell";
import { useProducts, ProductRow, GoldenWorkflow, GoldenSampleStatus, ActivityEntry, ComplianceCertName, ComplianceTrack } from "@/lib/products-context";
import { api, apiErrorMessage } from "@/lib/api";
import { PRIORITY_DOT } from "@/lib/colors";
import { Chip } from "@/components/Chip";
import type { Role } from "@/lib/auth";
import { useToast } from "@/components/Toast";

function fmt(v: string | null) {
  if (!v) return null;
  return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STAGE_PILL_STYLE: Record<string, string> = {
  "NPD TESTING: PENDING":    "bg-[#eff6ff] text-[#64748b] border-[#bfdbfe]/60",
  "NPD TESTING: PASS":       "bg-green-500/15 text-green-400 border-green-500/30",
  "NPD TESTING: FAIL":       "bg-red-500/15 text-red-400 border-red-500/30",
  "EMAILED TO FACTORY":      "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "IMPROVEMENT REQUIREMENT": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "DECISION PENDING":        "bg-amber-500/10 text-amber-500 border-amber-500/30",
  "GOLDEN SAMPLES PENDING":  "bg-purple-500/10 text-purple-400 border-purple-500/25",
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
    stages.push("EMAILED TO FACTORY"); stages.push("REVISED SAMPLE REQUESTED");
    const sampleReceived = !!fc?.improvementSampleReceivedAt;
    if (!sampleReceived) { stages.push("REVISED SAMPLE PENDING"); }
    else { stages.push("REVISED SAMPLE RECEIVED"); stages.push(p.npdReport.outcome === "Pass" ? "REVISED TESTING: PASS" : "REVISED TESTING: FAIL"); }
    return stages;
  }

  if (v > 1 && fc && p.status === "Pending NPD") {
    stages.push("EMAILED TO FACTORY"); stages.push("REVISED SAMPLE REQUESTED");
    stages.push("REVISED SAMPLE RECEIVED"); stages.push("REVISED TESTING: PENDING");
    return stages;
  }

  if (p.status === "Approved" || p.status === "Pending NPD" || p.status === "Pending Decision") {
    if (fc?.replyReceivedAt) { stages.push("EMAILED TO FACTORY"); stages.push("REVISED SAMPLE REQUESTED"); stages.push("REVISED SAMPLE RECEIVED"); }
    if (!gw?.purchaseNotifiedAt) {
      stages.push(p.status === "Pending Decision" ? "DECISION PENDING" : "GOLDEN SAMPLES PENDING");
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

// Same detailed pipeline-stage text used on the Dashboard, for the "Approved" / golden-product case.
function getGoldenStage(p: ProductRow): string {
  const gw = p.goldenWorkflow;
  if (!gw || !gw.purchaseNotifiedAt) return gw?.improvedGoldenSampleExpected
    ? "Emailed to factory — improvement requirement — golden samples pending"
    : "Emailed to factory — golden samples pending";
  if (!gw.orderConfirmedAt)           return "Golden product — order confirmation pending";
  if (!gw.details)                    return "Golden product — Part 1: product details pending";
  const part1Checks = [gw.details.colourConfirmedAt, gw.details.logoMarkingConfirmedAt, gw.details.ratingLabelConfirmedAt, gw.details.bomConfirmedAt];
  const part1Done = part1Checks.filter(Boolean).length;
  if (part1Done < part1Checks.length) return `Golden product — Part 1: ${part1Done}/${part1Checks.length} confirmations done`;
  const tracks = gw.compliance?.tracks ?? [];
  const compDone = tracks.length > 0 && tracks.every((tr) => !!tr.confirmedAt);
  const packDone = !!gw.packaging?.kldEmailedToDesignerAt;
  const gsDone   = gw.goldenSample?.status === "Received";
  const compConfirmedCount = tracks.filter((tr) => tr.confirmedAt).length;
  const complianceLabel = tracks.length === 0
    ? "compliance not started"
    : compDone
    ? `compliance confirmed (${tracks.map((tr) => tr.name).join(", ")})`
    : `compliance ${compConfirmedCount}/${tracks.length} confirmed (${tracks.map((tr) => tr.name).join(", ")})`;
  if (gsDone && compDone && packDone)  return "Golden product — all tracks complete";
  if (gsDone)                          return `Golden sample received — ${complianceLabel}, packaging in progress`;
  if (gw.goldenSample?.status === "In progress") return `Golden sample in progress — ${complianceLabel}`;
  if (gw.goldenSample?.status === "Requested")   return `Golden samples pending — ${complianceLabel}`;
  if (!compDone)                       return `Golden product — ${complianceLabel}`;
  return "Golden product — packaging & golden sample in progress";
}

function DeadlineBadge({ deadline }: { deadline?: string | null }) {
  if (!deadline) return null;
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0)  return <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">{Math.abs(days)}d overdue</span>;
  if (days <= 3) return <span className="rounded bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-400">{days}d left</span>;
  if (days <= 7) return <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">{days}d left</span>;
  return null;
}

function Step({ done, label, timestamp, pending }: { done: boolean; label: string; timestamp: string | null; pending?: string }) {
  return (
    <div className="flex items-start gap-3 py-1">
      {done
        ? <CheckCircle size={15} className="mt-0.5 shrink-0 text-green-400" />
        : <Circle size={15} className="mt-0.5 shrink-0 text-[#bfdbfe]" />}
      <div className="flex-1">
        <p className={`text-sm ${done ? "text-[#0f172a]" : "text-[#64748b]"}`}>{label}</p>
        {done && <p className="text-xs text-[#d97706]">{fmt(timestamp)}</p>}
        {!done && pending && <p className="text-xs text-[#94a3b8]">{pending}</p>}
      </div>
    </div>
  );
}

function LogPanel({ entries }: { entries: ActivityEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!entries.length) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-[#64748b] hover:text-[#1d4ed8]">
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Activity ({entries.length})
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-[#f0f5ff]/60 px-3 py-2 space-y-1.5">
          {[...entries].reverse().map((e, i) => (
            <div key={i} className="flex gap-3 text-xs">
              <span className="text-[#d97706] tabular-nums shrink-0">{fmt(e.timestamp)}</span>
              <span className="text-[#0f172a]">{e.action}</span>
              {e.note && <span className="text-[#1d4ed8]">— {e.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, disabled }: { label: string; value: string; onChange?: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">{label}</span>
      <input type={type} value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} placeholder={placeholder} disabled={disabled}
        className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#64748b] disabled:opacity-50 disabled:cursor-not-allowed" />
    </label>
  );
}

function TrackCard({ title, color, done, children }: { title: string; color: string; done: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`rounded-md border ${done ? "border-green-500/30 bg-green-500/5" : "border-[#bfdbfe]/40 bg-[#ffffff]"} overflow-hidden`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#eff6ff]/30">
        <div className="flex items-center gap-2">
          {done ? <CheckCircle size={14} className="text-green-400" /> : <Circle size={14} className="text-[#bfdbfe]" />}
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{title}</span>
        </div>
        {open ? <ChevronUp size={13} className="text-[#64748b]" /> : <ChevronDown size={13} className="text-[#64748b]" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

// ─── Per-product card ─────────────────────────────────────────────────────────

function GoldenSampleSection({ gw, isQA, addNotification, showToast, productId, productVersion, productName, notifyAll, onRefresh }: {
  gw: GoldenWorkflow; isQA: boolean;
  addNotification: ReturnType<typeof useProducts>["addNotification"];
  showToast: (msg: string) => void;
  productId: number; productVersion: number; productName: string;
  notifyAll: Role[];
  onRefresh: () => Promise<void>;
}) {
  const [expectedDate, setExpectedDate] = useState(gw.goldenSample?.expectedDate ?? "");

  useEffect(() => {
    setExpectedDate(gw.goldenSample?.expectedDate ?? "");
  }, [gw.goldenSample?.expectedDate]);

  const gs = gw.goldenSample;
  const received = gs?.status === "Received";

  async function requestSample() {
    try {
      await api.golden.requestGoldenSample(productId, expectedDate || undefined, productVersion);
      await onRefresh();
      addNotification({ targetRoles: notifyAll, productId, productName, message: "Golden sample requested — pending." });
      showToast("Golden sample requested");
    } catch (e: unknown) { const { message, isConflict } = apiErrorMessage(e); if (isConflict) await onRefresh(); showToast(isConflict ? message : `Error: ${message}`); }
  }

  async function updateExpectedDate() {
    if (!gs || !expectedDate) return;
    try {
      await api.golden.updateGoldenSampleExpectedDate(productId, expectedDate, productVersion);
      await onRefresh();
      showToast("Expected date updated");
    } catch (e: unknown) { const { message, isConflict } = apiErrorMessage(e); if (isConflict) await onRefresh(); showToast(isConflict ? message : `Error: ${message}`); }
  }

  async function markReceived() {
    try {
      await api.golden.markGoldenSampleReceived(productId, productVersion);
      await onRefresh();
      addNotification({ targetRoles: notifyAll, productId, productName, message: "Golden sample received ✓" });
      showToast("Golden sample received");
    } catch (e: unknown) { const { message, isConflict } = apiErrorMessage(e); if (isConflict) await onRefresh(); showToast(isConflict ? message : `Error: ${message}`); }
  }

  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-4 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-500">Golden Sample</p>

      {/* Before request: show date picker + request button together */}
      {!isQA && !gs?.requestedAt && (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-amber-600">Expected date of arrival</label>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full rounded-md border border-amber-300/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-amber-400"
            />
          </div>
          <button onClick={requestSample} className="w-full rounded-md border border-amber-400/50 bg-amber-400/10 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-400/20 transition">
            Request Golden Sample
          </button>
        </div>
      )}

      {/* After request: show editable expected date + timestamps + received button */}
      {gs?.requestedAt && (
        <>
          {/* Timestamps */}
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <p className="text-xs text-[#64748b]">Requested: <span className="text-[#d97706]">{new Date(gs.requestedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span></p>
            {received && gs.receivedAt && <p className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle size={11} /> Received: {new Date(gs.receivedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
          </div>

          {/* Editable expected date */}
          {!received && !isQA && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-amber-600">Expected date of arrival</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="flex-1 rounded-md border border-amber-300/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-amber-400"
                />
                <button onClick={updateExpectedDate} disabled={!expectedDate} className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-400/20 transition whitespace-nowrap disabled:opacity-40">
                  Update
                </button>
              </div>
            </div>
          )}
          {received && gs.expectedDate && (
            <p className="text-xs text-[#64748b]">Expected: <span className="font-medium text-[#0f172a]">{gs.expectedDate}</span></p>
          )}

          {/* Mark received */}
          {!isQA && !received && (
            <button onClick={markReceived} className="w-full rounded-md border border-green-500/40 bg-green-500/10 py-2.5 text-sm font-semibold text-green-700 hover:bg-green-500/20 transition">
              ✓ Golden Sample Received
            </button>
          )}
        </>
      )}

      {/* Log */}
      {gs && gs.log.length > 0 && <LogPanel entries={gs.log} />}
    </div>
  );
}

function GoldenCard({ product, isQA }: { product: ProductRow; isQA: boolean }) {
  const { addNotification, refreshProducts, refreshGolden } = useProducts();
  const { showToast } = useToast();
  const gw = product.goldenWorkflow!;

  const onRefresh = async () => { await refreshProducts(); await refreshGolden(product.id); };

  const [urbnModelDraft, setUrbnModelDraft] = useState(product.urbnModelNo ?? "");
  const [detailDraft, setDetailDraft] = useState({
    productName: gw.details?.productName ?? "",
    skuCode: gw.details?.skuCode ?? "",
    colourConfirmed: !!gw.details?.colourConfirmedAt,
    logoMarkingConfirmed: !!gw.details?.logoMarkingConfirmedAt,
    ratingLabelConfirmed: !!gw.details?.ratingLabelConfirmedAt,
    bomConfirmed: !!gw.details?.bomConfirmedAt,
  });

  // Fetch golden data when modal opens for this product
  useEffect(() => {
    refreshGolden(product.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // Sync form from server data whenever golden details load or product switches
  useEffect(() => {
    setUrbnModelDraft(product.urbnModelNo ?? "");
    setDetailDraft({
      productName: gw.details?.productName ?? "",
      skuCode: gw.details?.skuCode ?? "",
      colourConfirmed: !!gw.details?.colourConfirmedAt,
      logoMarkingConfirmed: !!gw.details?.logoMarkingConfirmedAt,
      ratingLabelConfirmed: !!gw.details?.ratingLabelConfirmedAt,
      bomConfirmed: !!gw.details?.bomConfirmedAt,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, gw.details?.savedAt, product.urbnModelNo]);

  const NOTIFY_ALL: Role[] = ["CEO", "Dev", "Sales", "QA"];

  const allConfirmed = detailDraft.colourConfirmed && detailDraft.logoMarkingConfirmed && detailDraft.ratingLabelConfirmed && detailDraft.bomConfirmed;
  const isFirstSave = !gw.details; // details haven't been saved yet
  // First save: all fields + all 4 confirmations required. Re-saves: always allowed.
  const canSaveDetails = isFirstSave
    ? detailDraft.productName.trim().length > 0 && urbnModelDraft.trim().length > 0 && allConfirmed
    : true;

  async function saveDetails() {
    try {
      await api.golden.saveDetails(product.id, {
        product_name: detailDraft.productName,
        sku_code: detailDraft.skuCode,
        colour: "",
        markings: "",
        colour_confirmed: detailDraft.colourConfirmed,
        logo_marking_confirmed: detailDraft.logoMarkingConfirmed,
        rating_label_confirmed: detailDraft.ratingLabelConfirmed,
        bom_confirmed: detailDraft.bomConfirmed,
      });
      // Update product name + URBN SKU everywhere
      const updates: Record<string, string> = {};
      if (detailDraft.productName.trim()) updates.code_name = detailDraft.productName.trim();
      if (urbnModelDraft.trim()) updates.urbn_model_no = urbnModelDraft.trim();
      if (Object.keys(updates).length > 0) {
        await api.products.update(product.id, updates, product.version).catch(() => {});
      }
      await refreshProducts();
      if (allConfirmed) {
        addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Product details confirmed — sent to Compliance and Packaging Development.` });
        showToast("Details saved — product sent to Compliance & Packaging");
      } else {
        addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Product details saved (confirmations pending).` });
        showToast("Details saved");
      }
    } catch (e: unknown) { const { message, isConflict } = apiErrorMessage(e); if (isConflict) await onRefresh(); showToast(isConflict ? message : `Error: ${message}`); }
  }

  const detailsLocked = false;
  const part1Done = !!gw.details && [gw.details.colourConfirmedAt, gw.details.logoMarkingConfirmedAt, gw.details.ratingLabelConfirmedAt, gw.details.bomConfirmedAt].every(Boolean);
  const stage3Locked = !part1Done;
  const compDone = !!gw.compliance?.tracks.length && gw.compliance.tracks.every((tr) => !!tr.confirmedAt);

  const stagesDone = [!!gw.details, compDone, !!gw.packaging?.kldEmailedToDesignerAt, gw.goldenSample?.status === "Received"];
  const progress = stagesDone.filter(Boolean).length;

  return (
    <GridBeam rows={6} cols={8} colorVariant="colorful" theme="dark" active className="rounded-lg border border-[#bfdbfe]/50 bg-[#ffffff] overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#bfdbfe]/40 px-6 py-4">
        <div className="flex-1 min-w-0">
          <p className="text-xl font-semibold text-white flex items-center gap-2">
            {product.codeName}
            {(product.sampleVersion ?? 1) > 1 && (
              <span className="rounded border border-purple-400/40 bg-purple-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-purple-300">v{product.sampleVersion}</span>
            )}
          </p>
          <p className="text-xs text-[#1d4ed8] mt-0.5">
            {product.urbnModelNo && <span className="text-[#0f172a] font-medium">{product.urbnModelNo} · </span>}
            Supplier: {product.skuCode} · Deadline <span className="text-[#d97706] font-semibold">{new Date(product.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </p>
        </div>
        <Chip color={PRIORITY_DOT[product.priority]} label={product.priority} />
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {stagesDone.map((done, i) => (
              <div key={i} className="h-2 w-8 rounded-full transition-colors" title={TRACK_LABELS[i]}
                style={{ background: done ? TRACK_COLORS[i] : "#eff6ff" }} />
            ))}
          </div>
          <span className="text-xs text-[#64748b] tabular-nums">{progress}/4</span>
        </div>
      </div>

      <div className="p-6 space-y-3">

        {/* Order summary */}
        {product.orderDecision && (
          <div className="rounded-md border border-[#93c5fd]/30 bg-[#eff6ff] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#3b82f6] mb-3">Order</p>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {product.orderDecision.decidedBy && (
                <div>
                  <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide">Placed by</p>
                  <p className="text-sm text-[#1d4ed8]">{product.orderDecision.decidedBy}</p>
                </div>
              )}
              {product.orderDecision.decidedAt && (
                <div>
                  <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide">Placed on</p>
                  <p className="text-sm text-[#1d4ed8]">{fmt(product.orderDecision.decidedAt)}</p>
                </div>
              )}
            </div>
            {product.orderDecision.colors.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-1.5">Colors &amp; quantities</p>
                <div className="flex flex-wrap gap-2">
                  {product.orderDecision.colors.map((c, i) => (
                    <span key={i} className="rounded border border-[#93c5fd]/40 bg-[#ffffff] px-2.5 py-1 text-xs text-[#0f172a]">
                      {c.color} <span className="text-[#3b82f6] font-medium">×{c.quantity}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Remarks — all remarks from every previous stage */}
        {(() => {
          const entries: { label: string; text: string; color: string }[] = [];
          if (product.npdReport?.notes) entries.push({ label: "NPD testing notes", text: product.npdReport.notes, color: "border-[#bfdbfe]/40 bg-[#eff6ff] text-[#1d4ed8]" });
          if (product.verdictRemarks) entries.push({ label: "Decision Pending feedback", text: product.verdictRemarks, color: "border-amber-400/30 bg-amber-400/5 text-amber-700" });
          if (product.factoryComm?.replyText) entries.push({ label: "Factory reply", text: product.factoryComm.replyText, color: "border-[#93c5fd]/30 bg-[#eff6ff] text-[#1d4ed8]" });
          if (product.factoryComm?.replyNotes) entries.push({ label: "Reply notes", text: product.factoryComm.replyNotes, color: "border-[#93c5fd]/30 bg-[#eff6ff] text-[#1d4ed8]" });
          if (product.factoryComm?.internalDecisionNotes) entries.push({ label: "Hold — internal decision notes", text: product.factoryComm.internalDecisionNotes, color: "border-[#93c5fd]/30 bg-[#eff6ff] text-[#1d4ed8]" });
          if (product.orderDecision?.improvementNotes) entries.push({ label: "Improvement sample requirement", text: product.orderDecision.improvementNotes, color: "border-purple-400/30 bg-purple-400/5 text-purple-700" });
          if (product.orderDecision?.remarks) entries.push({ label: `Order ${product.orderDecision.state} — remarks`, text: product.orderDecision.remarks, color: "border-[#93c5fd]/30 bg-[#eff6ff] text-[#1d4ed8]" });
          if (entries.length === 0) return null;
          return (
            <div className="rounded-md border border-[#bfdbfe]/40 bg-white px-4 py-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">Remarks &amp; Feedback from previous stages</p>
              {entries.map((e, i) => (
                <div key={i} className={`rounded-md border px-3 py-2.5 ${e.color}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70 mb-0.5">{e.label}</p>
                  <p className="text-sm italic leading-snug">"{e.text}"</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Improvement requirement notice */}
        {gw.improvedGoldenSampleExpected && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <div className="flex items-start gap-2">
              <span className="text-amber-400 text-base leading-none mt-0.5">⚠</span>
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-300">Improvement requirement</p>
                {product.orderDecision?.improvementNotes ? (
                  <p className="text-xs text-amber-200/80 mt-1 whitespace-pre-wrap">{product.orderDecision.improvementNotes}</p>
                ) : (
                  <p className="text-xs text-amber-200/60 mt-0.5">Factory must implement improvements before this golden sample is accepted.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stage 1 — Golden Sample */}
        <div className={`rounded-md border px-5 py-4 ${detailsLocked ? "border-[#bfdbfe]/20 opacity-50" : "border-[#bfdbfe]/40 bg-[#ffffff]"}`}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#1d4ed8]">1 — Golden Sample</p>
          {detailsLocked ? (
            <p className="text-xs text-[#94a3b8]">Unlocks after order is confirmed.</p>
          ) : (
            <div className="space-y-3 mt-3">
              {gw.details && <p className="text-xs text-[#d97706]">Last saved {fmt(gw.details.savedAt)}</p>}
              <p className="text-[11px] text-[#64748b]">Filled by QA + CEO</p>

              {/* Colors ordered */}
              {product.orderDecision && product.orderDecision.colors.length > 0 && (
                <div className="rounded-md border border-[#93c5fd]/30 bg-[#eff6ff] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#3b82f6] mb-1.5">Colors &amp; Qty Ordered</p>
                  <div className="flex flex-wrap gap-1.5">
                    {product.orderDecision.colors.map((c, i) => (
                      <span key={i} className="rounded border border-[#93c5fd]/40 bg-white px-2 py-0.5 text-xs text-[#0f172a]">
                        {c.color} <span className="font-medium text-[#3b82f6]">×{c.quantity}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="URBN Product Name" value={detailDraft.productName} onChange={(v) => setDetailDraft((d) => ({ ...d, productName: v }))} placeholder="e.g. URBN 10000mAh Hyper Magtag" />
                <Field label="URBN SKU Code" value={urbnModelDraft} onChange={setUrbnModelDraft} placeholder="e.g. UPR135" />
              </div>

              {/* Confirmation ticks — colour, logo/marking, rating label, BOM */}
              <div className="space-y-2 pt-1">
                {([
                  { key: "colourConfirmed" as const, atKey: "colourConfirmedAt" as const, label: "Colour confirmation" },
                  { key: "logoMarkingConfirmed" as const, atKey: "logoMarkingConfirmedAt" as const, label: "Logo/marking placement confirmation" },
                  { key: "ratingLabelConfirmed" as const, atKey: "ratingLabelConfirmedAt" as const, label: "Rating label confirmation" },
                  { key: "bomConfirmed" as const, atKey: "bomConfirmedAt" as const, label: "BOM confirmation" },
                ]).map(({ key, atKey, label }) => {
                  const checked = detailDraft[key];
                  const confirmedAt = gw.details?.[atKey];
                  const locked = !!confirmedAt; // once saved as confirmed, cannot be unticked
                  return (
                    <label key={key} className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 ${locked ? "cursor-default" : checked ? "cursor-pointer" : "cursor-pointer"} ${checked ? "border-green-500/30 bg-green-500/5" : "border-[#bfdbfe]/40 bg-[#eff6ff]"}`}>
                      <div>
                        <p className="text-xs font-medium text-[#0f172a]">{label}</p>
                        {checked && confirmedAt
                          ? <p className="text-xs text-green-400 flex items-center gap-1 mt-0.5"><CheckCircle size={11} /> Confirmed {fmt(confirmedAt)}</p>
                          : <p className="text-xs text-[#94a3b8] mt-0.5">{checked ? "Will be confirmed on save" : "Not confirmed"}</p>}
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isQA || locked}
                        onChange={(e) => !locked && setDetailDraft((d) => ({ ...d, [key]: e.target.checked }))}
                        className="h-4 w-4 rounded accent-green-500 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                  );
                })}
              </div>

              {!isQA && (
                <div className="space-y-1.5">
                  {!canSaveDetails && (
                    <p className="text-[11px] text-[#94a3b8] text-center">
                      {!detailDraft.productName.trim() || !urbnModelDraft.trim()
                        ? "Fill in URBN Product Name and SKU Code to continue"
                        : "Tick all 4 confirmations to send to Compliance & Packaging"}
                    </p>
                  )}
                  <button
                    onClick={saveDetails}
                    disabled={!canSaveDetails}
                    className="w-full rounded-md bg-[#2563eb] py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {canSaveDetails ? "Save details & send to Compliance + Packaging" : "Save details"}
                  </button>
                </div>
              )}

              {/* Golden Sample — below form */}
              <GoldenSampleSection gw={gw} isQA={isQA} addNotification={addNotification} showToast={showToast} productId={product.id} productVersion={product.version} productName={product.codeName} notifyAll={NOTIFY_ALL} onRefresh={onRefresh} />
            </div>
          )}
        </div>

        {gw.orderConfirmedAt && !part1Done && (
          <div className="rounded-md border border-dashed border-[#bfdbfe]/50 px-5 py-4 text-xs text-[#64748b]">
            Complete Part 1 confirmations to unlock compliance, packaging, and golden sample.
          </div>
        )}

      </div>
    </GridBeam>
  );
}

// ─── Packaging Development card ───────────────────────────────────────────────

function PackagingCard({ product }: { product: ProductRow }) {
  const { addNotification, refreshProducts, refreshGolden } = useProducts();
  const { showToast } = useToast();
  const gw = product.goldenWorkflow!;
  const pk = gw.packaging;

  const [vendorDraft, setVendorDraft] = useState(pk?.vendorName ?? "");
  const [expectedDate, setExpectedDate] = useState(pk?.expectedDeliveryDate ?? "");
  const [improvNotes, setImprovNotes] = useState("");

  useEffect(() => {
    refreshGolden(product.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  useEffect(() => {
    const saved = pk?.expectedDeliveryDate ?? "";
    if (saved) setExpectedDate(saved);
  }, [pk?.expectedDeliveryDate]);

  const NOTIFY_ALL: Role[] = ["CEO", "Dev", "Sales", "QA"];
  const onRefresh = async () => { await refreshProducts(); await refreshGolden(product.id); };

  async function confirmVendor() {
    if (!vendorDraft.trim()) return;
    try {
      await api.golden.setPackagingVendor(product.id, vendorDraft.trim(), product.version);
      await onRefresh();
      addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Packaging vendor selected — ${vendorDraft.trim()}` });
      showToast("Vendor confirmed");
    } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
  }

  async function markDispatched() {
    if (!pk) return;
    try {
      await api.golden.dispatchPackagingSample(product.id, expectedDate || undefined, product.version);
      await onRefresh();
      showToast(`Sample v${pk.sampleVersion ?? 1} dispatched`);
    } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
  }

  async function setSampleStatus(status: "Awaiting" | "Received") {
    if (!pk) return;
    try {
      await api.golden.setPackagingStatus(product.id, status, product.version);
      await onRefresh();
      showToast(`Status updated: ${status}`);
    } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
  }

  async function decideSample(accepted: boolean) {
    if (!pk) return;
    const v = pk.sampleVersion ?? 1;
    try {
      await api.golden.decidePackaging(product.id, accepted ? "Approved" : "Improvement Required", accepted ? undefined : improvNotes.trim() || undefined, product.version);
      await onRefresh();
      if (accepted) {
        addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Packaging sample v${v} accepted — moving to KLD.` });
        showToast("Sample accepted — proceed to KLD");
      } else {
        showToast(`Sample v${v} rejected — start v${v + 1}`);
        setImprovNotes("");
      }
    } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
  }

  async function markKldAcknowledged() {
    if (!pk) return;
    try {
      await api.golden.kldAcknowledge(product.id);
      await onRefresh();
      showToast("KLD acknowledged");
    } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
  }

  async function markEmailedDesigner() {
    if (!pk) return;
    try {
      await api.golden.kldEmail(product.id);
      await onRefresh();
      addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Packaging emailed to designer for ${product.codeName}.` });
      showToast("Emailed to designer — packaging complete");
    } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
  }

  const done = !!pk?.kldEmailedToDesignerAt;
  const v = pk?.sampleVersion ?? 1;
  // After rejection, backend resets decision to null but keeps improvementNotes + increments version
  const rejected = !!pk?.improvementNotes && v > 1 && !pk?.decision;

  return (
    <GridBeam rows={6} cols={8} colorVariant="colorful" theme="dark" active className="rounded-lg border border-[#bfdbfe]/50 bg-[#ffffff] overflow-hidden max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-[#bfdbfe]/40 px-6 py-4 sticky top-0 z-10 bg-[#0f172a]/95">
        <div>
          <p className="text-xl font-semibold text-white flex items-center gap-2">
            {product.codeName}
            {done && <span className="rounded border border-green-400/40 bg-green-400/10 px-2 py-0.5 text-[11px] font-semibold text-green-300">Complete</span>}
          </p>
          <p className="text-xs text-[#1d4ed8] mt-0.5">{product.factory ?? product.skuCode} · Packaging Development</p>
        </div>
        <Chip color={PRIORITY_DOT[product.priority]} label={product.priority} />
      </div>

      <div className="p-6 space-y-4">

        {/* Rejection banner */}
        {rejected && pk?.improvementNotes && (
          <div className="rounded-md border border-red-400/30 bg-red-400/5 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400 mb-0.5">v{v - 1} rejected — now on v{v}</p>
            <p className="text-xs text-red-700 italic">{pk.improvementNotes}</p>
          </div>
        )}

        {/* 1 — Vendor Selection */}
        <div className="rounded-md border border-[#bfdbfe]/40 bg-white px-4 py-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1d4ed8]">1 — Vendor Selection</p>
          {!pk ? (
            <div className="flex gap-2">
              <input value={vendorDraft} onChange={(e) => setVendorDraft(e.target.value)} placeholder="e.g. PackCo Ltd"
                className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#64748b]" />
              <button onClick={confirmVendor} disabled={!vendorDraft.trim()}
                className="rounded-md bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
                Confirm
              </button>
            </div>
          ) : (
            <p className="text-sm font-medium text-[#0f172a] flex items-center gap-2">
              <CheckCircle size={14} className="text-green-400 shrink-0" /> {pk.vendorName}
              <span className="text-[10px] text-[#94a3b8] font-normal">{fmt(pk.vendorSetAt)}</span>
            </p>
          )}
        </div>

        {/* 2 — Sample Dispatched */}
        <div className={`rounded-md border px-4 py-4 space-y-3 ${pk ? "border-[#bfdbfe]/40 bg-white" : "border-dashed border-[#bfdbfe]/30 bg-[#f8faff] opacity-50"}`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1d4ed8]">
            2 — Sample Dispatched?{v > 1 ? ` (v${v})` : ""}
          </p>
          {pk && (
            <>
              {/* Dispatched tick */}
              <label className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${pk.sampleDispatchedAt ? "border-green-500/30 bg-green-500/5" : "border-[#bfdbfe]/30 bg-[#f8faff] cursor-pointer hover:bg-[#eff6ff]"}`}>
                {pk.sampleDispatchedAt
                  ? <CheckCircle size={14} className="text-green-400 shrink-0" />
                  : <Circle size={14} className="text-[#cbd5e1] shrink-0" />}
                <div className="flex-1">
                  <p className={`text-xs font-medium ${pk.sampleDispatchedAt ? "text-green-600" : "text-[#64748b]"}`}>Sample dispatched</p>
                  {pk.sampleDispatchedAt && <p className="text-[10px] text-[#94a3b8] mt-0.5">{fmt(pk.sampleDispatchedAt)}</p>}
                </div>
                {!pk.sampleDispatchedAt && (
                  <input type="checkbox" className="hidden" onChange={(e) => { if (e.target.checked) markDispatched(); }} />
                )}
              </label>
              {!pk.sampleDispatchedAt && (
                <button onClick={markDispatched}
                  className="w-full rounded-md bg-[#2563eb] py-2 text-xs font-semibold text-white hover:opacity-90">
                  Mark Sample Dispatched
                </button>
              )}
              {/* Sample dispatched on date */}
              {pk.sampleDispatchedAt && (
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#64748b]">Sample dispatched on</p>
                  <p className="text-xs text-[#0f172a]">{fmt(pk.sampleDispatchedAt)}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* 3 — Expected Dummy Package Date */}
        <div className={`rounded-md border px-4 py-4 space-y-3 ${pk ? "border-[#bfdbfe]/40 bg-white" : "border-dashed border-[#bfdbfe]/30 bg-[#f8faff] opacity-50"}`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1d4ed8]">
            3 — Expected Dummy Package Date{v > 1 ? ` (v${v})` : ""}
          </p>
          {pk && (
            <div className="flex gap-2">
              <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)}
                className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
              <button
                onClick={async () => {
                  try {
                    await api.golden.updatePackagingExpectedDate(product.id, expectedDate);
                    await onRefresh();
                    showToast("Expected date updated");
                  } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
                }}
                disabled={!expectedDate}
                className="rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] px-3 py-2 text-[11px] font-semibold text-[#1d4ed8] hover:bg-[#dbeafe] whitespace-nowrap disabled:opacity-40">
                Update
              </button>
            </div>
          )}
        </div>

        {/* 4 — Status */}
        <div className={`rounded-md border px-4 py-4 space-y-3 ${pk?.sampleDispatchedAt ? "border-[#bfdbfe]/40 bg-white" : "border-dashed border-[#bfdbfe]/30 bg-[#f8faff] opacity-50"}`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1d4ed8]">4 — Status</p>
          {pk?.sampleDispatchedAt && (
            <>
              {/* Status selector — only before decision */}
              {!pk.decision && (
                <div className="flex gap-2">
                  {(["Awaiting dummy package", "Received"] as const).map((s) => {
                    const active = pk.sampleStatus === s || (s === "Awaiting dummy package" && pk.sampleStatus === "Awaiting");
                    return (
                      <button key={s}
                        onClick={() => setSampleStatus(s === "Awaiting dummy package" ? "Awaiting" : "Received")}
                        className={`flex-1 rounded-md border py-2.5 text-xs font-semibold transition ${active
                          ? s === "Received" ? "border-green-500 bg-green-500/15 text-green-600" : "border-amber-400 bg-amber-400/15 text-amber-600"
                          : "border-[#bfdbfe]/50 bg-[#eff6ff] text-[#64748b] hover:bg-[#dbeafe]"}`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Received → Accept / Reject */}
              {!pk.decision && pk.sampleStatus === "Received" && (
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#64748b]">Sample Decision</p>
                  <textarea value={improvNotes} onChange={(e) => setImprovNotes(e.target.value)} rows={2}
                    placeholder="Rejection notes (required if rejecting)…"
                    className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#f8faff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#94a3b8] resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => decideSample(true)}
                      className="flex-1 rounded-md border border-green-500/40 bg-green-500/10 py-2 text-xs font-semibold text-green-600 hover:bg-green-500/20">
                      ✓ Approved
                    </button>
                    <button onClick={() => decideSample(false)} disabled={!improvNotes.trim()}
                      className="flex-1 rounded-md border border-red-500/40 bg-red-500/10 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/20 disabled:opacity-40">
                      ✕ Rejected — go to v{v + 1}
                    </button>
                  </div>
                </div>
              )}

              {/* After approval — KLD steps */}
              {pk.decision === "Approved" && (
                <div className="space-y-3">
                  <p className="text-xs text-green-500 flex items-center gap-1 font-medium"><CheckCircle size={12} /> Sample approved {fmt(pk.decisionAt)}</p>

                  {/* KLD Requested */}
                  <div className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${pk.kldAcknowledgedAt ? "border-green-500/30 bg-green-500/5" : "border-[#bfdbfe]/30 bg-[#f8faff]"}`}>
                    {pk.kldAcknowledgedAt ? <CheckCircle size={13} className="text-green-400 shrink-0" /> : <Circle size={13} className="text-[#cbd5e1] shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${pk.kldAcknowledgedAt ? "text-green-600" : "text-[#94a3b8]"}`}>KLD received</p>
                      {pk.kldAcknowledgedAt && <p className="text-[10px] text-[#64748b] mt-0.5">{fmt(pk.kldAcknowledgedAt)}</p>}
                    </div>
                    {!pk.kldAcknowledgedAt && (
                      <button onClick={markKldAcknowledged}
                        className="rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] px-3 py-1.5 text-[11px] font-semibold text-[#1d4ed8] hover:bg-[#dbeafe] whitespace-nowrap">
                        KLD Received
                      </button>
                    )}
                  </div>

                  {/* KLD Emailed to Designer */}
                  <div className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${pk.kldEmailedToDesignerAt ? "border-green-500/30 bg-green-500/5" : "border-[#bfdbfe]/30 bg-[#f8faff]"}`}>
                    {pk.kldEmailedToDesignerAt ? <CheckCircle size={13} className="text-green-400 shrink-0" /> : <Circle size={13} className="text-[#cbd5e1] shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${pk.kldEmailedToDesignerAt ? "text-green-600" : "text-[#94a3b8]"}`}>KLD emailed to designer</p>
                      {pk.kldEmailedToDesignerAt && <p className="text-[10px] text-[#64748b] mt-0.5">{fmt(pk.kldEmailedToDesignerAt)}</p>}
                    </div>
                    {pk.kldAcknowledgedAt && !pk.kldEmailedToDesignerAt && (
                      <button onClick={markEmailedDesigner}
                        className="rounded-md bg-[#2563eb] px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 whitespace-nowrap">
                        Mark Emailed
                      </button>
                    )}
                  </div>
                </div>
              )}

            </>
          )}
          {!pk?.sampleDispatchedAt && <p className="text-xs text-[#94a3b8]">Available after sample is dispatched.</p>}
        </div>

        {/* Log */}
        {pk && <LogPanel entries={pk.log} />}
      </div>
    </GridBeam>
  );
}

const TRACK_COLORS = ["#a78bfa", "#34d399", "#fb923c", "#fbbf24"];
const TRACK_LABELS = ["Details", "Compliance", "Packaging", "Golden Sample"];

const ALL_CERTS: ComplianceCertName[] = ["BIS", "WPC", "MFI (Apple)", "QI"];

const CERT_COLOR: Record<ComplianceCertName, string> = {
  BIS: "#3b82f6",
  WPC: "#8b5cf6",
  "MFI (Apple)": "#f59e0b",
  QI: "#10b981",
};

// ─── Quick golden sample status card (for "All" popup) ──────────────────────

function QuickGoldenSampleCard({ product }: { product: ProductRow }) {
  const { addNotification, refreshProducts, refreshGolden } = useProducts();
  const { showToast } = useToast();
  const gw = product.goldenWorkflow!;
  const [statusDraft, setStatusDraft] = useState<GoldenSampleStatus>(gw.goldenSample?.status ?? "Requested");
  const [expectedDraft, setExpectedDraft] = useState(gw.goldenSample?.expectedDate ?? "");
  const NOTIFY_ALL: Role[] = ["CEO", "Dev", "Sales", "QA"];

  async function save() {
    try {
      if (statusDraft === "Received") {
        await api.golden.markGoldenSampleReceived(product.id);
      } else if (expectedDraft) {
        await api.golden.updateGoldenSampleExpectedDate(product.id, expectedDraft);
      }
      await refreshProducts();
      await refreshGolden(product.id);
      addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Golden sample status: ${statusDraft}` });
      showToast(`Golden sample: ${statusDraft}`);
    } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
  }

  const gs = gw.goldenSample;
  return (
    <GridBeam rows={4} cols={6} colorVariant="colorful" theme="dark" active className="rounded-lg border border-[#bfdbfe]/50 bg-[#ffffff] overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#bfdbfe]/40 px-6 py-4">
        <div>
          <p className="text-xl font-semibold text-white">{product.codeName}</p>
          <p className="text-xs text-[#1d4ed8] mt-0.5">{product.factory ?? product.skuCode} · Golden Sample Status</p>
        </div>
        <Chip color={PRIORITY_DOT[product.priority]} label={product.priority} />
      </div>
      <div className="p-6 space-y-4">
        {/* Current state banner */}
        {gs && (
          <div className="rounded-md border border-[#93c5fd]/30 bg-[#eff6ff] px-4 py-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#3b82f6]">Current state</p>
            <p className="text-sm font-semibold text-[#0f172a]">{gs.status}</p>
            {gs.expectedDate && <p className="text-xs text-[#64748b]">Expected: {gs.expectedDate}</p>}
            {gs.receivedAt && <p className="text-xs text-green-500 flex items-center gap-1"><CheckCircle size={11} /> Received {fmt(gs.receivedAt)}</p>}
          </div>
        )}
        {/* Status selector */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#64748b]">Update status</p>
          <div className="grid grid-cols-3 gap-2">
            {(["Requested", "In progress", "Received"] as GoldenSampleStatus[]).map((s) => (
              <button key={s} onClick={() => setStatusDraft(s)}
                className={`rounded-lg border py-2 text-xs font-medium transition ${statusDraft === s
                  ? s === "Received" ? "border-green-500 bg-green-500/15 text-green-600" : "border-amber-400 bg-amber-400/15 text-amber-600"
                  : "border-[#bfdbfe]/50 bg-[#f8faff] text-[#64748b] hover:bg-[#eff6ff]"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#1d4ed8]">Expected date</span>
          <input type="date" value={expectedDraft} onChange={(e) => setExpectedDraft(e.target.value)}
            className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
        </label>
        <button onClick={save} className="w-full rounded-md bg-[#2563eb] py-2.5 text-sm font-semibold text-white hover:opacity-90">
          Save Status
        </button>
        {/* History */}
        {gs && gs.log.length > 0 && <LogPanel entries={gs.log} />}
      </div>
    </GridBeam>
  );
}

// ─── Compliance card ─────────────────────────────────────────────────────────

function ComplianceCard({ product }: { product: ProductRow }) {
  const { addNotification, refreshProducts, refreshGolden } = useProducts();
  const { showToast } = useToast();
  const gw = product.goldenWorkflow!;
  const NOTIFY_ALL: Role[] = ["CEO", "Dev", "Sales", "QA"];

  const [expectedDrafts, setExpectedDrafts] = useState<Record<string, string>>(
    Object.fromEntries(ALL_CERTS.map((c) => [c, gw.compliance?.tracks.find((t) => t.name === c)?.expectedDeliveryDate ?? ""]))
  );

  useEffect(() => {
    refreshGolden(product.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  useEffect(() => {
    setExpectedDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const c of ALL_CERTS) {
        const contextDate = gw.compliance?.tracks.find((t) => t.name === c)?.expectedDeliveryDate ?? "";
        if (contextDate && next[c] !== contextDate) { next[c] = contextDate; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [gw.compliance?.tracks]);

  const onRefresh = async () => { await refreshProducts(); await refreshGolden(product.id); };

  async function initiate(cert: ComplianceCertName) {
    try {
      await api.golden.initiateCompliance(product.id, cert);
      await onRefresh();
      addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Compliance initiated — ${cert}` });
      showToast(`${cert} initiated`);
    } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
  }

  async function markDispatched(cert: ComplianceCertName) {
    const exp = expectedDrafts[cert];
    try {
      await api.golden.dispatchComplianceSample(product.id, cert, exp || undefined);
      await onRefresh();
      showToast(`${cert} sample dispatched`);
    } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
  }

  async function markCertReceived(cert: ComplianceCertName) {
    try {
      await api.golden.markCertReceived(product.id, cert);
      await onRefresh();
      addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `${cert} certification received` });
      showToast(`${cert} certification received`);
    } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
  }

  async function confirm(cert: ComplianceCertName) {
    try {
      await api.golden.confirmCompliance(product.id, cert);
      await onRefresh();
      addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `${cert} compliance confirmed ✓` });
      showToast(`${cert} confirmed`);
    } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
  }

  const tracks = gw.compliance?.tracks ?? [];
  const allConfirmed = tracks.length > 0 && tracks.every((tr) => !!tr.confirmedAt);

  return (
    <GridBeam rows={6} cols={8} colorVariant="colorful" theme="dark" active className="rounded-lg border border-[#bfdbfe]/50 bg-[#ffffff] overflow-hidden max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-[#bfdbfe]/40 px-6 py-4 sticky top-0 z-10 bg-[#0f172a]/95">
        <div>
          <p className="text-xl font-semibold text-white flex items-center gap-2">
            {product.codeName}
            {allConfirmed && <span className="rounded border border-green-400/40 bg-green-400/10 px-2 py-0.5 text-[11px] font-semibold text-green-300">All Confirmed</span>}
          </p>
          <p className="text-xs text-[#1d4ed8] mt-0.5">{product.factory ?? product.skuCode} · Compliance Tracking</p>
        </div>
        <Chip color={PRIORITY_DOT[product.priority]} label={product.priority} />
      </div>

      <div className="p-6 space-y-4">
        {/* Compliance not needed toggle */}
        {gw.complianceNotNeeded ? (
          <div className="flex items-center justify-between rounded-md border border-amber-400/30 bg-amber-400/5 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-amber-700">Compliance marked as not needed</p>
              <p className="text-[11px] text-[#64748b] mt-0.5">This product is excluded from the compliance list.</p>
            </div>
            <button
              onClick={async () => {
                try {
                  await api.golden.setComplianceNeeded(product.id);
                  await onRefresh();
                  showToast("Compliance restored");
                } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
              }}
              className="rounded-md border border-amber-400/40 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition whitespace-nowrap"
            >
              Undo
            </button>
          </div>
        ) : (
          <button
            onClick={async () => {
              try {
                await api.golden.setComplianceNotNeeded(product.id);
                await onRefresh();
                showToast("Product removed from compliance");
              } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
            }}
            className="w-full rounded-md border border-dashed border-[#94a3b8]/50 bg-[#f8faff] py-2 text-xs font-medium text-[#64748b] hover:border-red-300/60 hover:bg-red-50/40 hover:text-red-500 transition"
          >
            Compliance not needed — remove from list
          </button>
        )}

        {/* Summary row + cert cards — hidden when compliance not needed */}
        {!gw.complianceNotNeeded && <>
        <div className="grid grid-cols-4 gap-2">
          {ALL_CERTS.map((cert) => {
            const tr = tracks.find((t) => t.name === cert);
            const color = CERT_COLOR[cert];
            const status = !tr ? "Not initiated" : tr.confirmedAt ? "Confirmed" : tr.sampleDispatchedAt ? "Sample sent" : "Initiated";
            return (
              <div key={cert} className={`rounded-md border px-3 py-2 text-center ${tr?.confirmedAt ? "border-green-500/30 bg-green-500/5" : tr ? "border-[#bfdbfe]/40 bg-white" : "border-dashed border-[#bfdbfe]/30 bg-[#f8faff]"}`}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{cert}</p>
                <p className={`mt-0.5 text-[10px] font-medium ${tr?.confirmedAt ? "text-green-500" : tr ? "text-amber-500" : "text-[#94a3b8]"}`}>{status}</p>
              </div>
            );
          })}
        </div>

        {/* Per-cert track cards */}
        {ALL_CERTS.map((cert) => {
          const tr = tracks.find((t) => t.name === cert);
          const color = CERT_COLOR[cert];
          const confirmed = !!tr?.confirmedAt;
          return (
            <div key={cert} className={`rounded-md border overflow-hidden ${confirmed ? "border-green-500/30 bg-green-500/5" : tr ? "border-[#bfdbfe]/40 bg-white" : "border-dashed border-[#bfdbfe]/30 bg-[#f8faff]"}`}>
              {/* Track header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#bfdbfe]/20">
                <div className="flex items-center gap-2">
                  {confirmed ? <CheckCircle size={14} className="text-green-400" /> : <Circle size={14} style={{ color: tr ? color : "#cbd5e1" }} />}
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: tr ? color : "#94a3b8" }}>{cert}</span>
                  {tr && <span className="text-[10px] text-[#64748b]">Initiated {fmt(tr.initiatedAt)}</span>}
                </div>
                {confirmed && <span className="text-[10px] font-semibold text-green-500 flex items-center gap-1"><CheckCircle size={10} /> Confirmed {fmt(tr.confirmedAt)}</span>}
              </div>

              <div className="px-4 py-3 space-y-3">
                {/* Not initiated */}
                {!tr && (
                  <button onClick={() => initiate(cert)}
                    className="w-full rounded-md border border-dashed py-2 text-xs font-semibold transition hover:opacity-80"
                    style={{ borderColor: color + "60", color, background: color + "08" }}>
                    + Initiate {cert} Compliance
                  </button>
                )}

                {/* Initiation date + sample dispatch section */}
                {tr && !confirmed && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-4 text-[11px] text-[#64748b]">
                      <span>Initiated: <span className="text-[#d97706] font-medium">{fmt(tr.initiatedAt)}</span></span>
                    </div>

                    {/* Sample dispatched tick */}
                    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${tr.sampleDispatchedAt ? "border-green-500/30 bg-green-500/5" : "border-[#bfdbfe]/30 bg-[#f8faff]"}`}>
                      {tr.sampleDispatchedAt
                        ? <CheckCircle size={13} className="text-green-400 shrink-0" />
                        : <Circle size={13} className="text-[#cbd5e1] shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${tr.sampleDispatchedAt ? "text-green-600" : "text-[#94a3b8]"}`}>Sample dispatched</p>
                        {tr.sampleDispatchedAt && (
                          <p className="text-[10px] text-[#64748b] mt-0.5">{fmt(tr.sampleDispatchedAt)}</p>
                        )}
                      </div>
                    </div>

                    {/* Mark dispatched button — shown before date field */}
                    {!tr.sampleDispatchedAt && (
                      <button onClick={() => markDispatched(cert)}
                        className="w-full rounded-md py-2 text-xs font-semibold text-white hover:opacity-90"
                        style={{ background: color }}>
                        Mark Sample Dispatched
                      </button>
                    )}

                    {/* Expected certification date — separate field + button */}
                    <div>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#64748b]">Expected certification date</p>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={expectedDrafts[cert] ?? ""}
                          onChange={(e) => setExpectedDrafts((d) => ({ ...d, [cert]: e.target.value }))}
                          className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]"
                        />
                        <button
                          onClick={async () => {
                            const exp = expectedDrafts[cert] ?? "";
                            try {
                              await api.golden.updateComplianceExpectedDate(product.id, cert, exp);
                              await onRefresh();
                              showToast(`${cert} expected date updated`);
                            } catch (e: unknown) { showToast(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
                          }}
                          disabled={!(expectedDrafts[cert] ?? "").trim()}
                          className="rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] px-3 py-2 text-[11px] font-semibold text-[#1d4ed8] hover:bg-[#dbeafe] whitespace-nowrap disabled:opacity-40"
                        >
                          {tr.sampleDispatchedAt ? "Update date" : "Save date"}
                        </button>
                      </div>
                      {tr.expectedDeliveryDate && (
                        <p className="mt-1 text-[10px] text-[#64748b]">Saved: <span className="font-medium text-[#1d4ed8]">{tr.expectedDeliveryDate}</span></p>
                      )}
                    </div>
                  </div>
                )}

                {/* Confirmed — show key dates */}
                {confirmed && (
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-[#64748b]">
                    <span>Initiated: <span className="text-[#d97706]">{fmt(tr.initiatedAt)}</span></span>
                    {tr.sampleDispatchedAt && <span className="text-green-500">Dispatched: {fmt(tr.sampleDispatchedAt)}</span>}
                    {tr.expectedDeliveryDate && <span>Expected: <span className="font-medium text-[#0f172a]">{tr.expectedDeliveryDate}</span></span>}
                    <span className="text-green-500 font-medium">Confirmed: {fmt(tr.confirmedAt)}</span>
                  </div>
                )}

                {/* Certification received */}
                {tr && !confirmed && tr.sampleDispatchedAt && (
                  <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${tr.certReceivedAt ? "border-green-500/30 bg-green-500/5" : "border-[#bfdbfe]/30 bg-[#f8faff]"}`}>
                    {tr.certReceivedAt
                      ? <CheckCircle size={13} className="text-green-400 shrink-0" />
                      : <Circle size={13} className="text-[#cbd5e1] shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${tr.certReceivedAt ? "text-green-600" : "text-[#94a3b8]"}`}>Certification received</p>
                      {tr.certReceivedAt && <p className="text-[10px] text-[#64748b] mt-0.5">{fmt(tr.certReceivedAt)}</p>}
                    </div>
                    {!tr.certReceivedAt && (
                      <button onClick={() => markCertReceived(cert)}
                        className="rounded-md border px-3 py-1.5 text-[11px] font-semibold hover:opacity-80 whitespace-nowrap"
                        style={{ borderColor: color + "50", color, background: color + "12" }}>
                        Mark Received
                      </button>
                    )}
                  </div>
                )}

                {/* Mark completed */}
                {tr && !confirmed && tr.certReceivedAt && (
                  <button onClick={() => confirm(cert)}
                    className="w-full rounded-md border border-green-500/40 bg-green-500/10 py-2 text-xs font-semibold text-green-600 hover:bg-green-500/20">
                    ✓ Mark {cert} Completed
                  </button>
                )}

                {/* Per-track activity log */}
                {tr && tr.log.length > 0 && (
                  <div className="mt-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#94a3b8] mb-1.5">History</p>
                    <div className="rounded-md bg-[#f8faff] border border-[#eff6ff] px-3 py-2 space-y-1.5">
                      {[...tr.log].reverse().map((e, i) => (
                        <div key={i} className="flex gap-3 text-[10px]">
                          <span className="text-[#d97706] tabular-nums shrink-0 whitespace-nowrap">{fmt(e.timestamp)}</span>
                          <span className="text-[#0f172a]">{e.action}</span>
                          {e.note && <span className="text-[#3b82f6]">— {e.note}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </>}
      </div>
    </GridBeam>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type GoldenFilter = "All" | "Golden Sample" | "Compliance" | "Packaging Development";

function getWorkflowStage(p: ProductRow): { inGoldenSample: boolean; inCompliance: boolean; inPackaging: boolean } {
  const gw = p.goldenWorkflow!;
  const part1Done = !!gw.details && [gw.details.colourConfirmedAt, gw.details.logoMarkingConfirmedAt, gw.details.ratingLabelConfirmedAt, gw.details.bomConfirmedAt].every(Boolean);
  const compDone = !!gw.compliance?.tracks.length && gw.compliance.tracks.every((tr) => !!tr.confirmedAt);
  return {
    inGoldenSample: true,
    inCompliance: part1Done && !compDone && !gw.complianceNotNeeded,
    inPackaging: part1Done && !gw.packaging?.kldEmailedToDesignerAt,
  };
}

export default function GoldenProductPage() {
  const { products, search, refreshProducts, refreshGolden } = useProducts();
  const { showToast } = useToast();
  const isQA = false;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<GoldenFilter>("All");

  const q = search.toLowerCase();
  const allGolden = products.filter((p) => {
    if (p.status !== "Approved" || !p.goldenWorkflow || p.orderDecision?.state !== "placed") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });

  const counts: Record<GoldenFilter, number> = {
    All: allGolden.length,
    "Golden Sample": allGolden.filter((p) => getWorkflowStage(p).inGoldenSample).length,
    Compliance: allGolden.filter((p) => getWorkflowStage(p).inCompliance).length,
    "Packaging Development": allGolden.filter((p) => getWorkflowStage(p).inPackaging).length,
  };

  const visible = allGolden.filter((p) => {
    if (filter === "Golden Sample") return getWorkflowStage(p).inGoldenSample;
    if (filter === "Compliance") return getWorkflowStage(p).inCompliance;
    if (filter === "Packaging Development") return getWorkflowStage(p).inPackaging;
    return true; // "All" — show everything
  });

  const selected = products.find((p) => p.id === selectedId) ?? null;

  const completedPackaging = allGolden.filter(
    (p) => !!p.goldenWorkflow?.packaging?.kldEmailedToDesignerAt && !p.goldenWorkflow?.packagingArchived
  );

  async function removeCompletedPackaging(id: number) {
    const p = products.find((x) => x.id === id);
    try {
      await api.golden.archivePackaging(id, p?.version);
      await refreshProducts();
    } catch (e: unknown) { const { message, isConflict } = apiErrorMessage(e); if (isConflict) await refreshProducts(); showToast(isConflict ? message : `Error: ${message}`); }
  }

  const completedCompliance = allGolden.filter((p) => {
    const tracks = p.goldenWorkflow?.compliance?.tracks ?? [];
    return tracks.length > 0 && tracks.every((tr) => !!tr.confirmedAt) && !p.goldenWorkflow?.complianceArchived;
  });

  async function removeCompletedCompliance(id: number) {
    const p = products.find((x) => x.id === id);
    try {
      await api.golden.archiveCompliance(id, p?.version);
      await refreshProducts();
    } catch (e: unknown) { const { message, isConflict } = apiErrorMessage(e); if (isConflict) await refreshProducts(); showToast(isConflict ? message : `Error: ${message}`); }
  }


  async function markGoldenSampleReceived(id: number) {
    try {
      await api.golden.markGoldenSampleReceived(id);
      await refreshProducts();
      await refreshGolden(id);
    } catch (e: unknown) { const { message } = apiErrorMessage(e); showToast(`Error: ${message}`); }
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Golden Product</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">Track the Golden Sample throughout its stages</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["All", "Golden Sample", "Compliance", "Packaging Development"] as GoldenFilter[]).map((f) => {
          const COLOR: Record<GoldenFilter, string> = {
            All: "border-blue-600 bg-blue-600",
            "Golden Sample": "border-amber-500 bg-amber-500",
            Compliance: "border-violet-600 bg-violet-600",
            "Packaging Development": "border-sky-600 bg-sky-600",
          };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded border px-4 py-1.5 text-sm transition ${
                filter === f
                  ? `${COLOR[f]} text-white font-medium shadow-sm`
                  : "border-blue-100 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-200"
              }`}
            >
              {f} <span className="ml-1 opacity-70 tabular-nums">{counts[f]}</span>
            </button>
          );
        })}
      </div>

      <GridBeam rows={6} cols={8} colorVariant="colorful" theme="dark" active className="mt-4 overflow-hidden rounded-md border border-[#bfdbfe]/40 bg-[#ffffff]/80">
        <div className="overflow-x-auto">
          <table className={`${filter === "Golden Sample" ? "min-w-[1500px]" : "min-w-[1100px]"} w-full text-left text-sm`}>
            <thead>
              <tr className="border-b border-[#bfdbfe]/40 text-[#0f172a]">
                <th className="pl-4 pr-2 py-3 w-14" />
                <th className="px-4 py-3 font-medium">
                  Product Name
            
                </th>
                {filter !== "Compliance" && filter !== "Packaging Development" && filter !== "Golden Sample" && (
                  <th className="px-4 py-3 font-medium">
                    Current Workflow Stage
                  </th>
                )}
                {filter === "All" && (
                  <th className="px-4 py-3 font-medium">
                    Product Remarks
                    <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5"></p>
                  </th>
                )}
                <th className="px-4 py-3 font-medium">
                  {filter === "Compliance" ? "Certification status" : filter === "Packaging Development" ? "Packaging status" : filter === "All" ? "Product Stages" : "Golden sample status"}
                </th>
                {filter === "Golden Sample" && (
                  <>
                    <th className="px-4 py-3 font-medium">
                      Golden Sample Requested Date                    
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Expected Date of Arrival                   
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Date Received
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Order Placed On
                    </th>
                    <th className="px-4 py-3 w-36" />
                  </>
                )}
                {filter === "Compliance" ? (
                  <>
                    <th className="px-4 py-3 font-medium">
                      Initiation Date
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Expected Certification Date
                    </th>
                    <th className="px-4 py-3 w-44" />
                  </>
                ) : filter === "Packaging Development" ? (
                  <>
                    <th className="px-4 py-3 font-medium">
                      Expected Sample Date
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Sample Received On
                    </th>
                  </>
                ) : filter !== "Golden Sample" ? (
                  <>
                    <th className="px-4 py-3 font-medium">
                      Sample Received On
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Order Placed On
                    </th>
                  </>
                ) : null}
                {filter === "Compliance" && (
                  <th className="px-4 py-3 font-medium">
                    Certifications
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={filter === "All" ? 9 : filter === "Compliance" || filter === "Golden Sample" ? 9 : 8} className="px-5 py-16 text-center">
                    <p className="text-sm text-[#64748b]">No golden products match this filter.</p>
                    <p className="mt-1 text-xs text-[#94a3b8]">Products appear here once an order is placed on the Approved tab.</p>
                  </td>
                </tr>
              ) : (
                visible.map((p) => {
                  const gw = p.goldenWorkflow!;
                  const improvement = !!p.goldenWorkflow?.improvedGoldenSampleExpected;

                  return (
                    <tr key={p.id}
                      onClick={filter !== "All" ? () => setSelectedId(p.id) : undefined}
                      className={`border-b border-[#bfdbfe]/20 transition last:border-0 ${filter !== "All" ? "cursor-pointer hover:bg-[#eff6ff]" : ""}`}
                    >
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
                        {p.orderDecision?.internalCode && (
                          <span className="inline-block mt-1 text-[10px] font-mono bg-[#eff6ff] border border-[#93c5fd]/30 text-[#3b82f6] px-1.5 py-0.5 rounded">{p.orderDecision.internalCode}</span>
                        )}
                      </td>
                      {filter !== "Compliance" && filter !== "Packaging Development" && filter !== "Golden Sample" && (
                        <td className="px-4 py-3">
                          {(() => {
                            const pills: { label: string; cls: string }[] = [];

                            // Compliance sub-stage
                            const tracks = gw.compliance?.tracks ?? [];
                            const compDone = tracks.length > 0 && tracks.every((tr) => !!tr.confirmedAt);
                            if (compDone) {
                              pills.push({ label: "Compliance complete", cls: "border-green-500/30 bg-green-500/10 text-green-600" });
                            } else if (tracks.length > 0) {
                              const confirmedCount = tracks.filter((tr) => !!tr.confirmedAt).length;
                              pills.push({ label: `Compliance initiated (${confirmedCount}/${tracks.length})`, cls: "border-violet-500/30 bg-violet-500/10 text-violet-600" });
                            } else {
                              pills.push({ label: "Compliance not started", cls: "border-[#bfdbfe]/40 bg-[#f8faff] text-[#94a3b8]" });
                            }

                            // Packaging sub-stage
                            const pk = gw.packaging;
                            if (!pk) {
                              pills.push({ label: "Packaging not started", cls: "border-[#bfdbfe]/40 bg-[#f8faff] text-[#94a3b8]" });
                            } else if (pk.kldEmailedToDesignerAt) {
                              pills.push({ label: "Packaging complete", cls: "border-green-500/30 bg-green-500/10 text-green-600" });
                            } else if (pk.kldAcknowledgedAt) {
                              pills.push({ label: "KLD acknowledged", cls: "border-sky-500/30 bg-sky-500/10 text-sky-600" });
                            } else if (pk.decision === "Approved") {
                              pills.push({ label: "Sample accepted", cls: "border-sky-500/30 bg-sky-500/10 text-sky-600" });
                            } else if (pk.sampleStatus === "Received") {
                              pills.push({ label: "Sample received", cls: "border-amber-500/30 bg-amber-500/10 text-amber-600" });
                            } else if (pk.sampleDispatchedAt) {
                              pills.push({ label: "Sample dispatched", cls: "border-amber-500/30 bg-amber-500/10 text-amber-600" });
                            } else {
                              pills.push({ label: "Packaging initiated", cls: "border-sky-400/30 bg-sky-400/10 text-sky-500" });
                            }

                            if (improvement) pills.push({ label: "⚠ Improvement", cls: "border-amber-500/30 bg-amber-500/10 text-amber-400" });

                            return (
                              <div className="flex flex-col gap-1">
                                {pills.map((pill, i) => (
                                  <span key={i} className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${pill.cls}`}>{pill.label}</span>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                      )}
                      {filter === "All" && (
                        <td className="px-4 py-3 max-w-[260px]">
                          {(() => {
                            const items: { label: string; text: string; color: string }[] = [];
                            if (p.npdReport?.notes) items.push({ label: "NPD notes", text: p.npdReport.notes, color: "text-[#64748b]" });
                            if (p.verdictRemarks) items.push({ label: "Decision feedback", text: p.verdictRemarks, color: "text-amber-600" });
                            if (p.factoryComm?.replyText) items.push({ label: "Factory reply", text: p.factoryComm.replyText, color: "text-[#1d4ed8]" });
                            if (p.factoryComm?.internalDecisionNotes) items.push({ label: "Internal", text: p.factoryComm.internalDecisionNotes, color: "text-[#1d4ed8]" });
                            if (p.orderDecision?.improvementNotes) items.push({ label: "Improvement needed", text: p.orderDecision.improvementNotes, color: "text-amber-600" });
                            if (p.orderDecision?.remarks) items.push({ label: p.orderDecision.state === "held" ? "Hold" : "Drop", text: p.orderDecision.remarks, color: "text-[#1d4ed8]" });
                            if (items.length === 0) return <span className="text-[#94a3b8] text-xs">—</span>;
                            return (
                              <div className="space-y-1.5">
                                {items.map((item, i) => (
                                  <div key={i}>
                                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${item.color}`}>{item.label}: </span>
                                    <span className="text-[11px] text-[#0f172a] italic">{item.text}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                      )}
                      <td className="px-4 py-3 max-w-[200px]">
                        {filter === "Compliance" ? (() => {
                          const tracks = gw.compliance?.tracks ?? [];
                          const allDone = tracks.length > 0 && tracks.every((tr) => !!tr.confirmedAt);
                          const anyDone = tracks.some((tr) => !!tr.confirmedAt);
                          if (allDone) return <span className="inline-block rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-600">All confirmed</span>;
                          if (anyDone) return <span className="inline-block rounded border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-600">Partially confirmed</span>;
                          if (tracks.length > 0) return <span className="inline-block rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">In progress ({tracks.length} cert{tracks.length > 1 ? "s" : ""})</span>;
                          return <span className="inline-block rounded border border-[#bfdbfe]/40 bg-[#f8faff] px-2 py-0.5 text-[11px] font-medium text-[#94a3b8]">Not initiated</span>;
                        })() : filter === "Packaging Development" ? (() => {
                          const pk = gw.packaging;
                          if (!pk) return <span className="inline-block rounded border border-[#bfdbfe]/40 bg-[#f8faff] px-2 py-0.5 text-[11px] font-medium text-[#94a3b8]">Not started</span>;
                          if (pk.kldEmailedToDesignerAt) return <span className="inline-block rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-600">KLD sent to designer</span>;
                          if (pk.kldAcknowledgedAt) return <span className="inline-block rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600">KLD acknowledged</span>;
                          if (pk.decision === "Approved") return <span className="inline-block rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600">Sample approved</span>;
                          if (pk.improvementNotes && !pk.decision && !pk.sampleDispatchedAt) return <span className="inline-block rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">Improvement required — v{pk.sampleVersion ?? 1}</span>;
                          if (pk.sampleReceivedAt) return <span className="inline-block rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">Sample received</span>;
                          if (pk.sampleDispatchedAt) return <span className="inline-block rounded border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">Sample dispatched</span>;
                          return <span className="inline-block rounded border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[11px] font-medium text-sky-500">Vendor confirmed</span>;
                        })() : filter === "All" ? (
                          <StagePills stages={getPipelineTrail(p)} />
                        ) : (
                          <>
                            {gw.goldenSample?.status === "Received" ? (
                              <span className="inline-block rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-400">Received</span>
                            ) : (
                              <span className="inline-block rounded border border-[#bfdbfe]/40 bg-[#f8faff] px-2 py-0.5 text-[11px] font-medium text-[#64748b]">Added to golden sample</span>
                            )}
                            <p className="mt-1 text-[11px] text-[#64748b] leading-snug">{getGoldenStage(p)}</p>
                          </>
                        )}
                      </td>
                      {filter === "Golden Sample" && (
                        <>
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-xs">
                            {gw.goldenSample?.requestedAt
                              ? <span className="text-[#d97706]">{fmtDate(gw.goldenSample.requestedAt)}</span>
                              : <span className="text-[#94a3b8]">—</span>}
                          </td>
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-xs">
                            {gw.goldenSample?.expectedDate
                              ? <span className="text-[#1d4ed8] font-medium">{fmtDate(gw.goldenSample.expectedDate)}</span>
                              : <span className="text-[#94a3b8]">—</span>}
                          </td>
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-xs">
                            {gw.goldenSample?.receivedAt
                              ? <span className="text-green-500 font-medium flex items-center gap-1"><CheckCircle size={11} />{fmtDate(gw.goldenSample.receivedAt)}</span>
                              : <span className="text-[#94a3b8]">—</span>}
                          </td>
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-xs">
                            {gw.orderConfirmedAt
                              ? <span className="text-[#d97706]">{fmtDate(gw.orderConfirmedAt)}</span>
                              : <span className="text-[#94a3b8]">—</span>}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {gw.goldenSample && gw.goldenSample.status !== "Received" ? (
                              <button
                                onClick={() => markGoldenSampleReceived(p.id)}
                                className="rounded-md border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-600 hover:bg-green-500/20 whitespace-nowrap transition"
                              >
                                ✓ Mark Received
                              </button>
                            ) : gw.goldenSample?.status === "Received" ? (
                              <span className="text-xs text-green-500 font-medium flex items-center gap-1"><CheckCircle size={11} /> Received</span>
                            ) : null}
                          </td>
                        </>
                      )}
                      {filter === "Compliance" ? (
                        <>
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-xs">
                            {(() => {
                              const first = (gw.compliance?.tracks ?? []).slice().sort((a, b) => a.initiatedAt.localeCompare(b.initiatedAt))[0];
                              return first ? <span className="text-[#d97706]">{fmtDate(first.initiatedAt)}</span> : <span className="text-[#94a3b8]">—</span>;
                            })()}
                          </td>
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-xs">
                            {(() => {
                              const dates = (gw.compliance?.tracks ?? []).map((tr) => tr.expectedDeliveryDate).filter(Boolean);
                              if (dates.length === 0) return <span className="text-[#94a3b8]">—</span>;
                              const latest = dates.sort().at(-1)!;
                              return <span className="text-[#1d4ed8] font-medium">{fmtDate(latest)}</span>;
                            })()}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {!(gw.compliance?.tracks?.length) && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await api.golden.setComplianceNotNeeded(p.id);
                                    await refreshProducts();
                                    showToast("Removed from compliance");
                                  } catch (err: unknown) { showToast(`Error: ${err instanceof Error ? err.message : "Failed"}`); }
                                }}
                                className="rounded-md border border-dashed border-[#94a3b8]/50 bg-[#f8faff] px-3 py-1.5 text-[11px] font-medium text-[#64748b] hover:border-red-300/60 hover:bg-red-50/40 hover:text-red-500 transition whitespace-nowrap"
                              >
                                No compliance needed?
                              </button>
                            )}
                          </td>
                        </>
                      ) : filter === "Packaging Development" ? (
                        <>
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-xs">
                            {gw.packaging?.expectedDeliveryDate
                              ? <span className="text-[#1d4ed8] font-medium">{fmtDate(gw.packaging.expectedDeliveryDate)}</span>
                              : <span className="text-[#94a3b8]">—</span>}
                          </td>
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-xs">
                            {gw.packaging?.sampleReceivedAt
                              ? <span className="text-green-400 font-medium">{fmtDate(gw.packaging.sampleReceivedAt)}</span>
                              : <span className="text-[#94a3b8]">—</span>}
                          </td>
                        </>
                      ) : filter !== "Golden Sample" ? (
                        <>
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-xs">
                            {gw.goldenSample?.receivedAt
                              ? <span className="text-green-400 font-medium">{fmtDate(gw.goldenSample.receivedAt)}</span>
                              : <span className="text-[#94a3b8]">—</span>}
                          </td>
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-xs">
                            {gw.orderConfirmedAt
                              ? <span className="text-[#d97706]">{fmtDate(gw.orderConfirmedAt)}</span>
                              : <span className="text-[#94a3b8]">—</span>}
                          </td>
                        </>
                      ) : null}
                      {filter === "Compliance" && (
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(gw.compliance?.tracks ?? []).length === 0 ? (
                              <span className="text-[11px] text-[#94a3b8]">None started</span>
                            ) : (
                              (gw.compliance?.tracks ?? []).map((tr) => (
                                <span key={tr.name}
                                  className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${tr.confirmedAt ? "border-green-500/30 bg-green-500/10 text-green-600" : tr.sampleDispatchedAt ? "border-amber-400/30 bg-amber-400/10 text-amber-600" : "border-violet-400/30 bg-violet-400/10 text-violet-600"}`}
                                  style={{ borderColor: CERT_COLOR[tr.name as ComplianceCertName] + "40", background: CERT_COLOR[tr.name as ComplianceCertName] + "12", color: CERT_COLOR[tr.name as ComplianceCertName] }}
                                  title={tr.confirmedAt ? "Confirmed" : tr.sampleDispatchedAt ? "Sample dispatched" : "Initiated"}>
                                  {tr.confirmedAt ? "✓ " : ""}{tr.name}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                      )}
                      {filter !== "Golden Sample" && filter !== "All" && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <DeadlineBadge deadline={p.deadline} />
                            <span className="tabular-nums text-[#d97706] text-xs">{fmtDate(p.deadline)}</span>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GridBeam>

      {/* Completed Packaging Development dashboard */}
      {filter === "Packaging Development" && completedPackaging.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <h2 className="text-sm font-semibold text-slate-700">Completed Packaging Development</h2>
            <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">{completedPackaging.length}</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-green-100">
            <table className="min-w-[900px] w-full text-left text-sm bg-white">
              <thead>
                <tr className="border-b border-green-100 text-[11px] uppercase tracking-wide text-[#64748b]">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Vendor</th>
                  <th className="px-4 py-2.5 font-medium">Sample rounds</th>
                  <th className="px-4 py-2.5 font-medium">Final decision</th>
                  <th className="px-4 py-2.5 font-medium">KLD acknowledged</th>
                  <th className="px-4 py-2.5 font-medium">Emailed designer</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {completedPackaging.map((p) => {
                  const pk = p.goldenWorkflow!.packaging!;
                  const rejectionRounds = pk.sampleVersion > 1 ? pk.sampleVersion - 1 : 0;
                  return (
                    <tr key={p.id} className="border-b border-green-50 last:border-0 hover:bg-green-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 text-xs">{p.codeName}</p>
                        <p className="text-[11px] text-slate-400">{p.factory ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">{pk.vendorName || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {Array.from({ length: pk.sampleVersion }, (_, i) => {
                            const v = i + 1;
                            const isFinal = v === pk.sampleVersion;
                            return (
                              <span key={v} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                isFinal ? "bg-green-100 text-green-700" : "bg-red-50 text-red-500"
                              }`}>
                                v{v} {isFinal ? "✓" : "✗"}
                              </span>
                            );
                          })}
                          {rejectionRounds > 0 && (
                            <span className="text-[10px] text-slate-400">({rejectionRounds} rejected)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">Approved</span>
                        {pk.decisionAt && <p className="mt-0.5 text-[10px] text-slate-400">{fmtDate(pk.decisionAt)}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {pk.kldAcknowledgedAt ? (
                          <span className="flex items-center gap-1 text-green-600"><span>✓</span>{fmtDate(pk.kldAcknowledgedAt)}</span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {pk.kldEmailedToDesignerAt ? (
                          <span className="flex items-center gap-1 text-green-600"><span>✓</span>{fmtDate(pk.kldEmailedToDesignerAt)}</span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeCompletedPackaging(p.id)}
                          className="rounded border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-500 hover:bg-red-100 hover:border-red-200 transition"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Completed Compliance dashboard */}
      {filter === "Compliance" && completedCompliance.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-violet-400" />
            <h2 className="text-sm font-semibold text-slate-700">Completed Compliance</h2>
            <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">{completedCompliance.length}</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-violet-100">
            <table className="min-w-[900px] w-full text-left text-sm bg-white">
              <thead>
                <tr className="border-b border-violet-100 text-[11px] uppercase tracking-wide text-[#64748b]">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Certifications</th>
                  <th className="px-4 py-2.5 font-medium">BIS</th>
                  <th className="px-4 py-2.5 font-medium">WPC</th>
                  <th className="px-4 py-2.5 font-medium">MFI (Apple)</th>
                  <th className="px-4 py-2.5 font-medium">QI</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {completedCompliance.map((p) => {
                  const tracks = p.goldenWorkflow!.compliance!.tracks;
                  return (
                    <tr key={p.id} className="border-b border-violet-50 last:border-0 hover:bg-violet-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 text-xs">{p.codeName}</p>
                        <p className="text-[11px] text-slate-400">{p.factory ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {tracks.map((tr) => (
                            <span key={tr.name} className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700"
                              style={{ borderColor: CERT_COLOR[tr.name as ComplianceCertName] + "40", background: CERT_COLOR[tr.name as ComplianceCertName] + "12", color: CERT_COLOR[tr.name as ComplianceCertName] }}>
                              {tr.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      {ALL_CERTS.map((cert) => {
                        const tr = tracks.find((t) => t.name === cert);
                        return (
                          <td key={cert} className="px-4 py-3 text-xs">
                            {tr ? (
                              <div>
                                <span className="text-green-500 flex items-center gap-1"><CheckCircle size={11} /> Confirmed</span>
                                <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(tr.confirmedAt)}</p>
                                {tr.sampleDispatchedAt && <p className="text-[10px] text-slate-400">Dispatched {fmtDate(tr.sampleDispatchedAt)}</p>}
                              </div>
                            ) : (
                              <span className="text-slate-300 text-[11px]">N/A</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeCompletedCompliance(p.id)}
                          className="rounded border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-500 hover:bg-red-100 hover:border-red-200 transition">
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Full workflow popup — not shown for "All" tab */}
      {selected && filter !== "All" && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-blue-950/30 backdrop-blur-sm p-4 sm:p-8" onClick={() => setSelectedId(null)}>
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedId(null)}
              className="absolute -top-2 -right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white border border-[#bfdbfe]/50 text-[#64748b] hover:text-red-400 shadow-md transition">
              <X size={16} />
            </button>
            {filter === "Packaging Development"
              ? <PackagingCard key={selected.id} product={selected} />
              : filter === "Compliance"
              ? <ComplianceCard key={selected.id} product={selected} />
              : <GoldenCard key={selected.id} product={selected} isQA={isQA} />
            }
          </div>
        </div>
      )}
    </AppShell>
  );
}
