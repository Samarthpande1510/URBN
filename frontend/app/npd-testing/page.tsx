"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { useProducts, ProductRow } from "@/lib/products-context";
import { api } from "@/lib/api";
import { PRIORITY_DOT, STATUS_DOT } from "@/lib/colors";
import { Chip } from "@/components/Chip";
import { Modal } from "@/components/Modal";
import { NpdForm } from "@/components/NpdForm";
import { getSession } from "@/lib/auth";
import { GridBeam } from "@/components/ui/grid-beam";
import { FileText, X } from "lucide-react";

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

  // ── Step 1: NPD Testing (always first) ──
  if (!p.npdReport) {
    stages.push("NPD TESTING: PENDING");
    return stages;
  }
  stages.push(p.npdReport.outcome === "Pass" ? "NPD TESTING: PASS" : "NPD TESTING: FAIL");

  // ── Rejected / Archived ──
  if (p.status === "Rejected" || p.status === "Archived") {
    stages.push("REJECTED");
    return stages;
  }

  // ── On Hold / Improvement sample: awaiting or received physical sample ──
  if (p.status === "On hold" || (v > 1 && fc && !gw)) {
    stages.push("EMAILED TO FACTORY");
    stages.push("REVISED SAMPLE REQUESTED");
    const sampleReceived = !!fc?.improvementSampleReceivedAt;
    if (!sampleReceived) {
      stages.push("REVISED SAMPLE PENDING");
    } else if (p.npdReport && v > 1) {
      stages.push("REVISED SAMPLE RECEIVED");
      stages.push(p.npdReport.outcome === "Pass" ? "REVISED TESTING: PASS" : "REVISED TESTING: FAIL");
    } else {
      stages.push("REVISED SAMPLE RECEIVED");
    }
    return stages;
  }

  // ── Improvement sample: in NPD Testing ──
  if (v > 1 && fc && p.status === "Pending NPD") {
    stages.push("EMAILED TO FACTORY");
    stages.push("REVISED SAMPLE REQUESTED");
    stages.push("REVISED SAMPLE RECEIVED");
    stages.push("REVISED TESTING: PENDING");
    return stages;
  }

  // ── Approved / Golden workflow ──
  if (p.status === "Approved" || p.status === "Pending NPD" || p.status === "Pending Decision") {
    if (fc?.replyReceivedAt) {
      stages.push("EMAILED TO FACTORY");
      stages.push("REVISED SAMPLE REQUESTED");
      stages.push("REVISED SAMPLE RECEIVED");
    }
    if (!gw?.purchaseNotifiedAt) {
      stages.push("GOLDEN SAMPLES PENDING");
      return stages;
    }
    stages.push("PURCHASE TEAM NOTIFIED");
    if (gw.orderConfirmedAt) stages.push("ORDER CONFIRMED");
    if (gw.details) stages.push("PRODUCT DETAILS SAVED");
    if (gw.details?.bomConfirmedAt) stages.push("BOM CONFIRMED");
    const compTracks = gw.compliance?.tracks ?? [];
    if (compTracks.length > 0) {
      stages.push(compTracks.every((t) => t.confirmedAt) ? "COMPLIANCE CONFIRMED" : "COMPLIANCE INITIATED");
    }
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

function fmt(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function getAddedDate(p: ProductRow): string | null {
  return p.activityLog[0]?.timestamp ?? p.statusChangedAt ?? null;
}

function DeadlineBadge({ deadline }: { deadline?: string | null }) {
  if (!deadline) return null;
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0)  return <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">{Math.abs(days)}d overdue</span>;
  if (days <= 3) return <span className="rounded bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-400">{days}d left</span>;
  if (days <= 7) return <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">{days}d left</span>;
  return null;
}

function NpdResultChip({ p }: { p: ProductRow }) {
  if (!p.npdReport) return <span className="text-xs text-[#94a3b8]">—</span>;
  const pass = p.npdReport.outcome === "Pass";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      pass ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-400"
    }`}>
      {pass ? "✓ Pass" : "✕ Fail"}
    </span>
  );
}

type VersionedReport = { version: number; fileName: string | null; fileDataUrl: string | null; outcome: "Pass" | "Not Pass"; notes: string; submittedAt: string };

function NpdReportsViewer({ reports, onClose }: { reports: VersionedReport[]; onClose: () => void }) {
  const versions = [...new Set(reports.map((r) => r.version))].sort((a, b) => b - a);
  const [activeV, setActiveV] = useState(versions[0] ?? 1);
  const [fullscreen, setFullscreen] = useState(false);
  const report = reports.find((r) => r.version === activeV);
  const isPass = report?.outcome === "Pass";
  const isPdf = report?.fileName?.toLowerCase().endsWith(".pdf") ?? false;

  const tabs = (
    <div className="flex gap-1.5 flex-wrap px-5 pt-4 pb-3 border-b border-[#bfdbfe]/30">
      {versions.map((v) => {
        const r = reports.find((x) => x.version === v);
        const p = r?.outcome === "Pass";
        return (
          <button key={v} onClick={() => setActiveV(v)}
            className={`rounded-md border px-3 py-1 text-xs font-semibold transition ${activeV === v
              ? p ? "border-green-500 bg-green-500/15 text-green-600" : "border-red-500 bg-red-500/15 text-red-500"
              : "border-[#bfdbfe]/50 bg-white text-[#64748b] hover:bg-[#eff6ff]"}`}>
            v{v} {r ? (p ? "✓" : "✕") : ""}
          </button>
        );
      })}
    </div>
  );

  if (fullscreen) return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-[#bfdbfe]/30 px-5 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <p className="font-semibold text-slate-900">NPD Reports</p>
          {report && <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${isPass ? "border-green-500/30 bg-green-500/10 text-green-500" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>{isPass ? "Pass" : "Fail"}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFullscreen(false)} className="rounded border border-[#bfdbfe]/50 px-2 py-1 text-xs text-[#64748b] hover:bg-[#eff6ff]">⊠ Collapse</button>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#1d4ed8]"><X size={18} /></button>
        </div>
      </div>
      {tabs}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 shrink-0 border-r border-[#bfdbfe]/30 overflow-y-auto px-5 py-4 space-y-3">
          {report?.notes ? <div className="rounded-md border border-[#bfdbfe]/40 bg-[#eff6ff] px-3 py-2.5 text-sm whitespace-pre-wrap leading-relaxed">{report.notes}</div> : <p className="text-xs text-[#94a3b8]">No observations recorded.</p>}
        </div>
        <div className="flex-1 overflow-hidden bg-[#f8faff]">
          {isPdf && report?.fileDataUrl ? <iframe src={report.fileDataUrl} className="h-full w-full" title="NPD Report" /> : <div className="flex h-full items-center justify-center"><p className="text-sm text-[#94a3b8]">{report?.fileName ? "Not a PDF — no preview available." : "No file attached."}</p></div>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-h-[85vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-0">
        <p className="font-semibold text-slate-900">NPD Reports</p>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setFullscreen(true)} className="rounded border border-[#bfdbfe]/50 px-2 py-1 text-xs text-[#64748b] hover:bg-[#eff6ff]">⛶ Expand</button>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#1d4ed8]"><X size={18} /></button>
        </div>
      </div>
      {tabs}
      {report ? (
        <div className="px-5 py-4 space-y-4">
          <div className={`rounded-md border px-4 py-3 ${isPass ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
            <p className="text-[10px] uppercase tracking-wide text-[#64748b] mb-0.5">v{activeV} NPD Outcome</p>
            <p className={`text-2xl font-bold ${isPass ? "text-green-400" : "text-red-400"}`}>{isPass ? "✓ Pass" : "✕ Fail"}</p>
            <p className="text-[11px] text-[#94a3b8] mt-0.5">Submitted {new Date(report.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })}</p>
          </div>
          {report.notes ? (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1.5">QA Observations</p>
              <div className="rounded-md border border-[#bfdbfe]/40 bg-[#eff6ff] px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed">{report.notes}</div>
            </div>
          ) : <p className="text-xs text-[#94a3b8]">No observations recorded.</p>}
          {isPdf && report.fileDataUrl && <iframe src={report.fileDataUrl} className="w-full rounded-md border border-[#bfdbfe]/40" style={{ height: 420 }} title="NPD Report" />}
          {report.fileName && !isPdf && <p className="text-xs text-[#94a3b8]">File attached: {report.fileName} (no preview — not a PDF)</p>}
          {!report.fileName && <p className="text-xs text-[#94a3b8]">No file attached.</p>}
        </div>
      ) : <p className="px-5 py-4 text-xs text-[#94a3b8]">No report for this version.</p>}
    </div>
  );
}

