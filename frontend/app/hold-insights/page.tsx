"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { useProducts, ProductRow, FactoryComm, FactoryReplySummary, InternalDecision, HoldCaseEntry, Status, NpdReport } from "@/lib/products-context";
import { getSession, Session, Role } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { api, apiErrorMessage } from "@/lib/api";
import { GridBeam } from "@/components/ui/grid-beam";
import { X, FileText } from "lucide-react";

const ALL_ROLES: Role[] = ["CEO", "Dev", "Sales", "QA"];

type Stage = "Factory Not Responded" | "Factory Decision Pending" | "Internal Decision Pending" | "Resolved";

function computeStage(fc: FactoryComm | undefined, p: ProductRow): Stage {
  if (fc?.internalDecision) return "Resolved";
  // Improvement sample: sample received AND NPD report submitted → internal decision
  if (fc?.improvementSampleExpected && fc?.improvementSampleReceivedAt && p.status === "On hold" && p.npdReport) return "Internal Decision Pending";
  if (!fc?.replyReceivedAt) return "Factory Not Responded";
  if (fc.replySummary === "Decision Pending" && !fc.partialResolvedAt) return "Factory Decision Pending";
  return "Internal Decision Pending";
}

const STAGE_STYLE: Record<Stage, string> = {
  "Factory Not Responded":     "border-[#93c5fd]/40 bg-[#eff6ff] text-[#1d4ed8]",
  "Factory Decision Pending":  "border-orange-500/30 bg-orange-500/10 text-orange-500",
  "Internal Decision Pending": "border-amber-500/30 bg-amber-500/10 text-amber-500",
  "Resolved":                  "border-green-500/30 bg-green-500/10 text-green-500",
};

const STAGE_LABEL: Record<Stage, string> = {
  "Factory Not Responded":     "Factory Not Responded",
  "Factory Decision Pending":  "Awaiting Factory Decision",
  "Internal Decision Pending": "Internal Decision Pending",
  "Resolved":                  "Resolved",
};

type CaseSource = "On Hold" | "Improvement Sample";

interface HoldCase {
  product: ProductRow;
  fc: FactoryComm | undefined;
  source: CaseSource;
  stage: Stage;
}

function getImprovementPipeline(p: ProductRow): { label: string; done: boolean; active: boolean }[] {
  const v = p.sampleVersion ?? 1;
  const fc = p.factoryComm;
  const received = fc?.improvementSampleReceivedAt;
  const inNpd = p.status === "Pending NPD";
  // Only use npdReport as this version's result if the sample was actually received (guards against stale v-1 report showing for v)
  const vReport = received
    ? (p.npdReports?.slice().reverse().find((r) => r.version === v) ?? (p.npdReport && !inNpd ? { ...p.npdReport, version: v } : null))
    : null;
  const hasResult = !!vReport;

  const steps: { label: string; done: boolean; active: boolean }[] = [];

  steps.push({
    label: `Sample v${v}: Awaiting Physical Sample`,
    done: !!received || inNpd || hasResult,
    active: !received && !inNpd && !hasResult,
  });

  if (received || inNpd || hasResult) {
    steps.push({
      label: `Sample v${v}: Received${received ? ` — ${fmtDate(received)}` : ""}`,
      done: inNpd || hasResult,
      active: !!received && !inNpd && !hasResult,
    });
    steps.push({
      label: hasResult
        ? `Sample v${v}: NPD Testing — ${vReport!.outcome === "Pass" ? "Pass ✓" : "Fail ✕"}`
        : `Sample v${v}: Awaiting NPD Testing Results`,
      done: hasResult,
      active: inNpd && !hasResult,
    });
  }

  if (hasResult) {
    steps.push({
      label: `Sample v${v}: Internal Decision`,
      done: false,
      active: true,
    });
  }

  return steps;
}

function defaultFactoryComm(now: string): FactoryComm {
  return {
    decidedAction: "EMAIL_FACTORY", decidedAt: now, acknowledgedAt: null, replyAt: null, replyText: null,
    tentativeReturnDate: null, editHistory: [], caseLog: [],
  };
}

