"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Circle } from "lucide-react";
import { GridBeam } from "@/components/ui/grid-beam";
import { AppShell } from "@/components/AppShell";
import { useProducts, ProductRow, GoldenWorkflow, GoldenSampleStatus, ActivityEntry } from "@/lib/products-context";
import { PRIORITY_DOT } from "@/lib/colors";
import { Chip } from "@/components/Chip";
import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/auth";
import { useToast } from "@/components/Toast";

function fmt(v: string | null) {
  if (!v) return null;
  return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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

function GoldenCard({ product, isQA }: { product: ProductRow; isQA: boolean }) {
  const { setProducts, addNotification } = useProducts();
  const { showToast } = useToast();
  const gw = product.goldenWorkflow!;

  const [urbnModelDraft, setUrbnModelDraft] = useState(product.urbnModelNo ?? "");
  const [detailDraft, setDetailDraft] = useState({
    productName: gw.details?.productName ?? "",
    skuCode: gw.details?.skuCode ?? "",
    colour: gw.details?.colour ?? "",
    logoMarking: gw.details?.logoMarking ?? "",
    ratingLabel: gw.details?.ratingLabel ?? "",
  });

  const [compDraft, setCompDraft] = useState({
    status: gw.compliance?.status ?? "",
    expectedDate: gw.compliance?.expectedDate ?? "",
  });

  const [packDraft, setPackDraft] = useState({
    vendorName: gw.packaging?.vendorName ?? "",
    sampleId: gw.packaging?.sampleIdReceived ?? "",
    expectedDate: gw.packaging?.expectedDate ?? "",
  });

  const kldFileRef = useRef<HTMLInputElement>(null);
  const artFileRef = useRef<HTMLInputElement>(null);

  const [gsDraft, setGsDraft] = useState({
    status: gw.goldenSample?.status ?? "Not started" as GoldenSampleStatus,
    expectedDate: gw.goldenSample?.expectedDate ?? "",
  });

  function patch(fn: (w: GoldenWorkflow) => GoldenWorkflow) {
    setProducts((prev) => prev.map((p) =>
      p.id === product.id && p.goldenWorkflow ? { ...p, goldenWorkflow: fn(p.goldenWorkflow) } : p
    ));
  }

  function log(entry: ActivityEntry) {
    setProducts((prev) => prev.map((p) =>
      p.id === product.id ? { ...p, activityLog: [...p.activityLog, entry] } : p
    ));
  }

  const now = () => new Date().toISOString();

  function notifyPurchase() {
    const t = now();
    patch((w) => ({ ...w, purchaseNotifiedAt: t, purchaseLog: [...w.purchaseLog, { action: "Purchase team notified", timestamp: t, stages: ["PURCHASE TEAM NOTIFIED"] }] }));
    log({ action: "Purchase team notified", timestamp: t, stages: ["PURCHASE TEAM NOTIFIED"] });
    addNotification({ targetRoles: ["Sales"], productId: product.id, productName: product.codeName, message: "You have been notified to place an order for this product." });
    showToast("Purchase team notified");
  }

  const NOTIFY_ALL: Role[] = ["CEO", "Dev", "Sales", "QA"];

  function confirmOrder() {
    const t = now();
    patch((w) => ({ ...w, orderConfirmedAt: t, purchaseLog: [...w.purchaseLog, { action: "Order confirmed by purchase team", timestamp: t, stages: ["ORDER CONFIRMED"] }] }));
    log({ action: "Order confirmed by purchase team", timestamp: t, stages: ["ORDER CONFIRMED"] });
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: "Order confirmed — fill in product details (QA + CEO)." });
    showToast("Order confirmed");
  }

  function saveDetails() {
    const t = now();
    const saved = { ...detailDraft, bomConfirmedAt: gw.details?.bomConfirmedAt ?? null, savedAt: t };
    const isEdit = !!gw.details;
    patch((w) => ({ ...w, details: saved }));
    setProducts((prev) => prev.map((p) => {
      if (p.id !== product.id) return p;
      return {
        ...p,
        codeName: saved.productName.trim() || p.codeName,
        skuCode: saved.skuCode.trim() || p.skuCode,
        urbnModelNo: urbnModelDraft.trim() || p.urbnModelNo,
      };
    }));
    log({ action: isEdit ? "Product details updated" : "Product details saved", timestamp: t, stages: ["PRODUCT DETAILS SAVED"], note: `${saved.productName} · URBN: ${urbnModelDraft || "—"} · Supplier: ${saved.skuCode}` });
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: saved.productName || product.codeName, message: isEdit ? "Product details updated." : `Product details saved — ${saved.productName}` });
    showToast(isEdit ? "Details updated" : "Details saved");
  }

  function confirmBOM() {
    const t = now();
    patch((w) => ({ ...w, details: w.details ? { ...w.details, bomConfirmedAt: t } : w.details }));
    log({ action: "BOM confirmed", timestamp: t, stages: ["BOM CONFIRMED"] });
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: "BOM confirmed ✓" });
    showToast("BOM confirmed");
  }

  function saveCompliance() {
    const t = now();
    const isNew = !gw.compliance;
    const entry: ActivityEntry = { action: isNew ? "Compliance initiated" : "Compliance details updated", timestamp: t, stages: isNew ? ["COMPLIANCE INITIATED"] : undefined };
    patch((w) => ({
      ...w,
      compliance: {
        status: compDraft.status, expectedDate: compDraft.expectedDate,
        confirmedAt: w.compliance?.confirmedAt ?? null,
        log: [...(w.compliance?.log ?? []), entry],
      },
    }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: isNew ? "Compliance initiated." : "Compliance details updated." });
    showToast(isNew ? "Compliance initiated" : "Compliance updated");
  }

  function confirmCompliance() {
    const t = now();
    const entry: ActivityEntry = { action: "Compliance confirmed", timestamp: t, stages: ["COMPLIANCE CONFIRMED"] };
    patch((w) => ({ ...w, compliance: w.compliance ? { ...w.compliance, confirmedAt: t, log: [...w.compliance.log, entry] } : w.compliance }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: "Compliance confirmed ✓" });
    showToast("Compliance confirmed");
  }

  function setPackagingStep(field: "vendorSetAt" | "sampleReceivedAt" | "releasedAt", label: string, stages?: string[]) {
    const t = now();
    const entry: ActivityEntry = { action: label, timestamp: t, stages };
    patch((w) => ({ ...w, packaging: w.packaging ? { ...w.packaging, [field]: t, log: [...w.packaging.log, entry] } : w.packaging }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: label });
    showToast(label);
  }

  function initPackaging() {
    const t = now();
    const entry: ActivityEntry = { action: `Packaging initiated — vendor: ${packDraft.vendorName}`, timestamp: t, stages: ["PACKAGING INITIATED"] };
    patch((w) => ({
      ...w,
      packaging: {
        vendorName: packDraft.vendorName, vendorSetAt: t,
        expectedDate: packDraft.expectedDate || null,
        sampleIdReceived: packDraft.sampleId,
        sampleReceivedAt: packDraft.sampleId ? t : null,
        keyLineDrawingAt: null, keyLineDrawingImageUrl: null, keyLineDrawingApprovedAt: null, keyLineDrawingRejectedAt: null,
        artworkStartedAt: null, artworkImageUrl: null, artworkApprovedAt: null, artworkRejectedAt: null,
        releasedAt: null,
        log: [entry, ...(packDraft.sampleId ? [{ action: `Packaging sample received — ${packDraft.sampleId}`, timestamp: t }] : [])],
      },
    }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Packaging initiated — vendor: ${packDraft.vendorName}` });
    showToast("Packaging initiated");
  }

  function uploadKeyLineDrawing(dataUrl: string, fileName: string) {
    const t = now();
    const entry: ActivityEntry = { action: `Key line drawing uploaded — ${fileName}`, timestamp: t };
    patch((w) => ({ ...w, packaging: w.packaging ? { ...w.packaging, keyLineDrawingAt: t, keyLineDrawingImageUrl: dataUrl, keyLineDrawingApprovedAt: null, keyLineDrawingRejectedAt: null, log: [...w.packaging.log, entry] } : w.packaging }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Key line drawing uploaded — awaiting approval.` });
    showToast("Key line drawing uploaded");
  }

  function decideKeyLineDrawing(approved: boolean) {
    const t = now();
    const action = approved ? "Key line drawing approved" : "Key line drawing rejected";
    const entry: ActivityEntry = { action, timestamp: t };
    patch((w) => ({ ...w, packaging: w.packaging ? { ...w.packaging, keyLineDrawingApprovedAt: approved ? t : null, keyLineDrawingRejectedAt: approved ? null : t, log: [...w.packaging.log, entry] } : w.packaging }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: action });
    showToast(action);
  }

  function uploadArtwork(dataUrl: string, fileName: string) {
    const t = now();
    const entry: ActivityEntry = { action: `Artwork uploaded — ${fileName}`, timestamp: t };
    patch((w) => ({ ...w, packaging: w.packaging ? { ...w.packaging, artworkStartedAt: t, artworkImageUrl: dataUrl, artworkApprovedAt: null, artworkRejectedAt: null, log: [...w.packaging.log, entry] } : w.packaging }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Artwork uploaded — awaiting approval.` });
    showToast("Artwork uploaded");
  }

  function decideArtwork(approved: boolean) {
    const t = now();
    const action = approved ? "Artwork approved" : "Artwork rejected";
    const entry: ActivityEntry = { action, timestamp: t };
    patch((w) => ({ ...w, packaging: w.packaging ? { ...w.packaging, artworkApprovedAt: approved ? t : null, artworkRejectedAt: approved ? null : t, log: [...w.packaging.log, entry] } : w.packaging }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: action });
    showToast(action);
  }

  function saveGoldenSample() {
    const t = now();
    const isNew = !gw.goldenSample;
    const received = gsDraft.status === "Received";
    const stages = received ? ["GOLDEN SAMPLE RECEIVED"] : isNew ? ["GOLDEN SAMPLE TRACKING STARTED"] : undefined;
    const entry: ActivityEntry = { action: isNew ? `Golden sample status: ${gsDraft.status}` : `Golden sample updated: ${gsDraft.status}`, timestamp: t, stages };
    patch((w) => ({
      ...w,
      goldenSample: {
        status: gsDraft.status, expectedDate: gsDraft.expectedDate,
        receivedAt: received ? (w.goldenSample?.receivedAt ?? t) : null,
        log: [...(w.goldenSample?.log ?? []), entry],
      },
    }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Golden sample status: ${gsDraft.status}` });
    showToast(`Golden sample: ${gsDraft.status}`);
  }

  const detailsLocked = false;
  const complianceLocked = !gw.details;
  const packAndSampleLocked = !gw.compliance?.confirmedAt;

  const stagesDone = [!!gw.details, !!gw.compliance?.confirmedAt, !!gw.packaging?.releasedAt, gw.goldenSample?.status === "Received"];
  const progress = stagesDone.filter(Boolean).length;

  return (
    <GridBeam rows={6} cols={8} colorVariant="colorful" theme="dark" active className="rounded-lg border border-[#bfdbfe]/50 bg-[#ffffff] overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#bfdbfe]/40 px-6 py-4">
        <div className="flex-1 min-w-0">
          <p className="text-xl font-semibold text-white">{product.codeName}</p>
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
              <div>
                <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide">Internal code</p>
                <p className="text-sm font-mono font-semibold text-[#0f172a]">{product.orderDecision.internalCode}</p>
              </div>
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

        {/* Stage 1 — Product Details */}
        <div className={`rounded-md border px-5 py-4 ${detailsLocked ? "border-[#bfdbfe]/20 opacity-50" : "border-[#bfdbfe]/40 bg-[#ffffff]"}`}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#1d4ed8]">1 — Product Details</p>
          {detailsLocked ? (
            <p className="text-xs text-[#94a3b8]">Unlocks after order is confirmed.</p>
          ) : (
            <div className="space-y-3 mt-3">
              {gw.details && <p className="text-xs text-[#d97706]">Last saved {fmt(gw.details.savedAt)}</p>}
              <p className="text-[11px] text-[#64748b]">Filled by QA + CEO</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Product name" value={detailDraft.productName} onChange={(v) => setDetailDraft((d) => ({ ...d, productName: v }))} placeholder="e.g. URBN 10000mAh Hyper Magtag" />
                <Field label="URBN model no." value={urbnModelDraft} onChange={setUrbnModelDraft} placeholder="e.g. UPR135" />
                <Field label="Supplier / SKU code" value={detailDraft.skuCode} onChange={(v) => setDetailDraft((d) => ({ ...d, skuCode: v }))} placeholder="e.g. BW-C5" />
                <Field label="Colour" value={detailDraft.colour} onChange={(v) => setDetailDraft((d) => ({ ...d, colour: v }))} placeholder="e.g. Black, White" />
                <Field label="Logo marking" value={detailDraft.logoMarking} onChange={(v) => setDetailDraft((d) => ({ ...d, logoMarking: v }))} placeholder="e.g. Embossed URBN logo on back" />
                <Field label="Rating label" value={detailDraft.ratingLabel} onChange={(v) => setDetailDraft((d) => ({ ...d, ratingLabel: v }))} placeholder="e.g. BIS cert label, CE label" />
              </div>
              <button onClick={saveDetails} className="w-full rounded-md bg-[#2563eb] py-2.5 text-sm font-medium text-[#0f172a] hover:opacity-90">
                {gw.details ? "Update details" : "Save details"}
              </button>
              {/* BOM Confirmation */}
              {gw.details && (
                <div className={`rounded-md border px-4 py-3 flex items-center justify-between gap-3 ${gw.details.bomConfirmedAt ? "border-green-500/30 bg-green-500/5" : "border-[#bfdbfe]/40 bg-[#eff6ff]"}`}>
                  <div>
                    <p className="text-xs font-medium text-[#0f172a]">BOM Confirmation</p>
                    {gw.details.bomConfirmedAt
                      ? <p className="text-xs text-green-400 flex items-center gap-1 mt-0.5"><CheckCircle size={11} /> Confirmed {fmt(gw.details.bomConfirmedAt)}</p>
                      : <p className="text-xs text-[#94a3b8] mt-0.5">Confirm bill of materials is finalised</p>}
                  </div>
                  {!gw.details.bomConfirmedAt && (
                    <button onClick={confirmBOM} className="shrink-0 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20">
                      Confirm BOM
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stage 2 — Compliance (unlocks after details saved) */}
        {!complianceLocked ? (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748b] px-1">2 — Compliance</p>

            {/* Compliance */}
            <TrackCard title="Compliance" color="#a78bfa" done={!!gw.compliance?.confirmedAt}>
              <div className="space-y-3 mt-1">
                {!isQA && (
                  <>
                    <Field label="Status" value={compDraft.status} onChange={(v) => setCompDraft((d) => ({ ...d, status: v }))} placeholder="e.g. Under review" />
                    <Field label="Expected date" type="date" value={compDraft.expectedDate} onChange={(v) => setCompDraft((d) => ({ ...d, expectedDate: v }))} />
                    <div className="flex gap-2">
                      <button onClick={saveCompliance} className="flex-1 rounded-md bg-[#bfdbfe]/60 py-2 text-xs font-medium text-[#0f172a] hover:bg-[#2563eb]">
                        {gw.compliance ? "Update" : "Start"}
                      </button>
                      {gw.compliance && !gw.compliance.confirmedAt && (
                        <button onClick={confirmCompliance} className="flex-1 rounded-md border border-green-500/40 bg-green-500/10 py-2 text-xs font-medium text-green-400 hover:bg-green-500/20">
                          Mark confirmed
                        </button>
                      )}
                    </div>
                  </>
                )}
                {gw.compliance && (
                  <div className="space-y-1">
                    <p className="text-xs text-[#1d4ed8]">Status: <span className="text-[#0f172a]">{gw.compliance.status}</span></p>
                    {gw.compliance.expectedDate && <p className="text-xs text-[#1d4ed8]">Expected: <span className="text-[#d97706]">{gw.compliance.expectedDate}</span></p>}
                    {gw.compliance.confirmedAt && <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={11} /> Confirmed {fmt(gw.compliance.confirmedAt)}</p>}
                  </div>
                )}
                {gw.compliance && <LogPanel entries={gw.compliance.log} />}
              </div>
            </TrackCard>
          </div>
        ) : gw.orderConfirmedAt ? (
          <div className="rounded-md border border-dashed border-[#bfdbfe]/50 px-5 py-4 text-xs text-[#64748b]">
            Complete Stage 1 (product details) to unlock compliance.
          </div>
        ) : null}

        {/* Stage 3 — Packaging + Golden Sample (unlocks after compliance confirmed) */}
        {!complianceLocked && (
          !packAndSampleLocked ? (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748b] px-1">3 — Packaging &amp; Golden Sample</p>

            {/* Packaging */}
            <TrackCard title="Packaging" color="#0ea5e9" done={!!gw.packaging?.releasedAt}>
              <div className="space-y-2 mt-1">
                {!gw.packaging ? (
                  !isQA ? (
                    <div className="space-y-3">
                      <Field label="Vendor name" value={packDraft.vendorName} onChange={(v) => setPackDraft((d) => ({ ...d, vendorName: v }))} placeholder="e.g. PackCo Ltd" />
                      <Field label="Packaging sample ID" value={packDraft.sampleId} onChange={(v) => setPackDraft((d) => ({ ...d, sampleId: v }))} placeholder="e.g. PKG-0091" />
                      <Field label="Expected completion date" type="date" value={packDraft.expectedDate} onChange={(v) => setPackDraft((d) => ({ ...d, expectedDate: v }))} />
                      <button onClick={initPackaging} disabled={!packDraft.vendorName} className="w-full rounded-md bg-[#bfdbfe]/60 py-2 text-xs font-medium text-[#0f172a] hover:bg-[#2563eb] disabled:opacity-40">
                        Initiate packaging
                      </button>
                    </div>
                  ) : <p className="text-xs text-[#94a3b8]">Not started yet.</p>
                ) : (
                  <div className="space-y-3">
                    {/* Vendor + ETA */}
                    <Step done={!!gw.packaging.vendorSetAt} label={`Vendor: ${gw.packaging.vendorName}`} timestamp={gw.packaging.vendorSetAt} />
                    {gw.packaging.expectedDate && <p className="ml-7 text-xs text-[#d97706]">ETA: {gw.packaging.expectedDate}</p>}
                    <div>
                      <Step done={!!gw.packaging.sampleReceivedAt} label={`Sample${gw.packaging.sampleIdReceived ? ` — ${gw.packaging.sampleIdReceived}` : ""} received`} timestamp={gw.packaging.sampleReceivedAt} />
                      {!isQA && !gw.packaging.sampleReceivedAt && (
                        <button onClick={() => setPackagingStep("sampleReceivedAt", `Packaging sample received — ${gw.packaging!.sampleIdReceived}`)} className="ml-6 mt-1 rounded-lg bg-[#bfdbfe]/60 px-3 py-1 text-xs text-[#0f172a] hover:bg-[#2563eb]">Mark received</button>
                      )}
                    </div>

                    {/* Key Line Drawing */}
                    {gw.packaging.sampleReceivedAt && (
                      <div className="rounded-lg border border-[#bfdbfe]/40 bg-[#f0f5ff]/40 p-3 space-y-2">
                        <p className="text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">Key Line Drawing</p>

                        {gw.packaging.keyLineDrawingImageUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={gw.packaging.keyLineDrawingImageUrl} alt="Key line drawing" className="w-full rounded-lg object-contain max-h-48 bg-[#eff6ff]" />
                            <p className="text-[10px] text-[#64748b]">Uploaded {fmt(gw.packaging.keyLineDrawingAt)}</p>
                            {!gw.packaging.keyLineDrawingApprovedAt && !gw.packaging.keyLineDrawingRejectedAt && !isQA && (
                              <div className="flex gap-2">
                                <button onClick={() => decideKeyLineDrawing(true)} className="flex-1 rounded-lg border border-green-500/40 bg-green-500/10 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20">Approve</button>
                                <button onClick={() => decideKeyLineDrawing(false)} className="flex-1 rounded-lg border border-red-500/40 bg-red-500/10 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20">Reject</button>
                              </div>
                            )}
                            {gw.packaging.keyLineDrawingApprovedAt && <p className="flex items-center gap-1 text-xs text-green-400"><CheckCircle size={11} /> Approved {fmt(gw.packaging.keyLineDrawingApprovedAt)}</p>}
                            {gw.packaging.keyLineDrawingRejectedAt && (
                              <div className="space-y-1.5">
                                <p className="text-xs text-red-400">✕ Rejected {fmt(gw.packaging.keyLineDrawingRejectedAt)} — re-upload to try again</p>
                                {!isQA && (
                                  <button onClick={() => kldFileRef.current?.click()} className="w-full rounded-lg border border-dashed border-[#bfdbfe]/50 py-1.5 text-xs text-[#1d4ed8] hover:bg-[#eff6ff]">Re-upload</button>
                                )}
                              </div>
                            )}
                          </>
                        ) : !isQA ? (
                          <button onClick={() => kldFileRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#bfdbfe]/50 py-4 text-xs text-[#64748b] hover:bg-[#eff6ff]">
                            <span className="text-lg">↑</span> Upload image
                          </button>
                        ) : (
                          <p className="text-xs text-[#94a3b8]">No image uploaded yet.</p>
                        )}
                        <input ref={kldFileRef} type="file" accept="image/*" className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]; if (!f) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => uploadKeyLineDrawing(ev.target?.result as string, f.name);
                            reader.readAsDataURL(f);
                            e.target.value = "";
                          }} />
                      </div>
                    )}

                    {/* Artwork */}
                    {gw.packaging.keyLineDrawingApprovedAt && (
                      <div className="rounded-lg border border-[#bfdbfe]/40 bg-[#f0f5ff]/40 p-3 space-y-2">
                        <p className="text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">Artwork</p>

                        {gw.packaging.artworkImageUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={gw.packaging.artworkImageUrl} alt="Artwork" className="w-full rounded-lg object-contain max-h-48 bg-[#eff6ff]" />
                            <p className="text-[10px] text-[#64748b]">Uploaded {fmt(gw.packaging.artworkStartedAt)}</p>
                            {!gw.packaging.artworkApprovedAt && !gw.packaging.artworkRejectedAt && !isQA && (
                              <div className="flex gap-2">
                                <button onClick={() => decideArtwork(true)} className="flex-1 rounded-lg border border-green-500/40 bg-green-500/10 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20">Approve</button>
                                <button onClick={() => decideArtwork(false)} className="flex-1 rounded-lg border border-red-500/40 bg-red-500/10 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20">Reject</button>
                              </div>
                            )}
                            {gw.packaging.artworkApprovedAt && <p className="flex items-center gap-1 text-xs text-green-400"><CheckCircle size={11} /> Approved {fmt(gw.packaging.artworkApprovedAt)}</p>}
                            {gw.packaging.artworkRejectedAt && (
                              <div className="space-y-1.5">
                                <p className="text-xs text-red-400">✕ Rejected {fmt(gw.packaging.artworkRejectedAt)} — re-upload to try again</p>
                                {!isQA && (
                                  <button onClick={() => artFileRef.current?.click()} className="w-full rounded-lg border border-dashed border-[#bfdbfe]/50 py-1.5 text-xs text-[#1d4ed8] hover:bg-[#eff6ff]">Re-upload</button>
                                )}
                              </div>
                            )}
                          </>
                        ) : !isQA ? (
                          <button onClick={() => artFileRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#bfdbfe]/50 py-4 text-xs text-[#64748b] hover:bg-[#eff6ff]">
                            <span className="text-lg">↑</span> Upload artwork
                          </button>
                        ) : (
                          <p className="text-xs text-[#94a3b8]">No artwork uploaded yet.</p>
                        )}
                        <input ref={artFileRef} type="file" accept="image/*" className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]; if (!f) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => uploadArtwork(ev.target?.result as string, f.name);
                            reader.readAsDataURL(f);
                            e.target.value = "";
                          }} />
                      </div>
                    )}

                    {/* Release */}
                    {gw.packaging.artworkApprovedAt && (
                      <div>
                        <Step done={!!gw.packaging.releasedAt} label="Released (packaging + user manual)" timestamp={gw.packaging.releasedAt} />
                        {!isQA && !gw.packaging.releasedAt && (
                          <button onClick={() => setPackagingStep("releasedAt", "Packaging and user manual released", ["PACKAGING RELEASED"])} className="ml-6 mt-1 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-500/20">Mark released</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {gw.packaging && <LogPanel entries={gw.packaging.log} />}
              </div>
            </TrackCard>

            {/* Golden Sample */}
            <TrackCard title="Golden Sample" color="#fbbf24" done={gw.goldenSample?.status === "Received"}>
              <div className="space-y-3 mt-1">
                {!isQA && (
                  <>
                    <div>
                      <span className="mb-1.5 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">Status</span>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        {(["Not started", "Requested", "In progress", "Received"] as GoldenSampleStatus[]).map((s) => (
                          <button key={s} type="button" onClick={() => setGsDraft((d) => ({ ...d, status: s }))}
                            className={`rounded-lg border py-1.5 text-xs font-medium transition ${gsDraft.status === s ? "border-[#f59e0b] bg-[#f59e0b]/20 text-[#f59e0b]" : "border-[#bfdbfe]/50 bg-[#eff6ff] text-[#64748b] hover:bg-[#dbeafe]"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Field label="Expected date" type="date" value={gsDraft.expectedDate} onChange={(v) => setGsDraft((d) => ({ ...d, expectedDate: v }))} />
                    <button onClick={saveGoldenSample} className="w-full rounded-md bg-[#bfdbfe]/60 py-2 text-xs font-medium text-[#0f172a] hover:bg-[#2563eb]">
                      {gw.goldenSample ? "Update" : "Start tracking"}
                    </button>
                  </>
                )}
                {gw.goldenSample && (
                  <div className="space-y-1">
                    <p className="text-xs text-[#1d4ed8]">Status: <span className={gw.goldenSample.status === "Received" ? "text-green-400" : "text-[#f59e0b]"}>{gw.goldenSample.status}</span></p>
                    {gw.goldenSample.expectedDate && <p className="text-xs text-[#1d4ed8]">Expected: <span className="text-[#d97706]">{gw.goldenSample.expectedDate}</span></p>}
                    {gw.goldenSample.receivedAt && <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={11} /> Received {fmt(gw.goldenSample.receivedAt)}</p>}
                  </div>
                )}
                {gw.goldenSample && <LogPanel entries={gw.goldenSample.log} />}
              </div>
            </TrackCard>
          </div>
          ) : (
          <div className="rounded-md border border-dashed border-[#bfdbfe]/50 px-5 py-4 text-xs text-[#64748b]">
            Confirm compliance to unlock packaging and golden sample.
          </div>
          )
        )}

      </div>
    </GridBeam>
  );
}

// ─── Mini progress bar used in the switcher ───────────────────────────────────

const TRACK_COLORS = ["#a78bfa", "#34d399", "#fb923c", "#fbbf24"];
const TRACK_LABELS = ["Details", "Compliance", "Packaging", "Golden Sample"];

function MiniProgress({ stages }: { stages: boolean[] }) {
  return (
    <div className="flex gap-1 mt-1.5">
      {stages.map((done, i) => (
        <div key={i} title={TRACK_LABELS[i]}
          className="h-1.5 flex-1 rounded-full transition-colors"
          style={{ background: done ? TRACK_COLORS[i] : "#eff6ff" }} />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GoldenProductPage() {
  const { products, search } = useProducts();
  const [isQA, setIsQA] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => { setIsQA(getSession()?.role === "QA"); }, []);

  const q = search.toLowerCase();
  const approved = products.filter((p) => {
    if (p.status !== "Approved" || !p.goldenWorkflow || p.orderDecision?.state !== "placed") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });

  // Auto-select first product
  useEffect(() => {
    if (approved.length > 0 && selectedId === null) setSelectedId(approved[0].id);
  }, [approved.length]);

  const selected = approved.find((p) => p.id === selectedId) ?? approved[0] ?? null;

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Golden Product</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">Post-approval workflow — details, compliance, packaging, golden sample.</p>
      {isQA && <p className="mt-1 text-xs text-[#d97706]">You are in read-only mode.</p>}

      {approved.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-[#bfdbfe]/50 px-5 py-16 text-center text-sm text-[#64748b]">
          No products here yet. Place an order on the Approved tab to begin the Golden Sample workflow.
        </div>
      ) : (
        <>
          {/* Product switcher bar */}
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {approved.map((p) => {
              const gw = p.goldenWorkflow!;
              const stages = [!!gw.details, !!gw.compliance?.confirmedAt, !!gw.packaging?.releasedAt, gw.goldenSample?.status === "Received"];
              const done = stages.filter(Boolean).length;
              const active = p.id === (selected?.id ?? -1);
              return (
                <button key={p.id} onClick={() => setSelectedId(p.id)}
                  className={`shrink-0 rounded-md border px-4 py-3 text-left transition min-w-[160px] ${active ? "border-[#0ea5e9]/60 bg-[#eff6ff]" : "border-[#bfdbfe]/40 bg-[#ffffff] hover:bg-[#eff6ff]/60"}`}>
                  <p className={`text-sm font-medium truncate ${active ? "text-blue-700 font-semibold" : "text-slate-600"}`}>{p.codeName}</p>
                  <p className="text-[10px] text-[#64748b] mt-0.5 tabular-nums">{done}/4 complete</p>
                  <MiniProgress stages={stages} />
                </button>
              );
            })}
          </div>

          {/* Single product detail */}
          {selected && (
            <div className="mt-4">
              <GoldenCard key={selected.id} product={selected} isQA={isQA} />
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
