"use client";

import { useState, useEffect } from "react";
import { parseServerDate } from "@/lib/datetime";
import { AppShell } from "@/components/AppShell";
import { useProducts, Status, ProductRow } from "@/lib/products-context";
import { api, apiErrorMessage } from "@/lib/api";
import { Modal } from "@/components/Modal";
import { getSession, Session } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { GridBeam } from "@/components/ui/grid-beam";
import { FileText, X } from "lucide-react";

// ─── shared stage pills ─────────────────────────────────────────────────────

const STAGE_PILL_STYLE: Record<string, string> = {
  "NPD TESTING: PENDING":    "bg-[#eff6ff] text-[#64748b] border-[#bfdbfe]/60",
  "NPD TESTING: PASS":       "bg-green-500/15 text-green-400 border-green-500/30",
  "NPD TESTING: FAIL":       "bg-red-500/15 text-red-400 border-red-500/30",
  "EMAILED TO FACTORY":      "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "IMPROVEMENT REQUIREMENT": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "DECISION PENDING":        "bg-amber-500/10 text-amber-500 border-amber-500/30",
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

function fmt(value: string | null) {
  if (!value) return null;
  return parseServerDate(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function fmtDate(value: string | null) {
  if (!value) return null;
  return parseServerDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
}

function getAddedToNpdDate(p: ProductRow): string | null {
  return p.activityLog[0]?.timestamp ?? null;
}

// ─── NPD Report modal ────────────────────────────────────────────────────────

function SingleReport({ report, version, label }: { report: { fileName: string | null; fileDataUrl: string | null; outcome: "Pass" | "Not Pass"; notes: string; submittedAt: string }; version: number; label?: string }) {
  const isPass = report.outcome === "Pass";
  const isPdf = report.fileName?.toLowerCase().endsWith(".pdf") ?? false;
  return (
    <div className="rounded-md border border-[#bfdbfe]/40 bg-[#f8faff] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">v{version} {label ?? ""} Report</span>
        <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${isPass ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
          {isPass ? "Pass" : "Fail"}
        </span>
        <span className="text-[11px] text-[#94a3b8] ml-auto">Submitted {parseServerDate(report.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })}</span>
      </div>
      {report.notes ? (
        <div className="rounded-md border border-[#bfdbfe]/30 bg-white px-3 py-2 text-xs text-[#0f172a] whitespace-pre-wrap leading-relaxed">{report.notes}</div>
      ) : (
        <p className="text-xs text-[#94a3b8]">No observations recorded.</p>
      )}
      {report.fileName && report.fileDataUrl && (
        isPdf ? (
          <iframe src={report.fileDataUrl} className="w-full rounded-md border border-[#bfdbfe]/30" style={{ height: "300px" }} title={`v${version} NPD Report`} />
        ) : (
          <a href={report.fileDataUrl} download={report.fileName} className="flex items-center gap-2 rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] px-3 py-2 text-xs text-[#0f172a] hover:bg-[#dbeafe] transition">
            <span className="flex-1 truncate">{report.fileName}</span>
            <span className="text-[#1d4ed8] ml-auto">Download</span>
          </a>
        )
      )}
    </div>
  );
}

function ReportModal({ p, onClose }: { p: ProductRow; onClose: () => void }) {
  const [fullscreen, setFullscreen] = useState(false);
  const report = p.npdReport;
  if (!report) return null;
  const isPass = report.outcome === "Pass";
  const isPdf = report.fileName?.toLowerCase().endsWith(".pdf") ?? false;
  const allReports = p.npdReports ?? [];
  const hasHistory = allReports.length > 0;

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-white">
        {/* Fullscreen header */}
        <div className="flex items-center justify-between border-b border-[#bfdbfe]/30 px-5 py-3 shrink-0">
          <div>
            <p className="font-semibold text-slate-900">{p.codeName} — NPD Report</p>
            <p className="mt-0.5 text-xs text-[#64748b]">Submitted {fmt(report.submittedAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${isPass ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
              {isPass ? "Pass" : "Fail"}
            </span>
            <button onClick={() => setFullscreen(false)} title="Collapse" className="rounded border border-[#bfdbfe]/50 px-2 py-1 text-xs text-[#64748b] hover:bg-[#eff6ff] transition">
              ⊠ Collapse
            </button>
            <button onClick={onClose} className="text-[#94a3b8] hover:text-[#1d4ed8] transition"><X size={18} /></button>
          </div>
        </div>

        {/* Fullscreen body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left — observations */}
          <div className="w-72 shrink-0 overflow-y-auto border-r border-[#bfdbfe]/30 px-5 py-5 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1.5">QA Observations</p>
              {report.notes ? (
                <div className="rounded-md border border-[#bfdbfe]/40 bg-[#eff6ff] px-3 py-2.5 text-sm text-[#0f172a] whitespace-pre-wrap leading-relaxed">
                  {report.notes}
                </div>
              ) : (
                <p className="text-xs text-[#94a3b8]">No observations recorded.</p>
              )}
            </div>
            {report.fileName && report.fileDataUrl && !isPdf && (
              <a href={report.fileDataUrl} download={report.fileName}
                className="flex items-center gap-3 rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] px-3 py-2.5 hover:bg-[#dbeafe] transition">
                <FileText size={16} className="text-[#3b82f6] shrink-0" />
                <span className="text-sm text-[#0f172a] truncate">{report.fileName}</span>
                <span className="ml-auto text-xs text-[#1d4ed8]">Download</span>
              </a>
            )}
            {!report.fileName && <p className="text-xs text-[#94a3b8]">No file attached.</p>}
          </div>
          {/* Right — PDF or placeholder */}
          <div className="flex-1 overflow-hidden bg-[#f8faff]">
            {isPdf && report.fileDataUrl ? (
              <iframe src={report.fileDataUrl} className="h-full w-full" title="NPD Report" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-[#94a3b8]">{report.fileName ? "Not a PDF — use Download button on the left." : "No file attached."}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-[85vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[#bfdbfe]/30 px-5 py-4">
        <div>
          <p className="font-semibold text-slate-900">{p.codeName} — NPD Report</p>
          <p className="mt-0.5 text-xs text-[#64748b]">Submitted {fmt(report.submittedAt)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setFullscreen(true)} title="Expand fullscreen"
            className="rounded border border-[#bfdbfe]/50 px-2 py-1 text-xs text-[#64748b] hover:bg-[#eff6ff] transition">
            ⛶ Expand
          </button>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#1d4ed8] transition"><X size={18} /></button>
        </div>
      </div>

      <div className="px-5 py-5 space-y-5">
        {/* Outcome badge */}
        <div className={`rounded-md border px-4 py-3 ${isPass ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
          <p className="text-[10px] uppercase tracking-wide text-[#64748b] mb-0.5">NPD Outcome</p>
          <p className={`text-2xl font-bold ${isPass ? "text-green-400" : "text-red-400"}`}>
            {isPass ? "✓ Pass" : "✕ Fail"}
          </p>
        </div>

        {/* Observations */}
        {report.notes ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1.5">QA Observations</p>
            <div className="rounded-md border border-[#bfdbfe]/40 bg-[#eff6ff] px-4 py-3 text-sm text-[#0f172a] whitespace-pre-wrap leading-relaxed">
              {report.notes}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#94a3b8]">No observations recorded.</p>
        )}

        {/* Attached file */}
        {report.fileName && report.fileDataUrl && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1.5">Attached Report</p>
            {isPdf ? (
              <iframe
                src={report.fileDataUrl}
                className="w-full rounded-md border border-[#bfdbfe]/40"
                style={{ height: "420px" }}
                title="NPD Report"
              />
            ) : (
              <a
                href={report.fileDataUrl}
                download={report.fileName}
                className="flex items-center gap-3 rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] px-4 py-3 hover:bg-[#dbeafe] transition"
              >
                <FileText size={18} className="text-[#3b82f6] shrink-0" />
                <span className="text-sm text-[#0f172a]">{report.fileName}</span>
                <span className="ml-auto text-xs text-[#1d4ed8]">Download</span>
              </a>
            )}
          </div>
        )}

        {!report.fileName && (
          <p className="text-xs text-[#94a3b8]">No file was attached to this report.</p>
        )}

        {/* Historical reports from previous versions */}
        {hasHistory && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#64748b] mb-2">Previous Sample Reports</p>
            <div className="space-y-3">
              {allReports.map((r, i) => (
                <SingleReport key={i} report={r} version={r.version} label="Sample" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Verdict types ───────────────────────────────────────────────────────────

type VerdictType = "approve" | "hold" | "reject";

interface VerdictState {
  productId: number;
  type: VerdictType;
  remarks: string;
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DecisionPendingPage() {
  const { products, addNotification, refreshProducts, search } = useProducts();
  const { showToast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => { setSession(getSession()); }, []);

  const isReadOnly = false;

  // verdict popup modal
  const [verdict, setVerdict] = useState<VerdictState | null>(null);
  // report modal
  const [reportId, setReportId] = useState<number | null>(null);

  const q = search.toLowerCase();
  const visible = products
    .filter((p) => {
      if (p.status !== "Pending Decision") return false;
      if (p.factoryComm?.improvementSampleExpected) return false;
      if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
      return true;
    })
    .sort((a, b) => {
      const ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
      return ORDER[a.priority] - ORDER[b.priority];
    });

  function openVerdict(id: number, type: VerdictType) {
    setVerdict({ productId: id, type, remarks: "" });
  }

  function closeVerdict() { setVerdict(null); }

  async function confirmVerdict() {
    if (!verdict) return;
    const p = products.find((x) => x.id === verdict.productId); if (!p) return;

    let decision: string;
    if (verdict.type === "approve") decision = "Approved";
    else if (verdict.type === "hold") decision = "On hold";
    else decision = "Rejected";

    try {
      await api.products.submitDecision(p.id, decision, verdict.remarks || undefined, p.version);
      await refreshProducts();

      if (verdict.type === "approve") {
        addNotification({ targetRoles: ["CEO", "Dev", "Sales"], productId: p.id, productName: p.codeName, message: `${p.codeName} approved — Sales/CEO to place order.` });
        showToast(`${p.codeName} approved — awaiting order`);
      } else if (verdict.type === "hold") {
        addNotification({ targetRoles: ["Dev"], productId: p.id, productName: p.codeName, message: `${p.codeName} put on hold — email factory and await response.` });
        showToast(`${p.codeName} sent to On Hold`);
      } else {
        addNotification({ targetRoles: ["CEO"], productId: p.id, productName: p.codeName, message: `${p.codeName} rejected — CEO review needed.` });
        showToast(`${p.codeName} sent to Rejected`);
      }
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    }

    closeVerdict();
  }

  const reportProduct = products.find((x) => x.id === reportId) ?? null;

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Decision Pending</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">
        Products that completed NPD testing and are waiting for a verdict.
      </p>

      <GridBeam rows={6} cols={8} colorVariant="ocean" theme="dark" active className="mt-6 overflow-hidden rounded-md border border-[#bfdbfe]/40 bg-[#ffffff]/80">
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#bfdbfe]/40 text-[#0f172a]">
                {/* report viewer button col */}
                <th className="pl-3 pr-1 py-3 w-10" />
                {/* thumbnail */}
                <th className="pl-2 pr-2 py-3 w-14" />
                <th className="px-4 py-3 font-medium">
                  Product Name
                </th>
                <th className="px-4 py-3 font-medium">
                  NPD Result
                </th>
                <th className="px-4 py-3 font-medium">
                  Product Stages
                </th>
                {!isReadOnly && (
                  <th className="px-4 py-3 font-medium">
                    Product Verdict
                  </th>
                )}
                <th className="px-4 py-3 font-medium">
                  Timeline
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={isReadOnly ? 6 : 7} className="px-5 py-16 text-center">
                    <p className="text-sm text-[#64748b]">No products waiting for a decision.</p>
                    <p className="mt-1 text-xs text-[#94a3b8]">Products appear here once QA submits an NPD report.</p>
                  </td>
                </tr>
              ) : (
                visible.map((p) => {
                  const isPass = p.npdReport?.outcome === "Pass";

                  return (
                    <tr key={p.id} className="border-b border-[#bfdbfe]/20">
                        {/* Report viewer button */}
                        <td className="pl-3 pr-1 py-3">
                          {p.npdReport ? (
                            <button
                              onClick={() => setReportId(p.id)}
                              title="View NPD report & observations"
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfdbfe]/50 text-[#3b82f6] hover:bg-[#eff6ff] hover:border-[#93c5fd] transition"
                            >
                              <FileText size={14} />
                            </button>
                          ) : (
                            <div className="h-8 w-8" />
                          )}
                        </td>

                        {/* Thumbnail */}
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

                        {/* Product */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-900 leading-snug">{p.codeName}</p>
                            {(p.sampleVersion ?? 1) >= 1 && (
                              <span className="rounded-md border border-purple-500/50 bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-600">
                                v{p.sampleVersion ?? 1}{p.factoryComm?.improvementSampleExpected ? " Improvement" : ""}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode}</p>
                        </td>

                        {/* NPD result */}
                        <td className="px-4 py-3">
                          {p.npdReport ? (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              isPass ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-400"
                            }`}>
                              {isPass ? "✓ Pass" : "✕ Fail"}
                            </span>
                          ) : (
                            <span className="text-xs text-[#94a3b8]">—</span>
                          )}
                        </td>

                        {/* Stages */}
                        <td className="px-4 py-3 max-w-xs">
                          <StagePills stages={getPipelineTrail(p)} />
                        </td>

                        {/* Verdict buttons */}
                        {!isReadOnly && (
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5 flex-wrap">
                              {([
                                { type: "approve" as VerdictType, label: "✓ Approve", cls: "border-green-500/30 bg-green-500/5 text-green-500 hover:bg-green-500/15" },
                                { type: "hold"    as VerdictType, label: "⏸ Hold",    cls: "border-[#bfdbfe]/50 bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe]" },
                                { type: "reject"  as VerdictType, label: "✕ Reject",  cls: "border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/15" },
                              ]).map(({ type, label, cls }) => (
                                <button key={type} onClick={() => openVerdict(p.id, type)}
                                  className={`rounded border px-2.5 py-1 text-xs font-medium transition ${cls}`}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </td>
                        )}

                        {/* Timeline — sent to NPD / report uploaded / sent to decision */}
                        <td className="px-4 py-3 tabular-nums whitespace-nowrap text-[11px]">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[#64748b]">Sample received: <span className="text-[#0f172a] font-medium">{fmtDate(p.sampleGivenDate ?? null) ?? "—"}</span></span>
                            <span className="text-[#64748b]">Report submitted: <span className="text-[#0f172a] font-medium">{fmtDate(p.npdReport?.submittedAt ?? null) ?? "—"}</span></span>
                            <span className="text-[#64748b]">Added here: <span className="text-[#d97706] font-medium">{fmtDate(p.statusChangedAt ?? null) ?? "—"}</span></span>
                          </div>
                        </td>
                      </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GridBeam>

      {/* NPD Report viewer modal */}
      <Modal open={!!reportProduct} onClose={() => setReportId(null)}>
        {reportProduct && <ReportModal p={reportProduct} onClose={() => setReportId(null)} />}
      </Modal>

      {/* Verdict popup modal */}
      <Modal open={!!verdict} onClose={closeVerdict}>
        {verdict && (() => {
          const p = products.find((x) => x.id === verdict.productId);
          if (!p) return null;
          const colorMap = { approve: "green", hold: "amber", reject: "red" } as const;
          const c = colorMap[verdict.type];
          const titleMap = { approve: "Approve product", hold: "Put on Hold", reject: "Reject product" };
          const placeholderMap = {
            approve: "Why is this being approved? (optional)",
            hold: "What needs to be fixed? What is the factory being asked to do?",
            reject: "Why is this being rejected? (optional)",
          };
          const confirmMap = { approve: "Confirm Approve", hold: "Confirm Hold", reject: "Confirm Reject" };
          const btnCls = {
            approve: "bg-green-500 hover:bg-green-600",
            hold: "bg-amber-500 hover:bg-amber-600",
            reject: "bg-red-500 hover:bg-red-600",
          };
          const labelCls = {
            approve: "text-green-500",
            hold: "text-amber-400",
            reject: "text-red-400",
          };
          return (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-[#bfdbfe]/30 pb-4">
                <div>
                  <p className="font-semibold text-slate-900">{p.codeName}</p>
                  <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode}</p>
                </div>
                <button onClick={closeVerdict} className="text-[#94a3b8] hover:text-[#1d4ed8] transition shrink-0"><X size={18} /></button>
              </div>

              <p className={`text-xs font-semibold uppercase tracking-wide ${labelCls[verdict.type]}`}>
                {titleMap[verdict.type]}
              </p>

              {/* Remarks from previous stages */}
              {(() => {
                const entries: { label: string; text: string; color: string }[] = [];
                if (p.npdReport?.notes) entries.push({ label: "NPD testing notes", text: p.npdReport.notes, color: "border-[#bfdbfe]/40 bg-[#eff6ff] text-[#1d4ed8]" });
                if (p.factoryComm?.replyText) entries.push({ label: "Factory reply", text: p.factoryComm.replyText, color: "border-[#93c5fd]/30 bg-[#eff6ff] text-[#1d4ed8]" });
                if (p.factoryComm?.internalDecisionNotes) entries.push({ label: "Internal decision notes", text: p.factoryComm.internalDecisionNotes, color: "border-[#93c5fd]/30 bg-[#eff6ff] text-[#1d4ed8]" });
                if (p.orderDecision?.improvementNotes) entries.push({ label: "Improvement requirement", text: p.orderDecision.improvementNotes, color: "border-purple-400/30 bg-purple-500/5 text-purple-700" });
                if (entries.length === 0) return null;
                return (
                  <div className="rounded-md border border-[#bfdbfe]/40 bg-[#f8faff] px-4 py-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">Remarks from previous stages</p>
                    {entries.map((e, i) => (
                      <div key={i} className={`rounded-md border px-3 py-2 ${e.color}`}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70 mb-0.5">{e.label}</p>
                        <p className="text-sm italic leading-snug">"{e.text}"</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              <textarea
                value={verdict.remarks}
                onChange={(e) => setVerdict((v) => v ? { ...v, remarks: e.target.value } : v)}
                placeholder={placeholderMap[verdict.type]}
                rows={3}
                className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#f8faff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#94a3b8] resize-none"
              />

              <div className="flex justify-start gap-2 pt-1">
                <button onClick={confirmVerdict}
                  className={`rounded-md px-4 py-2 text-xs font-semibold text-white transition ${btnCls[verdict.type]}`}>
                  {confirmMap[verdict.type]}
                </button>
                <button onClick={closeVerdict}
                  className="rounded-md border border-[#bfdbfe]/50 px-4 py-2 text-xs text-[#64748b] hover:bg-[#eff6ff] transition">
                  Cancel
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </AppShell>
  );
}