function fmt(v: string | null | undefined) {
  if (!v) return null;
  return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtAt(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} at ${time}`;
}
function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

type Filter = "All" | "Factory Not Responded" | "Factory Decision Pending" | "Internal Decision Pending" | "Improvement Sample";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "All", label: "All" },
  { key: "Factory Not Responded", label: "Factory Not Responded" },
  { key: "Factory Decision Pending", label: "Awaiting Factory Decision" },
  { key: "Internal Decision Pending", label: "Internal Decision Pending" },
  { key: "Improvement Sample", label: "Improvement Sample" },
];

export default function HoldInsightsPage() {
  const { products, setProducts, addNotification, search, refreshProducts } = useProducts();
  const { showToast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reportViewId, setReportViewId] = useState<number | null>(null);
  useEffect(() => { setSession(getSession()); }, []);

  const isQA = false;
  const isReadOnly = false;

  // ── Build the unified list of hold cases ──
  const cases: HoldCase[] = products
    .filter((p) => {
      if (p.status === "On hold") return true;
      // Improvement sample loop: in NPD Testing or NPD done (stays "On hold") — show in Hold Insights
      if (p.factoryComm?.improvementSampleExpected && (p.status === "Pending NPD" || p.status === "On hold")) return true;
      // Golden workflow improvement sample
      if (p.status === "Approved" && p.goldenWorkflow?.improvedGoldenSampleExpected && p.goldenWorkflow.goldenSample?.improvementFixed !== true) return true;
      return false;
    })
    .map((p) => {
      const isImprovementSample =
        p.factoryComm?.improvementSampleExpected === true ||
        (p.status === "Approved" && p.goldenWorkflow?.improvedGoldenSampleExpected && p.goldenWorkflow.goldenSample?.improvementFixed !== true);
      return {
        product: p,
        fc: p.factoryComm,
        source: isImprovementSample ? "Improvement Sample" as CaseSource : "On Hold" as CaseSource,
        stage: computeStage(p.factoryComm, p),
      };
    });

  // ── Reminder: notify everyone once per day when a reply is expected today ──
  useEffect(() => {
    const today = todayStr();
    const due = cases.filter((c) => c.stage === "Factory Not Responded" && c.fc?.expectedReplyDate === today && c.fc?.reminderSentForDate !== today);
    if (due.length === 0) return;
    due.forEach((c) => {
      addNotification({ targetRoles: ALL_ROLES, productId: c.product.id, productName: c.product.codeName, message: `Factory reply for ${c.product.codeName} is expected today.` });
    });
    setProducts((prev) => prev.map((p) => {
      const match = due.find((c) => c.product.id === p.id);
      if (!match || !p.factoryComm) return p;
      return { ...p, factoryComm: { ...p.factoryComm, reminderSentForDate: today } };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases.length]);

  const q = search.toLowerCase();
  const matchesSearch = (c: HoldCase) => !q || c.product.codeName.toLowerCase().includes(q) || (c.product.factory ?? "").toLowerCase().includes(q);

  const counts = {
    All: cases.filter(matchesSearch).length,
    "Factory Not Responded": cases.filter((c) => c.stage === "Factory Not Responded" && matchesSearch(c)).length,
    "Factory Decision Pending": cases.filter((c) => c.stage === "Factory Decision Pending" && matchesSearch(c)).length,
    "Internal Decision Pending": cases.filter((c) => c.stage === "Internal Decision Pending" && matchesSearch(c)).length,
    "Improvement Sample": cases.filter((c) => c.source === "Improvement Sample" && matchesSearch(c)).length,
  };

  const visible = cases.filter((c) => {
    if (!matchesSearch(c)) return false;
    if (filter === "All") return true;
    if (filter === "Improvement Sample") return c.source === "Improvement Sample";
    // Stage filters include improvement sample products too (they can be in both)
    return c.stage === filter;
  });

  const selected = cases.find((c) => c.product.id === selectedId) ?? null;

  function patchFC(productId: number, fn: (fc: FactoryComm) => FactoryComm) {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((p) => {
      if (p.id !== productId) return p;
      const base = p.factoryComm ?? defaultFactoryComm(now);
      return { ...p, factoryComm: fn(base), statusChangedAt: now };
    }));
  }

  function pushLog(productId: number, entry: HoldCaseEntry) {
    patchFC(productId, (fc) => ({ ...fc, caseLog: [...(fc.caseLog ?? []), entry] }));
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Hold</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">
        Deeper insight into every product on hold — factory replies, internal decisions, and the full history of each case.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded border px-4 py-1.5 text-sm transition ${
              filter === f.key ? "border-blue-600 bg-blue-600 text-white font-medium shadow-sm" : "border-blue-100 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-200"
            }`}>
            {f.label} <span className="ml-1 opacity-70 tabular-nums">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <GridBeam rows={6} cols={8} colorVariant="sunset" theme="dark" active className="mt-4 overflow-hidden rounded-md border border-[#bfdbfe]/40 bg-[#ffffff]/80">
        <div className="overflow-x-auto">
          <table className="min-w-[1600px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#bfdbfe]/40 text-[#0f172a]">
                <th className="pl-3 pr-1 py-3 w-10 shrink-0" />
                <th className="pl-2 pr-2 py-3 w-14 shrink-0" />
                <th className="px-4 py-3 font-medium w-36">Product<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Code name · Factory</p></th>
                <th className="px-4 py-3 font-medium w-40">Remarks<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Original feedback</p></th>
                <th className="px-4 py-3 font-medium w-28">Version<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Sample version</p></th>
                <th className="px-4 py-3 font-medium w-44">Sample Received<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Log date &amp; send to NPD</p></th>
                <th className="px-4 py-3 font-medium w-56">Revised Sample<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Improvement sample pipeline</p></th>
                <th className="px-4 py-3 font-medium w-56">Factory Status<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Current status &amp; history</p></th>
                <th className="px-4 py-3 font-medium w-32 whitespace-nowrap">Expected reply<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">By when factory should reply</p></th>
                {filter !== "Improvement Sample" && <>
                  <th className="px-4 py-3 font-medium w-32 whitespace-nowrap">Last updated<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Latest case activity</p></th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap w-28">Deadline</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={filter === "Improvement Sample" ? 9 : 11} className="px-5 py-16 text-center">
                  <p className="text-sm text-[#64748b]">No cases match this filter.</p>
                </td></tr>
              ) : (
                visible.map(({ product: p, fc, source, stage }) => (
                  <tr key={p.id} onClick={() => setSelectedId(p.id)} className="cursor-pointer border-b border-[#bfdbfe]/20 hover:bg-[#eff6ff] transition">
                    <td className="pl-3 pr-1 py-3" onClick={(e) => e.stopPropagation()}>
                      {source === "Improvement Sample" && p.npdReport ? (
                        <button
                          onClick={() => setReportViewId(p.id)}
                          title="View NPD report"
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfdbfe]/50 text-[#3b82f6] hover:bg-[#eff6ff] hover:border-[#93c5fd] transition">
                          <FileText size={14} />
                        </button>
                      ) : <div className="h-8 w-8" />}
                    </td>
                    <td className="pl-2 pr-2 py-3">
                      {p.imageDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageDataUrl} alt={p.codeName} className="h-12 w-12 rounded-md object-cover border border-[#bfdbfe]/40" />
                      ) : (
                        <div className="h-12 w-12 rounded-md border border-[#bfdbfe]/30 bg-[#eff6ff] flex items-center justify-center text-[10px] font-semibold text-[#2a4a6a]">{p.codeName.slice(0, 2).toUpperCase()}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 leading-snug">{p.codeName}</p>
                      <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode}</p>
                      {p.verdictRemarks && (
                        <p className="mt-1 text-[11px] text-amber-600 leading-snug italic">"{p.verdictRemarks}"</p>
                      )}
                    </td>
                    <td className="px-4 py-3 w-40">
                      {p.verdictRemarks ? (
                        <p className="text-xs text-amber-700 italic leading-snug break-words whitespace-normal">"{p.verdictRemarks}"</p>
                      ) : <span className="text-xs text-[#94a3b8]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md border border-purple-500/50 bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-600">
                        v{p.sampleVersion ?? 1}{source === "Improvement Sample" ? " Improvement" : " On Hold"}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                      {source === "Improvement Sample" ? (
                        <ImprovSampleRowAction p={p} showToast={showToast} addNotification={addNotification} refreshProducts={refreshProducts} />
                      ) : <span className="text-xs text-[#94a3b8]">—</span>}
                    </td>
                    <td className="px-4 py-3 w-56">
                      {source === "Improvement Sample" ? (
                        <div className="flex flex-col gap-1.5 items-start">
                          {getImprovementPipeline(p).map((step, i) => {
                            const isNpdPass = step.done && step.label.includes("NPD Testing — Pass");
                            return (
                              <span key={i} title={step.label} className={`block w-full rounded border px-2 py-0.5 text-[10px] truncate max-w-[200px] ${
                                isNpdPass ? "border-green-600/50 bg-green-600/15 text-green-700 font-bold"
                                : step.active ? "border-amber-500/40 bg-amber-500/10 text-amber-600 font-medium"
                                : step.done ? "border-green-500/30 bg-green-500/10 text-green-600 font-medium"
                                : "border-[#bfdbfe]/60 bg-[#eff6ff] text-[#64748b] font-medium"
                              }`}>{step.label}</span>
                            );
                          })}
                        </div>
                      ) : <span className="text-xs text-[#94a3b8]">—</span>}
                    </td>
                    <td className="px-4 py-3 w-56">
                      <div className="flex flex-col gap-1.5 items-start">
                        <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${STAGE_STYLE[stage]}`}>{STAGE_LABEL[stage]}</span>
                        {[...(fc?.caseLog ?? [])].reverse().slice(0, 2).map((entry, i) => {
                          const text = entry.note ?? entry.stage;
                          return (
                            <span key={i} title={text} className="block w-full rounded border border-[#bfdbfe]/60 bg-[#eff6ff] px-2 py-0.5 text-[10px] text-[#64748b] truncate max-w-[200px]">
                              {text}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#1d4ed8] whitespace-nowrap">{fc?.expectedReplyDate ? fmtDate(fc.expectedReplyDate) : "—"}</td>
                    {filter !== "Improvement Sample" && <>
                      <td className="px-4 py-3 text-xs text-[#d97706] whitespace-nowrap">{p.statusChangedAt ? fmtDate(p.statusChangedAt) : "—"}</td>
                      <td className="px-4 py-3 text-right text-xs text-[#d97706] whitespace-nowrap">{fmtDate(p.deadline)}</td>
                    </>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GridBeam>

      {/* NPD report viewer modal */}
      <Modal open={!!reportViewId} onClose={() => setReportViewId(null)}>
        {reportViewId && (() => {
          const rp = products.find((x) => x.id === reportViewId);
          if (!rp) return null;
          const v = rp.sampleVersion ?? 1;
          const allReports = [
            ...(rp.npdReports ?? []),
            ...(rp.npdReport ? [{ version: v, ...rp.npdReport }] : []),
          ].filter((r, i, arr) => arr.findIndex((x) => x.version === r.version && x.submittedAt === r.submittedAt) === i)
           .sort((a, b) => b.version - a.version);
          return <HoldNpdReportsViewer reports={allReports} onClose={() => setReportViewId(null)} />;
        })()}
      </Modal>

      {/* Detail modal */}
      <Modal open={!!selected} onClose={() => setSelectedId(null)}>
        {selected && (
          <HoldCaseDetail
            holdCase={selected}
            isQA={isQA}
            isReadOnly={isReadOnly}
            session={session}
            onClose={() => setSelectedId(null)}
            patchFC={patchFC}
            pushLog={pushLog}
            setProducts={setProducts}
            addNotification={addNotification}
            showToast={showToast}
            refreshProducts={refreshProducts}
          />
        )}
      </Modal>
    </AppShell>
  );
}

// ─── Improvement Sample NPD section (shown in modal for improvement sample products) ──

function ImprovSampleRowAction({ p, showToast, addNotification, refreshProducts }: {
  p: ProductRow;
  showToast: (msg: string) => void;
  addNotification: ReturnType<typeof useProducts>["addNotification"];
  refreshProducts: () => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const v = p.sampleVersion ?? 1;
  const received = p.factoryComm?.improvementSampleReceivedAt;
  const inNpd = p.status === "Pending NPD";

  async function markReceived(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.products.factoryImprovementSampleReceived(p.id, date || undefined, p.version);
      await api.products.factoryCaseLog(p.id, "Improvement Sample", `Sample v${v} received${date ? ` — ${fmtDate(date)}` : ""} · sent to NPD Testing`);
      await refreshProducts();
      addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `Improvement sample v${v} received for ${p.codeName} — sent to NPD Testing.` });
      showToast(`Sample v${v} received — sent to NPD Testing`);
    } catch (e) {
      const { message } = apiErrorMessage(e);
      showToast(message);
    }
  }

  if (inNpd) {
    return (
      <div>
        <p className="text-[11px] font-semibold text-amber-600">In NPD Testing</p>
        {received && <p className="text-[10px] text-[#94a3b8] mt-0.5">Received {fmtDate(received)}</p>}
      </div>
    );
  }
  if (received) {
    return (
      <div>
        <span className="inline-block rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-600">✓ Received</span>
        <p className="text-[10px] text-[#64748b] mt-0.5">{fmtDate(received)}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <input type="date" value={date} onChange={(e) => { e.stopPropagation(); setDate(e.target.value); }}
        className="w-full rounded border border-purple-400/30 bg-white px-2 py-1 text-[10px] text-[#0f172a] outline-none focus:border-purple-400" />
      <button onClick={markReceived}
        className="w-full rounded border border-purple-400/50 bg-purple-400/10 px-2 py-1 text-[10px] font-semibold text-purple-500 hover:bg-purple-400/20 transition">
        Mark Received
      </button>
    </div>
  );
}

type VReport = { version: number; fileName: string | null; fileDataUrl: string | null; outcome: "Pass" | "Not Pass"; notes: string; submittedAt: string };

function HoldNpdReportsViewer({ reports, onClose }: { reports: VReport[]; onClose: () => void }) {
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
        <div className="w-72 shrink-0 border-r border-[#bfdbfe]/30 overflow-y-auto px-5 py-4">
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
            <p className="text-[11px] text-[#94a3b8] mt-0.5">Submitted {new Date(report.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
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

function NpdReportCard({ r, version }: { r: { fileName: string | null; fileDataUrl: string | null; outcome: "Pass" | "Not Pass"; notes: string; submittedAt: string }; version: number }) {
  const pass = r.outcome === "Pass";
  return (
    <div className={`rounded-md border p-3 ${pass ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-[#64748b]">v{version}</span>
        <span className={`text-xs font-bold ${pass ? "text-green-500" : "text-red-400"}`}>{pass ? "✓ Pass" : "✕ Fail"}</span>
        <span className="text-[11px] text-[#94a3b8]">{new Date(r.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        {r.fileName && r.fileDataUrl && (
          <a href={r.fileDataUrl} download={r.fileName} className="ml-auto text-xs text-[#1d4ed8] underline">Download</a>
        )}
      </div>
      {r.notes && <p className="text-xs text-[#0f172a] whitespace-pre-wrap leading-relaxed">{r.notes}</p>}
    </div>
  );
}

function ImprovNpdSection({ p, showToast, addNotification, refreshProducts }: {
  p: ProductRow;
  showToast: (msg: string) => void;
  addNotification: ReturnType<typeof useProducts>["addNotification"];
  refreshProducts: () => Promise<void>;
}) {
  const [showPrevReports, setShowPrevReports] = useState(false);
  const [receivedDate, setReceivedDate] = useState("");
  const v = p.sampleVersion ?? 1;
  const fc = p.factoryComm;
  const received = fc?.improvementSampleReceivedAt;
  const inNpd = p.status === "Pending NPD";
  // Only use npdReport for this version if the sample was actually received (guards against stale prior-version report)
  const vReport = received
    ? (p.npdReports?.slice().reverse().find((r) => r.version === v) ?? (p.npdReport && !inNpd ? { ...p.npdReport, version: v } : null))
    : null;
  const prevReports = (p.npdReports ?? []).filter((r) => r.version !== v);

  async function markReceived() {
    try {
      await api.products.factoryImprovementSampleReceived(p.id, receivedDate || undefined, p.version);
      await api.products.factoryCaseLog(p.id, "Improvement Sample", `Sample v${v} received${receivedDate ? ` — ${fmtDate(receivedDate)}` : ""}`);
      await refreshProducts();
      addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `Improvement sample v${v} received for ${p.codeName}.` });
      showToast(`Sample v${v} received`);
      setReceivedDate("");
    } catch (e) {
      const { message } = apiErrorMessage(e);
      showToast(message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">Sample v{v} — NPD Result</p>
        {prevReports.length > 0 && (
          <button onClick={() => setShowPrevReports((s) => !s)}
            className="flex items-center gap-1.5 rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-1 text-xs text-[#1d4ed8] hover:bg-[#dbeafe] transition">
            <FileText size={11} />
            {showPrevReports ? "Hide" : "View"} Previous Reports ({prevReports.length})
          </button>
        )}
      </div>

      {/* Previous reports */}
      {showPrevReports && prevReports.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-[#64748b]">Previous Reports</p>
          {prevReports.map((r, i) => <NpdReportCard key={i} r={r} version={r.version} />)}
        </div>
      )}

      {/* Current state */}
      {inNpd ? (
        <div className="rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2.5 space-y-0.5">
          <p className="text-xs text-amber-600 font-medium">In NPD Testing — awaiting QA report</p>
          {received && <p className="text-[11px] text-[#94a3b8]">Sample received: {fmtDate(received)}</p>}
        </div>
      ) : vReport ? (
        <div className={`rounded-md border p-3 ${vReport.outcome === "Pass" ? "border-green-500/30 bg-green-500/8" : "border-red-500/30 bg-red-500/8"}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-bold ${vReport.outcome === "Pass" ? "text-green-500" : "text-red-400"}`}>
              {vReport.outcome === "Pass" ? "✓ Pass" : "✕ Fail"} — v{v}
            </span>
            <span className="text-[11px] text-[#94a3b8]">{fmtDate(vReport.submittedAt)}</span>
          </div>
          {vReport.notes && <p className="text-xs text-[#0f172a] whitespace-pre-wrap leading-relaxed">{vReport.notes}</p>}
        </div>
      ) : received ? (
        <div className="rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2.5">
          <p className="text-xs text-green-600 font-medium">Sample Received — {fmtDate(received)}</p>
        </div>
      ) : (
        // Sample not yet received
        <div className="rounded-md border border-purple-400/30 bg-purple-400/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-purple-500">Mark Sample Received</p>
          <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)}
            className="w-full rounded-md border border-purple-400/30 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-purple-400" />
          <button onClick={markReceived}
            className="w-full rounded-md border border-purple-400/50 bg-purple-400/15 py-2 text-xs font-semibold text-purple-500 hover:bg-purple-400/25 transition">
            Mark Sample v{v} Received
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Next-version toggle for improvement sample products in factory stage panels ─

function ImprovSampleNextVersionSection({ source, p, showNextImprovCard, setShowNextImprovCard, improvSampleTick, setImprovSampleTick, improvSampleDate, setImprovSampleDate, markImprovementSample }: {
  source: CaseSource;
  p: ProductRow;
  showNextImprovCard: boolean;
  setShowNextImprovCard: (v: boolean) => void;
  improvSampleTick: boolean;
  setImprovSampleTick: (v: boolean) => void;
  improvSampleDate: string;
  setImprovSampleDate: (v: string) => void;
  markImprovementSample: () => void;
}) {
  if (source === "On Hold") {
    return <ImprovSampleCard tick={improvSampleTick} setTick={setImprovSampleTick} date={improvSampleDate} setDate={setImprovSampleDate} onConfirm={markImprovementSample} nextVersion={(p.sampleVersion ?? 1) + 1} />;
  }
  // Improvement sample — show as a collapsible "Not happy?" option
  return (
    <div className="space-y-1">
      <button onClick={() => setShowNextImprovCard(!showNextImprovCard)}
        className="w-full text-xs text-purple-500 hover:underline text-left">
        {showNextImprovCard ? "▾ Hide" : `▸ Not happy with the sample? Request v${(p.sampleVersion ?? 1) + 1} →`}
      </button>
      {showNextImprovCard && (
        <ImprovSampleCard tick={improvSampleTick} setTick={setImprovSampleTick} date={improvSampleDate} setDate={setImprovSampleDate} onConfirm={markImprovementSample} nextVersion={(p.sampleVersion ?? 1) + 1} />
      )}
    </div>
  );
}

// ─── Improvement Sample card (reused across all stage panels) ────────────────

function ImprovSampleCard({ tick, setTick, date, setDate, onConfirm, nextVersion }: {
  tick: boolean;
  setTick: (v: boolean) => void;
  date: string;
  setDate: (v: string) => void;
  onConfirm: () => void;
  nextVersion: number;
}) {
  return (
    <div className="mt-3 rounded-md border border-purple-400/40 bg-purple-400/5 p-3 space-y-2">
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" checked={tick} onChange={(e) => setTick(e.target.checked)} className="h-4 w-4 rounded accent-purple-400" />
        <span className="text-xs font-semibold text-purple-500">Improvement Sample Expected — will be tracked as <span className="rounded border border-purple-400/40 bg-purple-400/10 px-1.5 py-0.5 font-mono">v{nextVersion}</span></span>
      </label>
      {tick && (
        <>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            placeholder="Expected by date"
            className="w-full rounded-md border border-purple-400/30 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-purple-400" />
          <button onClick={onConfirm}
            className="w-full rounded-md border border-purple-400/50 bg-purple-400/15 py-2 text-xs font-semibold text-purple-500 hover:bg-purple-400/25 transition">
            Confirm — Move to Improvement Sample (v{nextVersion})
          </button>
        </>
      )}
    </div>
  );
}

// ─── Detail modal content ───────────────────────────────────────────────────

function HoldCaseDetail({ holdCase, isQA, isReadOnly, session, onClose, patchFC, pushLog, setProducts, addNotification, showToast, refreshProducts }: {
  holdCase: HoldCase;
  isQA: boolean;
  isReadOnly: boolean;
  session: Session | null;
  onClose: () => void;
  patchFC: (productId: number, fn: (fc: FactoryComm) => FactoryComm) => void;
  pushLog: (productId: number, entry: HoldCaseEntry) => void;
  setProducts: ReturnType<typeof useProducts>["setProducts"];
  addNotification: ReturnType<typeof useProducts>["addNotification"];
  showToast: (msg: string) => void;
  refreshProducts: () => Promise<void>;
}) {
  const { product: p, fc, source, stage } = holdCase;
  const canAct = !isReadOnly;

  const [expectedDate, setExpectedDate] = useState(fc?.expectedReplyDate ?? "");
  const [replySummary, setReplySummary] = useState<FactoryReplySummary | "">("");
  const [replyNotes, setReplyNotes] = useState("");
  const [partialNotes, setPartialNotes] = useState("");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [improvementNeeded, setImprovementNeeded] = useState(false);
  const [improvementRemarks, setImprovementRemarks] = useState("");
  const [sendBackDate, setSendBackDate] = useState("");
  const [sendBackNote, setSendBackNote] = useState("");
  const [showSendBack, setShowSendBack] = useState(false);
  const [showOrderPlaceForm, setShowOrderPlaceForm] = useState(false);
  const [orderColors, setOrderColors] = useState<{ color: string; quantity: string }[]>([{ color: "", quantity: "" }]);
  const [improvSampleTick, setImprovSampleTick] = useState(false);
  const [improvSampleDate, setImprovSampleDate] = useState("");
  const [showNextImprovCard, setShowNextImprovCard] = useState(false);

  const now = () => new Date().toISOString();

  async function logAwaitingReply() {
    if (!expectedDate) return;
    try {
      await api.products.factoryExpectedDate(p.id, expectedDate, p.version);
      await api.products.factoryCaseLog(p.id, "Factory Not Responded", `Feedback shared — awaiting factory reply by ${fmtDate(expectedDate)}`);
      await refreshProducts();
      addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `${p.codeName} — awaiting factory reply by ${fmtDate(expectedDate)}.` });
      showToast("Logged — awaiting factory reply");
    } catch (e) {
      const { message } = apiErrorMessage(e);
      showToast(message);
      if ((e as { isConflict?: boolean }).isConflict) await refreshProducts();
    }
  }

  async function logFactoryReply() {
    if (!replySummary) return;
    const displaySummary = replySummary === "Decision Pending" ? "Awaiting Factory Decision" : replySummary;
    try {
      await api.products.factoryLogReply(p.id, replySummary, replyNotes || undefined, p.version);
      await api.products.factoryCaseLog(p.id, "Factory Replied", `Reply received — ${displaySummary}${replyNotes ? ` · ${replyNotes}` : ""}`);
      await refreshProducts();
      addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `${p.codeName} — factory replied: ${displaySummary}.` });
      showToast("Factory reply logged");
      setReplySummary(""); setReplyNotes("");
    } catch (e) {
      const { message } = apiErrorMessage(e);
      showToast(message);
      if ((e as { isConflict?: boolean }).isConflict) await refreshProducts();
    }
  }

  async function logPartialResolved() {
    try {
      await api.products.factoryPartialResolved(p.id, partialNotes || undefined, p.version);
      await api.products.factoryCaseLog(p.id, "Factory Decision Pending", `Factory finalized pending points${partialNotes ? ` — ${partialNotes}` : ""}`);
      await refreshProducts();
      showToast("Factory decision logged");
      setPartialNotes("");
    } catch (e) {
      const { message } = apiErrorMessage(e);
      showToast(message);
    }
  }

  async function markAwaitingImprovSample() {
    try {
      await api.products.factoryCaseLog(p.id, "Internal Decision Pending", "Awaiting improvement sample results before final decision");
      await refreshProducts();
      showToast("Marked — awaiting improvement sample results");
    } catch (e) {
      const { message } = apiErrorMessage(e);
      showToast(message);
    }
  }

  async function applyInternalDecision(decision: "Approved" | "Rejected") {
    try {
      await api.products.factoryInternalDecision(p.id, {
        decision,
        notes: decisionNotes.trim() || undefined,
        improvement_needed: improvementNeeded,
        improvement_remarks: improvementNeeded ? (improvementRemarks.trim() || undefined) : undefined,
      }, p.version);
      await refreshProducts();
      const by = session?.name ?? "Unknown";
      const verb = decision === "Approved" ? `${by} has approved` : `${by} has rejected`;
      addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `${verb} for ${p.codeName}.` });
      showToast(`${decision} — case resolved`);
      setDecisionNotes(""); setImprovementNeeded(false); setImprovementRemarks("");
      onClose();
    } catch (e) {
      const { message } = apiErrorMessage(e);
      showToast(message);
      if ((e as { isConflict?: boolean }).isConflict) await refreshProducts();
    }
  }

  function setOrderColor(i: number, field: "color" | "quantity", value: string) {
    setOrderColors((prev) => prev.map((c, j) => j === i ? { ...c, [field]: value } : c));
  }

  async function confirmOrderPlace() {
    const validColors = orderColors.filter((c) => c.color.trim()).map((c) => ({ color: c.color.trim(), quantity: parseInt(c.quantity) || 0 }));
    if (source === "On Hold" && validColors.length === 0) return;
    try {
      await api.products.factoryInternalDecision(p.id, {
        decision: "Order Placed",
        notes: decisionNotes.trim() || undefined,
        colors: validColors.length > 0 ? validColors : undefined,
      }, p.version);
      await refreshProducts();
      addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: source === "On Hold" ? `Order placed for ${p.codeName} — Golden Sample started.` : `${p.codeName} — improvement resolved, continuing with existing order.` });
      showToast("Order placed — case resolved");
      setDecisionNotes(""); setOrderColors([{ color: "", quantity: "" }]); setShowOrderPlaceForm(false);
      onClose();
    } catch (e) {
      const { message } = apiErrorMessage(e);
      showToast(message);
      if ((e as { isConflict?: boolean }).isConflict) await refreshProducts();
    }
  }

  async function sendBackToFactory() {
    if (!sendBackDate) return;
    try {
      await api.products.factorySendBack(p.id, sendBackDate, sendBackNote.trim() || undefined, p.version);
      await refreshProducts();
      addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `${p.codeName} — sent back to factory, awaiting reply by ${fmtDate(sendBackDate)}.` });
      showToast("Sent back to factory");
      setShowSendBack(false); setSendBackDate(""); setSendBackNote("");
    } catch (e) {
      const { message, isConflict } = apiErrorMessage(e);
      showToast(message);
      if (isConflict) await refreshProducts();
    }
  }

  const caseLog = [...(fc?.caseLog ?? [])].reverse();

  async function markImprovementSample() {
    const nextVersion = (p.sampleVersion ?? 1) + 1;
    try {
      await api.products.factoryImprovementSample(p.id, improvSampleDate || undefined, p.version);
      await api.products.factoryCaseLog(p.id, "Factory Not Responded", `Improvement sample expected — v${nextVersion}${improvSampleDate ? ` · expected by ${fmtDate(improvSampleDate)}` : ""}`);
      await refreshProducts();
      addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `${p.codeName} — improvement sample v${nextVersion} expected.` });
      showToast(`Improvement sample v${nextVersion} marked`);
      onClose();
    } catch (e) {
      const { message } = apiErrorMessage(e);
      showToast(message);
    }
  }

  return (
    <div className="max-h-[85vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-3 border-b border-[#bfdbfe]/30 px-5 py-4">
        <div>
          <p className="font-semibold text-slate-900">{p.codeName}</p>
          <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode} · <span className="text-purple-500">{source}</span></p>
        </div>
        <button onClick={onClose} className="text-[#94a3b8] hover:text-[#1d4ed8] transition shrink-0"><X size={18} /></button>
      </div>

      <div className="px-5 py-5 space-y-5">
        <span className={`inline-block rounded border px-2.5 py-1 text-xs font-semibold ${STAGE_STYLE[stage]}`}>{STAGE_LABEL[stage]}</span>
        {p.verdictRemarks && (
          <div className="rounded-md border border-amber-400/30 bg-amber-400/5 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-500 mb-1">Original feedback from Decision Pending</p>
            <p className="text-sm text-amber-700 italic">"{p.verdictRemarks}"</p>
          </div>
        )}

        {/* Factory Not Responded — log awaiting reply, then log the reply itself */}
        {stage === "Factory Not Responded" && canAct && (
          <div className="space-y-4">
            <div className="rounded-md border border-[#93c5fd]/30 bg-[#eff6ff] p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1d4ed8]">Factory reply — expected by</p>
              <div className="flex gap-2">
                <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)}
                  className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
                <button onClick={logAwaitingReply} disabled={!expectedDate}
                  className="rounded-md bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
                  Log
                </button>
              </div>
              <p className="text-[11px] text-[#94a3b8]">Everyone gets a reminder notification on this date.</p>
            </div>

            <div className="rounded-md border border-[#bfdbfe]/40 bg-[#f8faff] p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Log factory's reply (once received)</p>
              <div className="flex gap-2">
                {(["Fully Accepted", "Decision Pending", "Partially Rejected"] as FactoryReplySummary[]).map((s) => (
                  <button key={s} onClick={() => setReplySummary(s)}
                    className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition ${replySummary === s ? "border-[#3b82f6] bg-[#3b82f6]/15 text-[#3b82f6]" : "border-[#bfdbfe]/50 bg-white text-[#64748b] hover:bg-[#eff6ff]"}`}>
                    {s === "Decision Pending" ? "Awaiting Factory Decision" : s}
                  </button>
                ))}
              </div>
              <textarea value={replyNotes} onChange={(e) => setReplyNotes(e.target.value)} rows={2}
                placeholder="What did the factory say? (optional)"
                className="w-full rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#94a3b8] resize-none" />
              <button onClick={logFactoryReply} disabled={!replySummary}
                className="w-full rounded-md bg-[#bfdbfe]/60 py-2 text-xs font-medium text-[#0f172a] hover:bg-[#2563eb] disabled:opacity-40">
                Log factory reply
              </button>
            </div>

            <ImprovSampleNextVersionSection source={source} p={p} showNextImprovCard={showNextImprovCard} setShowNextImprovCard={setShowNextImprovCard} improvSampleTick={improvSampleTick} setImprovSampleTick={setImprovSampleTick} improvSampleDate={improvSampleDate} setImprovSampleDate={setImprovSampleDate} markImprovementSample={markImprovementSample} />
          </div>
        )}

        {/* Awaiting Factory Decision — partial reply, waiting on factory to finalize the pending points */}
        {stage === "Factory Decision Pending" && canAct && (
          <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">Awaiting factory's decision on pending points</p>
            <textarea value={partialNotes} onChange={(e) => setPartialNotes(e.target.value)} rows={2}
              placeholder="What did the factory finally decide?"
              className="w-full rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-orange-400 placeholder:text-[#94a3b8] resize-none" />
            <button onClick={logPartialResolved}
              className="w-full rounded-md border border-orange-500/40 bg-orange-500/10 py-2 text-xs font-medium text-orange-500 hover:bg-orange-500/20">
              Factory finalized pending points
            </button>
            <ImprovSampleNextVersionSection source={source} p={p} showNextImprovCard={showNextImprovCard} setShowNextImprovCard={setShowNextImprovCard} improvSampleTick={improvSampleTick} setImprovSampleTick={setImprovSampleTick} improvSampleDate={improvSampleDate} setImprovSampleDate={setImprovSampleDate} markImprovementSample={markImprovementSample} />
          </div>
        )}

        {/* Internal Decision Pending — Approve / Reject / Order Place / Send back to factory */}
        {stage === "Internal Decision Pending" && canAct && !isQA && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">Internal decision</p>
            <textarea value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} rows={2}
              placeholder="Comments (optional)…"
              className="w-full rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-amber-400 placeholder:text-[#94a3b8] resize-none" />

            {source === "On Hold" && (
              <div className="rounded-md border border-purple-400/30 bg-purple-400/5 px-3 py-2.5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={improvementNeeded} onChange={(e) => setImprovementNeeded(e.target.checked)} className="h-4 w-4 rounded accent-purple-400" />
                  <div>
                    <p className="text-xs font-medium text-purple-500">Improvement sample required</p>
                    <p className="text-[11px] text-purple-500/60">Factory must send a revised sample before golden sample is accepted</p>
                  </div>
                </label>
                {improvementNeeded && (
                  <textarea value={improvementRemarks} onChange={(e) => setImprovementRemarks(e.target.value)} rows={2}
                    placeholder="What needs to improve in the next sample?"
                    className="mt-2 w-full rounded-md border border-purple-400/30 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-purple-400 placeholder:text-[#94a3b8] resize-none" />
                )}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <button onClick={() => applyInternalDecision("Approved")} className="flex-1 rounded-md border border-green-500/40 bg-green-500/10 py-1.5 text-xs font-medium text-green-500 hover:bg-green-500/20">Approve</button>
              <button onClick={() => setShowOrderPlaceForm((v) => !v)}
                className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition ${showOrderPlaceForm ? "border-[#3b82f6] bg-[#3b82f6]/20 text-[#3b82f6]" : "border-[#3b82f6]/40 bg-[#3b82f6]/10 text-[#3b82f6] hover:bg-[#3b82f6]/20"}`}>
                Order Place
              </button>
              <button onClick={() => applyInternalDecision("Rejected")} className="flex-1 rounded-md border border-red-500/40 bg-red-500/10 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20">Reject</button>
            </div>
            <button onClick={markAwaitingImprovSample}
              className="w-full rounded-md border border-purple-400/40 bg-purple-400/8 py-1.5 text-xs font-medium text-purple-500 hover:bg-purple-400/15 transition">
              ⏳ Awaiting Improvement Sample Results
            </button>

            {/* Order Place — popup-style form, same pattern as Order Confirmation */}
            {showOrderPlaceForm && (
              <div className="rounded-md border border-[#3b82f6]/30 bg-[#3b82f6]/5 p-3 space-y-2">
                {source === "On Hold" ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#3b82f6]">Place Order — colours &amp; quantities</p>
                    {orderColors.map((row, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input value={row.color} onChange={(e) => setOrderColor(i, "color", e.target.value)} placeholder={`Colour ${i + 1}`}
                          className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#3b82f6] placeholder:text-[#94a3b8]" />
                        <input type="number" min={0} value={row.quantity} onChange={(e) => setOrderColor(i, "quantity", e.target.value)} placeholder="Qty"
                          className="w-24 rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#3b82f6] placeholder:text-[#94a3b8]" />
                        {orderColors.length > 1 && (
                          <button onClick={() => setOrderColors((prev) => prev.filter((_, j) => j !== i))} className="text-[#94a3b8] hover:text-red-400 transition px-1"><X size={14} /></button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setOrderColors((prev) => [...prev, { color: "", quantity: "" }])} className="text-xs text-[#1d4ed8] hover:underline">
                      + Add another colour
                    </button>
                  </>
                ) : (
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#3b82f6]">Confirm — keep the existing order, improvement resolved</p>
                )}
                <div className="flex gap-2 justify-start pt-1">
                  <button onClick={confirmOrderPlace} disabled={source === "On Hold" && !orderColors.some((c) => c.color.trim())}
                    className="rounded-md bg-[#3b82f6] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
                    {source === "On Hold" ? "Confirm Order → Golden Sample" : "Confirm — continue order"}
                  </button>
                  <button onClick={() => setShowOrderPlaceForm(false)} className="rounded-md border border-[#bfdbfe]/50 px-4 py-1.5 text-xs text-[#64748b] hover:bg-[#eff6ff]">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {source === "Improvement Sample" ? (
              <button
                onClick={async () => {
                  try {
                    await api.products.factorySendBackNpd(p.id, decisionNotes.trim() || undefined, p.version);
                    await refreshProducts();
                    addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `${p.codeName} — sent back to NPD Testing.` });
                    showToast("Sent back to NPD Testing");
                  } catch (e) {
                    const { message, isConflict } = apiErrorMessage(e);
                    showToast(message);
                    if (isConflict) await refreshProducts();
                  }
                }}
                className="w-full rounded-md border border-sky-500/40 bg-sky-500/10 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-500/20 transition"
              >
                🔬 Send back to NPD Testing
              </button>
            ) : (
              <>
                <button onClick={() => setShowSendBack((v) => !v)} className="w-full text-xs text-[#1d4ed8] hover:underline">
                  {showSendBack ? "Cancel send back" : "Not happy with the reply? Send back to factory →"}
                </button>
                {showSendBack && (
                  <div className="rounded-md border border-[#bfdbfe]/40 bg-white p-3 space-y-2">
                    <input type="date" value={sendBackDate} onChange={(e) => setSendBackDate(e.target.value)}
                      className="w-full rounded-md border border-[#bfdbfe]/50 px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
                    <textarea value={sendBackNote} onChange={(e) => setSendBackNote(e.target.value)} rows={2} placeholder="What are we asking the factory for now?"
                      className="w-full rounded-md border border-[#bfdbfe]/50 px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#94a3b8] resize-none" />
                    <button onClick={sendBackToFactory} disabled={!sendBackDate}
                      className="w-full rounded-md bg-[#2563eb] py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
                      Confirm send back
                    </button>
                  </div>
                )}
              </>
            )}
            <ImprovSampleNextVersionSection source={source} p={p} showNextImprovCard={showNextImprovCard} setShowNextImprovCard={setShowNextImprovCard} improvSampleTick={improvSampleTick} setImprovSampleTick={setImprovSampleTick} improvSampleDate={improvSampleDate} setImprovSampleDate={setImprovSampleDate} markImprovementSample={markImprovementSample} />
          </div>
        )}

        {stage === "Resolved" && (
          <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4">
            <p className="text-xs font-semibold text-green-500">{fc?.internalDecisionBy} has {fc?.internalDecision === "Rejected" ? "rejected" : fc?.internalDecision === "Order Placed" ? "placed the order for" : "approved"} this case.</p>
            {fc?.internalDecisionNotes && <p className="text-xs text-[#1d4ed8] mt-1">{fc.internalDecisionNotes}</p>}
            <p className="text-[11px] text-[#94a3b8] mt-1">{fmt(fc?.internalDecisionAt)}</p>
          </div>
        )}

        {/* Improvement Sample — NPD result */}
        {source === "Improvement Sample" && (
          <>
            {/* Show feedback/notes from case log when sent back to factory */}
            {stage !== "Internal Decision Pending" && caseLog.length > 0 && (() => {
              const lastNote = caseLog.find((e) => e.note);
              return lastNote ? (
                <div className="rounded-md border border-[#93c5fd]/30 bg-[#eff6ff] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#1d4ed8] mb-1">Last feedback logged</p>
                  <p className="text-xs text-[#0f172a]">{lastNote.note}</p>
                  <p className="text-[10px] text-[#94a3b8] mt-0.5">{fmt(lastNote.timestamp)}</p>
                </div>
              ) : null;
            })()}
            <ImprovNpdSection p={p} showToast={showToast} addNotification={addNotification} refreshProducts={refreshProducts} />
            {/* v-next option — only when in Internal Decision Pending (other stages show it inside their panel above) */}
            {stage === "Internal Decision Pending" && (
              <>
                <button onClick={() => setShowNextImprovCard((v) => !v)}
                  className="w-full text-xs text-[#1d4ed8] hover:underline text-left">
                  {showNextImprovCard ? "▾ Hide" : "▸ Not happy with the sample? Request v" + ((p.sampleVersion ?? 1) + 1) + " →"}
                </button>
                {showNextImprovCard && (
                  <ImprovSampleCard tick={improvSampleTick} setTick={setImprovSampleTick} date={improvSampleDate} setDate={setImprovSampleDate} onConfirm={markImprovementSample} nextVersion={(p.sampleVersion ?? 1) + 1} />
                )}
              </>
            )}
          </>
        )}

        {/* Case history */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b] mb-2">Case history</p>
          {caseLog.length === 0 ? (
            <p className="text-xs text-[#94a3b8]">No case activity logged yet.</p>
          ) : (
            <div className="space-y-2">
              {caseLog.map((entry, i) => (
                <div key={i} className="flex gap-3 text-xs border-l-2 border-[#bfdbfe]/40 pl-3">
                  <span className="text-[#d97706] tabular-nums shrink-0 w-36">{fmt(entry.timestamp)}</span>
                  <span className="text-[#0f172a]">{entry.note ?? entry.stage}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