function PrevReportsPanel({ p }: { p: ProductRow }) {
  const [open, setOpen] = useState(true);
  const v = p.sampleVersion ?? 1;
  const prev = (p.npdReports ?? []).filter((r) => r.version !== v);
  const received = p.factoryComm?.improvementSampleReceivedAt;
  if (prev.length === 0 && !received) return null;

  return (
    <div className="border-b border-[#bfdbfe]/30 px-5 py-4 space-y-2 bg-purple-400/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">Improvement Sample v{v}</p>
          {received && <p className="text-[11px] text-[#64748b] mt-0.5">Sample received: {new Date(received).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })}</p>}
        </div>
        {prev.length > 0 && (
          <button onClick={() => setOpen((s) => !s)} className="text-xs text-[#1d4ed8] hover:underline">
            {open ? "Hide" : "Show"} {prev.length} previous report{prev.length > 1 ? "s" : ""}
          </button>
        )}
      </div>
      {open && prev.map((r, i) => {
        const pass = r.outcome === "Pass";
        return (
          <div key={i} className={`rounded-md border p-3 ${pass ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold text-[#64748b]">v{r.version}</span>
              <span className={`text-[11px] font-bold ${pass ? "text-green-500" : "text-red-400"}`}>{pass ? "✓ Pass" : "✕ Fail"}</span>
              <span className="text-[11px] text-[#94a3b8]">{new Date(r.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })}</span>
              {r.fileName && r.fileDataUrl && (
                <a href={r.fileDataUrl} download={r.fileName} className="ml-auto text-xs text-[#1d4ed8] underline">Download</a>
              )}
            </div>
            {r.notes && <p className="text-xs text-[#0f172a] whitespace-pre-wrap leading-relaxed">{r.notes}</p>}
          </div>
        );
      })}
    </div>
  );
}

type NpdFilter = "Pending" | "Pass" | "Fail";
const NPD_FILTERS: NpdFilter[] = ["Pending", "Pass", "Fail"];

export default function NpdTestingPage() {
  const { products, setProducts, refreshProducts, search } = useProducts();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [prevReportsId, setPrevReportsId] = useState<number | null>(null);
  const [npdFilter, setNpdFilter] = useState<NpdFilter>("Pending");
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null);
  useEffect(() => { setSession(getSession()); }, []);

  const q = search.toLowerCase();

  const filterProduct = (p: ProductRow) => {
    if (q && !p.codeName.toLowerCase().includes(q) && !(p.factory ?? "").toLowerCase().includes(q) && !p.skuCode.toLowerCase().includes(q)) return false;
    if (npdFilter === "Pending") return p.status === "Pending NPD";
    if (npdFilter === "Pass")    return !!p.npdReport && p.npdReport.outcome === "Pass";
    if (npdFilter === "Fail")    return !!p.npdReport && p.npdReport.outcome === "Not Pass";
    return false;
  };

  const visible = products
    .filter(filterProduct)
    .sort((a, b) => {
      // For Pending tab: improvement sample products (v2+) float to top
      if (npdFilter === "Pending") {
        const aV = (a.sampleVersion ?? 1) > 1 ? 1 : 0;
        const bV = (b.sampleVersion ?? 1) > 1 ? 1 : 0;
        if (bV !== aV) return bV - aV;
      }
      return (getAddedDate(b) ?? "").localeCompare(getAddedDate(a) ?? "");
    });

  const counts = {
    Pending: products.filter((p) => p.status === "Pending NPD").length,
    Pass:    products.filter((p) => !!p.npdReport && p.npdReport.outcome === "Pass" && p.status !== "Pending NPD").length,
    Fail:    products.filter((p) => !!p.npdReport && p.npdReport.outcome === "Not Pass" && p.status !== "Pending NPD").length,
  };

  const selected = products.find((p) => p.id === selectedId) ?? null;

  const showHistory = npdFilter === "Pass" || npdFilter === "Fail";

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">NPD Testing</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">Products waiting for QA testing and a full history of pass/fail results.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {NPD_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setNpdFilter(f)}
            className={`rounded border px-4 py-1.5 text-sm transition ${
              npdFilter === f
                ? f === "Pass"
                  ? "border-green-600 bg-green-600 text-white font-medium shadow-sm"
                  : f === "Fail"
                  ? "border-red-500 bg-red-500 text-white font-medium shadow-sm"
                  : "border-blue-600 bg-blue-600 text-white font-medium shadow-sm"
                : "border-blue-100 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-200"
            }`}
          >
            {f} <span className="ml-1 opacity-70 tabular-nums">{counts[f]}</span>
          </button>
        ))}
      </div>

      <GridBeam rows={6} cols={8} colorVariant="colorful" theme="dark" active className="mt-4 overflow-hidden rounded-md border border-[#bfdbfe]/40 bg-[#ffffff]/80">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#bfdbfe]/40 text-[#0f172a]">
                <th className="pl-3 pr-1 py-3 w-10" />
                <th className="pl-2 pr-2 py-3 w-14" />
                <th className="px-4 py-3 font-medium">
                  Product Name
                </th>
                <th className="px-4 py-3 font-medium">
                  Priority
                </th>
                {showHistory ? (
                  <>
                    <th className="px-4 py-3 font-medium">
                      Current Stage
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Product Stages
                    </th>
                  </>
                ) : (
                  <th className="px-4 py-3 font-medium">
                    Current stage
                  </th>
                )}
                <th className="px-4 py-3 font-medium text-center">
                  Timeline
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={showHistory ? 6 : 7} className="px-5 py-16 text-center">
                    <p className="text-sm text-[#64748b]">
                      {npdFilter === "Pending" ? "No products pending NPD testing." : `No products with a ${npdFilter} result yet.`}
                    </p>
                    <p className="mt-1 text-xs text-[#94a3b8]">
                      {npdFilter === "Pending" ? "Once a product is added it will appear here for QA to test." : "Results will appear here once QA submits an NPD report."}
                    </p>
                  </td>
                </tr>
              ) : (
                visible.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => npdFilter === "Pending" ? setSelectedId(p.id) : undefined}
                    className={`border-b border-[#bfdbfe]/30 transition last:border-0 ${npdFilter === "Pending" ? "cursor-pointer hover:bg-[#eff6ff]" : ""}`}
                  >
                    <td className="pl-3 pr-1 py-3" onClick={(e) => e.stopPropagation()}>
                      {(p.sampleVersion ?? 1) > 1 ? (
                        <button
                          onClick={() => setPrevReportsId(p.id)}
                          title="View previous NPD reports"
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfdbfe]/50 text-[#3b82f6] hover:bg-[#eff6ff] hover:border-[#93c5fd] transition">
                          <FileText size={14} />
                        </button>
                      ) : <div className="h-8 w-8" />}
                    </td>
                    <td className="pl-2 pr-2 py-3">
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
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 leading-snug">{p.codeName}</p>
                        {(p.sampleVersion ?? 1) >= 1 && (
                          <span className="rounded-md border border-purple-500/50 bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-600">
                            v{p.sampleVersion ?? 1}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode}</p>
                      {p.factoryComm?.improvementSampleExpected && p.factoryComm.improvementSampleReceivedAt && (
                        <p className="text-[10px] text-purple-500 mt-0.5">Sample received: {new Date(p.factoryComm.improvementSampleReceivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
                    </td>
                    {showHistory ? (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Chip color={STATUS_DOT[p.status]} label={p.status} />
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <StagePills stages={getPipelineTrail(p)} />
                        </td>
                      </>
                    ) : (
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex flex-wrap gap-1.5">
                          <StagePills stages={getPipelineTrail(p)} />
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 tabular-nums text-[#d97706] whitespace-nowrap text-center">
                      {showHistory ? (
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span> Sample received: {p.sampleGivenDate ? new Date(p.sampleGivenDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" }) : "—"}</span>
                          <span className="text-[#94a3b8]">Report submitted: {p.npdReport?.submittedAt ? fmt(p.npdReport.submittedAt) : "—"}</span>
                        </div>
                      ) : (
                        p.sampleGivenDate
                          ? <span className="text-green-600 text-xs font-medium">✓ {new Date(p.sampleGivenDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })}</span>
                          : <span className="text-[#94a3b8] text-xs">Not received</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GridBeam>

      {/* Previous reports viewer modal */}
      <Modal open={!!prevReportsId} onClose={() => setPrevReportsId(null)}>
        {prevReportsId && (() => {
          const rp = products.find((x) => x.id === prevReportsId);
          if (!rp) return null;
          const archived = rp.npdReports ?? [];
          // If no archived reports yet but product has a current npdReport, treat it as v(sampleVersion-1)
          const prevV = (rp.sampleVersion ?? 1) - 1;
          const synth = archived.length === 0 && rp.npdReport
            ? [{ version: prevV, ...rp.npdReport }]
            : archived;
          const allReports = [...synth].sort((a, b) => b.version - a.version);
          return <NpdReportsViewer reports={allReports} onClose={() => setPrevReportsId(null)} />;
        })()}
      </Modal>

      {/* NPD form modal — only for Pending tab */}
      <Modal open={!!selected} onClose={() => setSelectedId(null)}>
        {selected && (
          <>
            {/* Previous reports for improvement sample products */}
            {selected.factoryComm?.improvementSampleExpected && (selected.npdReports ?? []).length > 0 && (
              <PrevReportsPanel p={selected} />
            )}
            <NpdForm key={selected.id} p={selected} onSubmit={() => setSelectedId(null)} />
            <div className="px-5 pb-5">
              <button onClick={() => setSelectedId(null)} className="w-full rounded-md border border-[#bfdbfe]/50 py-2 text-sm text-[#64748b] hover:bg-[#eff6ff]">Close</button>
            </div>
          </>
        )}
      </Modal>
    </AppShell>
  );
}
