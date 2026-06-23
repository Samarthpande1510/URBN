"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Circle } from "lucide-react";
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
        : <Circle size={15} className="mt-0.5 shrink-0 text-[#1a3a6e]" />}
      <div className="flex-1">
        <p className={`text-sm ${done ? "text-[#ddeeff]" : "text-[#5a8fc4]"}`}>{label}</p>
        {done && <p className="text-xs text-[#f0c060]">{fmt(timestamp)}</p>}
        {!done && pending && <p className="text-xs text-[#3a5a8a]">{pending}</p>}
      </div>
    </div>
  );
}

function LogPanel({ entries }: { entries: ActivityEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!entries.length) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-[#3a6a9a] hover:text-[#90bce0]">
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Activity ({entries.length})
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-[#020b1e]/60 px-3 py-2 space-y-1.5">
          {[...entries].reverse().map((e, i) => (
            <div key={i} className="flex gap-3 text-xs">
              <span className="text-[#f0c060] tabular-nums shrink-0">{fmt(e.timestamp)}</span>
              <span className="text-[#ddeeff]">{e.action}</span>
              {e.note && <span className="text-[#90bce0]">— {e.note}</span>}
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
      <span className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#90bce0]">{label}</span>
      <input type={type} value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} placeholder={placeholder} disabled={disabled}
        className="w-full rounded-md border border-[#1a3a6e]/50 bg-[#0a1e42] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa] placeholder:text-[#5a8fc4] disabled:opacity-50 disabled:cursor-not-allowed" />
    </label>
  );
}

function TrackCard({ title, color, done, children }: { title: string; color: string; done: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`rounded-md border ${done ? "border-green-500/30 bg-green-500/5" : "border-[#1a3a6e]/40 bg-[#060f26]"} overflow-hidden`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#0a1e42]/30">
        <div className="flex items-center gap-2">
          {done ? <CheckCircle size={14} className="text-green-400" /> : <Circle size={14} className="text-[#1a3a6e]" />}
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{title}</span>
        </div>
        {open ? <ChevronUp size={13} className="text-[#5a8fc4]" /> : <ChevronDown size={13} className="text-[#5a8fc4]" />}
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

  const [detailDraft, setDetailDraft] = useState({
    productName: gw.details?.productName ?? "",
    skuCode: gw.details?.skuCode ?? "",
    colour: gw.details?.colour ?? "",
    markings: gw.details?.markings ?? "",
  });

  const [compDraft, setCompDraft] = useState({
    status: gw.compliance?.status ?? "",
    expectedDate: gw.compliance?.expectedDate ?? "",
  });

  const [packDraft, setPackDraft] = useState({
    vendorName: gw.packaging?.vendorName ?? "",
    sampleId: gw.packaging?.sampleIdReceived ?? "",
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
    patch((w) => ({ ...w, purchaseNotifiedAt: t, purchaseLog: [...w.purchaseLog, { action: "Purchase team notified", timestamp: t }] }));
    log({ action: "Purchase team notified", timestamp: t });
    addNotification({ targetRoles: ["Purchase"], productId: product.id, productName: product.codeName, message: "You have been notified to place an order for this product." });
    showToast("Purchase team notified");
  }

  const NOTIFY_ALL: Role[] = ["CEO", "Dev", "Purchase"];

  function confirmOrder() {
    const t = now();
    patch((w) => ({ ...w, orderConfirmedAt: t, purchaseLog: [...w.purchaseLog, { action: "Order confirmed by purchase team", timestamp: t }] }));
    log({ action: "Order confirmed by purchase team", timestamp: t });
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: "Order confirmed — product details can now be filled in." });
    showToast("Order confirmed");
  }

  function saveDetails() {
    const t = now();
    const saved = { ...detailDraft, savedAt: t };
    const isEdit = !!gw.details;
    patch((w) => ({ ...w, details: saved }));
    log({ action: isEdit ? "Product details updated" : "Product details saved", timestamp: t, note: `${saved.productName} · ${saved.skuCode}` });
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: isEdit ? "Product details updated." : `Product details saved — ${saved.productName} · ${saved.skuCode}` });
    showToast(isEdit ? "Details updated" : "Details saved");
  }

  function saveCompliance() {
    const t = now();
    const isNew = !gw.compliance;
    const entry: ActivityEntry = { action: isNew ? "Compliance review started" : "Compliance details updated", timestamp: t };
    patch((w) => ({
      ...w,
      compliance: {
        status: compDraft.status, expectedDate: compDraft.expectedDate,
        confirmedAt: w.compliance?.confirmedAt ?? null,
        log: [...(w.compliance?.log ?? []), entry],
      },
    }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: isNew ? "Compliance review started." : "Compliance details updated." });
    showToast(isNew ? "Compliance review started" : "Compliance updated");
  }

  function confirmCompliance() {
    const t = now();
    const entry: ActivityEntry = { action: "Compliance confirmed", timestamp: t };
    patch((w) => ({ ...w, compliance: w.compliance ? { ...w.compliance, confirmedAt: t, log: [...w.compliance.log, entry] } : w.compliance }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: "Compliance confirmed ✓" });
    showToast("Compliance confirmed");
  }

  function setPackagingStep(field: "vendorSetAt" | "sampleReceivedAt" | "releasedAt", label: string) {
    const t = now();
    const entry: ActivityEntry = { action: label, timestamp: t };
    patch((w) => ({ ...w, packaging: w.packaging ? { ...w.packaging, [field]: t, log: [...w.packaging.log, entry] } : w.packaging }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: label });
    showToast(label);
  }

  function initPackaging() {
    const t = now();
    const entry: ActivityEntry = { action: `Packaging vendor set: ${packDraft.vendorName}`, timestamp: t };
    patch((w) => ({
      ...w,
      packaging: {
        vendorName: packDraft.vendorName, vendorSetAt: t,
        sampleIdReceived: packDraft.sampleId,
        sampleReceivedAt: packDraft.sampleId ? t : null,
        keyLineDrawingAt: null, keyLineDrawingImageUrl: null, keyLineDrawingApprovedAt: null, keyLineDrawingRejectedAt: null,
        artworkStartedAt: null, artworkImageUrl: null, artworkApprovedAt: null, artworkRejectedAt: null,
        releasedAt: null,
        log: [entry, ...(packDraft.sampleId ? [{ action: `Packaging sample received — ${packDraft.sampleId}`, timestamp: t }] : [])],
      },
    }));
    log(entry);
    addNotification({ targetRoles: NOTIFY_ALL, productId: product.id, productName: product.codeName, message: `Packaging started — vendor: ${packDraft.vendorName}` });
    showToast("Packaging started");
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
    const entry: ActivityEntry = { action: isNew ? `Golden sample status: ${gsDraft.status}` : `Golden sample updated: ${gsDraft.status}`, timestamp: t };
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

  const detailsLocked = !gw.orderConfirmedAt;
  const tracksLocked = !gw.details;

  const stagesDone = [!!gw.orderConfirmedAt, !!gw.details, !!gw.compliance?.confirmedAt, !!gw.packaging?.releasedAt, gw.goldenSample?.status === "Received"];
  const progress = stagesDone.filter(Boolean).length;

  return (
    <div className="rounded-lg border border-[#1a3a6e]/50 bg-[#060f26] overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#1a3a6e]/40 px-6 py-4">
        <div className="flex-1 min-w-0">
          <p className="text-xl font-semibold text-white">{product.codeName}</p>
          <p className="text-xs text-[#90bce0] mt-0.5">{product.skuCode} · Deadline <span className="text-[#f0c060] font-semibold">{new Date(product.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></p>
        </div>
        <Chip color={PRIORITY_DOT[product.priority]} label={product.priority} />
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {stagesDone.map((done, i) => (
              <div key={i} className="h-2 w-8 rounded-full transition-colors" title={TRACK_LABELS[i]}
                style={{ background: done ? TRACK_COLORS[i] : "#1a2a4a" }} />
            ))}
          </div>
          <span className="text-xs text-[#5a8fc4] tabular-nums">{progress}/5</span>
        </div>
      </div>

      <div className="p-6 space-y-3">

        {/* Stage 1 — Purchase */}
        <div className="rounded-md border border-[#1a3a6e]/40 bg-[#060f26] px-5 py-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#90bce0]">1 — Purchase</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <Step done={!!gw.purchaseNotifiedAt} label="Purchase team notified" timestamp={gw.purchaseNotifiedAt} />
              {!gw.purchaseNotifiedAt && !isQA && (
                <button onClick={notifyPurchase} className="shrink-0 rounded-lg bg-[#1a4a8a] px-3 py-1.5 text-xs font-medium text-[#ddeeff] hover:opacity-90">Notify</button>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Step done={!!gw.orderConfirmedAt} label="Order confirmed" timestamp={gw.orderConfirmedAt} pending={gw.purchaseNotifiedAt ? "Awaiting purchase confirmation" : "—"} />
              {gw.purchaseNotifiedAt && !gw.orderConfirmedAt && !isQA && (
                <button onClick={confirmOrder} className="shrink-0 rounded-lg bg-[#1a4a8a] px-3 py-1.5 text-xs font-medium text-[#ddeeff] hover:opacity-90">Confirm order</button>
              )}
            </div>
          </div>
          <LogPanel entries={gw.purchaseLog} />
        </div>

        {/* Stage 2 — Product Details */}
        <div className={`rounded-md border px-5 py-4 ${detailsLocked ? "border-[#1a3a6e]/20 opacity-50" : "border-[#1a3a6e]/40 bg-[#060f26]"}`}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#90bce0]">2 — Product Details</p>
          {detailsLocked ? (
            <p className="text-xs text-[#3a5a8a]">Unlocks after order is confirmed.</p>
          ) : (
            <div className="space-y-3 mt-3">
              {gw.details && <p className="text-xs text-[#f0c060]">Last saved {fmt(gw.details.savedAt)}</p>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Product name" value={detailDraft.productName} onChange={isQA ? undefined : (v) => setDetailDraft((d) => ({ ...d, productName: v }))} placeholder="e.g. Aria Knit Tee" disabled={isQA} />
                <Field label="SKU code" value={detailDraft.skuCode} onChange={isQA ? undefined : (v) => setDetailDraft((d) => ({ ...d, skuCode: v }))} placeholder="e.g. URB-KT-001" disabled={isQA} />
                <Field label="Colour" value={detailDraft.colour} onChange={isQA ? undefined : (v) => setDetailDraft((d) => ({ ...d, colour: v }))} placeholder="e.g. Slate Blue" disabled={isQA} />
                <Field label="Markings" value={detailDraft.markings} onChange={isQA ? undefined : (v) => setDetailDraft((d) => ({ ...d, markings: v }))} placeholder="e.g. Embossed logo, EU label" disabled={isQA} />
              </div>
              {!isQA && (
                <button onClick={saveDetails} className="w-full rounded-md bg-[#1a4a8a] py-2.5 text-sm font-medium text-[#ddeeff] hover:opacity-90">
                  {gw.details ? "Update details" : "Save details"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Stage 3 — Tracks (unlocked after details saved) */}
        {!tracksLocked ? (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#5a8fc4] px-1">3 — Parallel Tracks</p>

            {/* Compliance */}
            <TrackCard title="Compliance" color="#a78bfa" done={!!gw.compliance?.confirmedAt}>
              <div className="space-y-3 mt-1">
                {!isQA && (
                  <>
                    <Field label="Status" value={compDraft.status} onChange={(v) => setCompDraft((d) => ({ ...d, status: v }))} placeholder="e.g. Under review" />
                    <Field label="Expected date" type="date" value={compDraft.expectedDate} onChange={(v) => setCompDraft((d) => ({ ...d, expectedDate: v }))} />
                    <div className="flex gap-2">
                      <button onClick={saveCompliance} className="flex-1 rounded-md bg-[#1a3a6e]/60 py-2 text-xs font-medium text-[#ddeeff] hover:bg-[#1a4a8a]">
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
                    <p className="text-xs text-[#90bce0]">Status: <span className="text-[#ddeeff]">{gw.compliance.status}</span></p>
                    {gw.compliance.expectedDate && <p className="text-xs text-[#90bce0]">Expected: <span className="text-[#f0c060]">{gw.compliance.expectedDate}</span></p>}
                    {gw.compliance.confirmedAt && <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={11} /> Confirmed {fmt(gw.compliance.confirmedAt)}</p>}
                  </div>
                )}
                {gw.compliance && <LogPanel entries={gw.compliance.log} />}
              </div>
            </TrackCard>

            {/* Packaging */}
            <TrackCard title="Packaging" color="#38bdf8" done={!!gw.packaging?.releasedAt}>
              <div className="space-y-2 mt-1">
                {!gw.packaging ? (
                  !isQA ? (
                    <div className="space-y-3">
                      <Field label="Vendor name" value={packDraft.vendorName} onChange={(v) => setPackDraft((d) => ({ ...d, vendorName: v }))} placeholder="e.g. PackCo Ltd" />
                      <Field label="Packaging sample ID" value={packDraft.sampleId} onChange={(v) => setPackDraft((d) => ({ ...d, sampleId: v }))} placeholder="e.g. PKG-0091" />
                      <button onClick={initPackaging} disabled={!packDraft.vendorName} className="w-full rounded-md bg-[#1a3a6e]/60 py-2 text-xs font-medium text-[#ddeeff] hover:bg-[#1a4a8a] disabled:opacity-40">
                        Start packaging
                      </button>
                    </div>
                  ) : <p className="text-xs text-[#3a5a8a]">Not started yet.</p>
                ) : (
                  <div className="space-y-3">
                    {/* Vendor + Sample */}
                    <Step done={!!gw.packaging.vendorSetAt} label={`Vendor: ${gw.packaging.vendorName}`} timestamp={gw.packaging.vendorSetAt} />
                    <div>
                      <Step done={!!gw.packaging.sampleReceivedAt} label={`Sample${gw.packaging.sampleIdReceived ? ` — ${gw.packaging.sampleIdReceived}` : ""} received`} timestamp={gw.packaging.sampleReceivedAt} />
                      {!isQA && !gw.packaging.sampleReceivedAt && (
                        <button onClick={() => setPackagingStep("sampleReceivedAt", `Packaging sample received — ${gw.packaging!.sampleIdReceived}`)} className="ml-6 mt-1 rounded-lg bg-[#1a3a6e]/60 px-3 py-1 text-xs text-[#ddeeff] hover:bg-[#1a4a8a]">Mark received</button>
                      )}
                    </div>

                    {/* Key Line Drawing */}
                    {gw.packaging.sampleReceivedAt && (
                      <div className="rounded-lg border border-[#1a3a6e]/40 bg-[#020b1e]/40 p-3 space-y-2">
                        <p className="text-xs font-normal uppercase tracking-wide text-[#90bce0]">Key Line Drawing</p>

                        {gw.packaging.keyLineDrawingImageUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={gw.packaging.keyLineDrawingImageUrl} alt="Key line drawing" className="w-full rounded-lg object-contain max-h-48 bg-[#0a1e42]" />
                            <p className="text-[10px] text-[#5a8fc4]">Uploaded {fmt(gw.packaging.keyLineDrawingAt)}</p>
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
                                  <button onClick={() => kldFileRef.current?.click()} className="w-full rounded-lg border border-dashed border-[#1a3a6e]/50 py-1.5 text-xs text-[#90bce0] hover:bg-[#0a1e42]">Re-upload</button>
                                )}
                              </div>
                            )}
                          </>
                        ) : !isQA ? (
                          <button onClick={() => kldFileRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#1a3a6e]/50 py-4 text-xs text-[#5a8fc4] hover:bg-[#0a1e42]">
                            <span className="text-lg">↑</span> Upload image
                          </button>
                        ) : (
                          <p className="text-xs text-[#3a5a8a]">No image uploaded yet.</p>
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
                      <div className="rounded-lg border border-[#1a3a6e]/40 bg-[#020b1e]/40 p-3 space-y-2">
                        <p className="text-xs font-normal uppercase tracking-wide text-[#90bce0]">Artwork</p>

                        {gw.packaging.artworkImageUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={gw.packaging.artworkImageUrl} alt="Artwork" className="w-full rounded-lg object-contain max-h-48 bg-[#0a1e42]" />
                            <p className="text-[10px] text-[#5a8fc4]">Uploaded {fmt(gw.packaging.artworkStartedAt)}</p>
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
                                  <button onClick={() => artFileRef.current?.click()} className="w-full rounded-lg border border-dashed border-[#1a3a6e]/50 py-1.5 text-xs text-[#90bce0] hover:bg-[#0a1e42]">Re-upload</button>
                                )}
                              </div>
                            )}
                          </>
                        ) : !isQA ? (
                          <button onClick={() => artFileRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#1a3a6e]/50 py-4 text-xs text-[#5a8fc4] hover:bg-[#0a1e42]">
                            <span className="text-lg">↑</span> Upload artwork
                          </button>
                        ) : (
                          <p className="text-xs text-[#3a5a8a]">No artwork uploaded yet.</p>
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
                          <button onClick={() => setPackagingStep("releasedAt", "Packaging and user manual released")} className="ml-6 mt-1 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-500/20">Mark released</button>
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
                      <span className="mb-1.5 block text-xs font-normal uppercase tracking-wide text-[#90bce0]">Status</span>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        {(["Not started", "Requested", "In progress", "Received"] as GoldenSampleStatus[]).map((s) => (
                          <button key={s} type="button" onClick={() => setGsDraft((d) => ({ ...d, status: s }))}
                            className={`rounded-lg border py-1.5 text-xs font-medium transition ${gsDraft.status === s ? "border-[#e8a020] bg-[#e8a020]/20 text-[#e8a020]" : "border-[#1a3a6e]/50 bg-[#0a1e42] text-[#5a8fc4] hover:bg-[#0d2550]"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Field label="Expected date" type="date" value={gsDraft.expectedDate} onChange={(v) => setGsDraft((d) => ({ ...d, expectedDate: v }))} />
                    <button onClick={saveGoldenSample} className="w-full rounded-md bg-[#1a3a6e]/60 py-2 text-xs font-medium text-[#ddeeff] hover:bg-[#1a4a8a]">
                      {gw.goldenSample ? "Update" : "Start tracking"}
                    </button>
                  </>
                )}
                {gw.goldenSample && (
                  <div className="space-y-1">
                    <p className="text-xs text-[#90bce0]">Status: <span className={gw.goldenSample.status === "Received" ? "text-green-400" : "text-[#e8a020]"}>{gw.goldenSample.status}</span></p>
                    {gw.goldenSample.expectedDate && <p className="text-xs text-[#90bce0]">Expected: <span className="text-[#f0c060]">{gw.goldenSample.expectedDate}</span></p>}
                    {gw.goldenSample.receivedAt && <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={11} /> Received {fmt(gw.goldenSample.receivedAt)}</p>}
                  </div>
                )}
                {gw.goldenSample && <LogPanel entries={gw.goldenSample.log} />}
              </div>
            </TrackCard>
          </div>
        ) : gw.orderConfirmedAt ? (
          <div className="rounded-md border border-dashed border-[#1a3a6e]/50 px-5 py-4 text-xs text-[#5a8fc4]">
            Complete Stage 2 (product details) to unlock the parallel tracks.
          </div>
        ) : null}

      </div>
    </div>
  );
}

// ─── Mini progress bar used in the switcher ───────────────────────────────────

const TRACK_COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#fb923c", "#fbbf24"];
const TRACK_LABELS = ["Order", "Details", "Compliance", "Packaging", "Golden Sample"];

function MiniProgress({ stages }: { stages: boolean[] }) {
  return (
    <div className="flex gap-1 mt-1.5">
      {stages.map((done, i) => (
        <div key={i} title={TRACK_LABELS[i]}
          className="h-1.5 flex-1 rounded-full transition-colors"
          style={{ background: done ? TRACK_COLORS[i] : "#1a2a4a" }} />
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
    if (p.status !== "Approved" || !p.goldenWorkflow) return false;
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
      <h1 className="text-2xl font-semibold text-white">Golden Product</h1>
      <p className="mt-1 text-sm text-[#90bce0]">Post-approval workflow — purchase, details, compliance, packaging, golden sample.</p>
      {isQA && <p className="mt-1 text-xs text-[#f0c060]">You are in read-only mode.</p>}

      {approved.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-[#1a3a6e]/50 px-5 py-16 text-center text-sm text-[#5a8fc4]">
          No approved products yet. Approve a product from NPD Testing.
        </div>
      ) : (
        <>
          {/* Product switcher bar */}
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {approved.map((p) => {
              const gw = p.goldenWorkflow!;
              const stages = [!!gw.orderConfirmedAt, !!gw.details, !!gw.compliance?.confirmedAt, !!gw.packaging?.releasedAt, gw.goldenSample?.status === "Received"];
              const done = stages.filter(Boolean).length;
              const active = p.id === (selected?.id ?? -1);
              return (
                <button key={p.id} onClick={() => setSelectedId(p.id)}
                  className={`shrink-0 rounded-md border px-4 py-3 text-left transition min-w-[160px] ${active ? "border-[#38bdf8]/60 bg-[#0a1e42]" : "border-[#1a3a6e]/40 bg-[#060f26] hover:bg-[#0a1e42]/60"}`}>
                  <p className={`text-sm font-medium truncate ${active ? "text-white" : "text-[#90bce0]"}`}>{p.codeName}</p>
                  <p className="text-[10px] text-[#5a8fc4] mt-0.5 tabular-nums">{done}/5 complete</p>
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
