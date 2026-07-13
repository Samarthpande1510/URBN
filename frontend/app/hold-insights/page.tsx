"use client";

import { useState, useEffect } from "react";
import { parseServerDate } from "@/lib/datetime";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { useProducts, ProductRow, FactoryComm, FactoryReplySummary, InternalDecision, HoldCaseEntry, Status, NpdReport } from "@/lib/products-context";
import { getSession, Session, Role } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { GridBeam } from "@/components/ui/grid-beam";
import { X } from "lucide-react";

const ALL_ROLES: Role[] = ["CEO", "Dev", "Sales", "QA"];

type Stage = "Factory Not Responded" | "Factory Decision Pending" | "Internal Decision Pending" | "Resolved";

function computeStage(fc: FactoryComm | undefined): Stage {
  if (fc?.internalDecision) return "Resolved";
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

function defaultFactoryComm(now: string): FactoryComm {
  return {
    decidedAction: "EMAIL_FACTORY", decidedAt: now, acknowledgedAt: null, replyAt: null, replyText: null,
    tentativeReturnDate: null, editHistory: [], caseLog: [],
  };
}

function fmt(v: string | null | undefined) {
  if (!v) return null;
  return parseServerDate(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
function fmtAt(v: string | null | undefined) {
  if (!v) return "";
  const d = parseServerDate(v);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return `${date} at ${time}`;
}
function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return parseServerDate(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
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
  const { products, setProducts, addNotification, search } = useProducts();
  const { showToast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => { setSession(getSession()); }, []);

  const isQA = false;
  const isReadOnly = false;

  // ── Build the unified list of hold cases (on-hold products + improvement-sample products) ──
  const cases: HoldCase[] = products
    .filter((p) => {
      if (p.status === "On hold") return true;
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
        stage: computeStage(p.factoryComm),
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
          <table className="min-w-[1000px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#bfdbfe]/40 text-[#0f172a]">
                <th className="pl-4 pr-2 py-3 w-14" />
                <th className="px-4 py-3 font-medium">Product<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Code name · Factory</p></th>
                <th className="px-4 py-3 font-medium">Source<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Why it's on hold</p></th>
                <th className="px-4 py-3 font-medium">Remarks<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Original feedback</p></th>
                <th className="px-4 py-3 font-medium">Improvement Sample Orders<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Revised sample &amp; version</p></th>
                <th className="px-4 py-3 font-medium">Stage<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Full history of responses</p></th>
                <th className="px-4 py-3 font-medium">Expected reply<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">By when factory should reply</p></th>
                <th className="px-4 py-3 font-medium">Last updated<p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Latest case activity</p></th>
                <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-16 text-center">
                  <p className="text-sm text-[#64748b]">No cases match this filter.</p>
                </td></tr>
              ) : (
                visible.map(({ product: p, fc, source, stage }) => (
                  <tr key={p.id} onClick={() => setSelectedId(p.id)} className="cursor-pointer border-b border-[#bfdbfe]/20 hover:bg-[#eff6ff] transition">
                    <td className="pl-4 pr-2 py-3">
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
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${source === "Improvement Sample" ? "border-purple-400/40 bg-purple-400/10 text-purple-500" : "border-[#bfdbfe]/50 bg-[#f8faff] text-[#64748b]"}`}>
                        {source}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      {p.verdictRemarks ? (
                        <p className="text-xs text-amber-700 italic leading-snug">"{p.verdictRemarks}"</p>
                      ) : <span className="text-xs text-[#94a3b8]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/50 bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-600 tracking-wide">
                        v{p.sampleVersion ?? 1}{source === "Improvement Sample" ? " Improvement" : " On Hold"}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium mb-1.5 ${STAGE_STYLE[stage]}`}>{STAGE_LABEL[stage]}</span>
                      <div className="flex flex-col gap-1">
                        {[...(fc?.caseLog ?? [])].reverse().map((entry, i) => (
                          <span key={i} className="inline-block rounded border border-[#bfdbfe]/60 bg-[#eff6ff] px-1.5 py-1 text-[10px] leading-tight">
                            <span className="block text-[#94a3b8]">{fmtAt(entry.timestamp)}</span>
                            <span className="block text-[#64748b] font-medium">{entry.note ?? entry.stage}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#1d4ed8] whitespace-nowrap">{fc?.expectedReplyDate ? fmtDate(fc.expectedReplyDate) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-[#d97706] whitespace-nowrap">{p.statusChangedAt ? fmtDate(p.statusChangedAt) : "—"}</td>
                    <td className="px-4 py-3 text-right text-xs text-[#d97706] whitespace-nowrap">{fmtDate(p.deadline)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GridBeam>

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
          />
        )}
      </Modal>
    </AppShell>
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

function HoldCaseDetail({ holdCase, isQA, isReadOnly, session, onClose, patchFC, pushLog, setProducts, addNotification, showToast }: {
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

  const now = () => new Date().toISOString();

  function logAwaitingReply() {
    if (!expectedDate) return;
    const t = now();
    patchFC(p.id, (f) => ({ ...f, expectedReplyDate: expectedDate, reminderSentForDate: null }));
    pushLog(p.id, { stage: "Factory Not Responded", note: `Feedback shared — awaiting factory reply by ${fmtDate(expectedDate)}`, timestamp: t });
    addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `${p.codeName} — awaiting factory reply by ${fmtDate(expectedDate)}.` });
    showToast("Logged — awaiting factory reply");
  }

  function logFactoryReply() {
    if (!replySummary) return;
    const t = now();
    const displaySummary = replySummary === "Decision Pending" ? "Awaiting Factory Decision" : replySummary;
    patchFC(p.id, (f) => ({ ...f, replyReceivedAt: t, replySummary: replySummary as FactoryReplySummary }));
    pushLog(p.id, { stage: "Factory Replied", note: `Reply received — ${displaySummary}${replyNotes ? ` · ${replyNotes}` : ""}`, timestamp: t });
    addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `${p.codeName} — factory replied: ${displaySummary}.` });
    showToast("Factory reply logged");
    setReplySummary(""); setReplyNotes("");
  }

  function logPartialResolved() {
    const t = now();
    patchFC(p.id, (f) => ({ ...f, partialResolvedAt: t }));
    pushLog(p.id, { stage: "Factory Decision Pending", note: `Factory finalized pending points${partialNotes ? ` — ${partialNotes}` : ""}`, timestamp: t });
    showToast("Factory decision logged");
    setPartialNotes("");
  }

  function applyInternalDecision(decision: "Approved" | "Rejected") {
    const t = now();
    const by = session?.name ?? "Unknown";
    patchFC(p.id, (f) => ({ ...f, internalDecision: decision, internalDecisionAt: t, internalDecisionBy: by, internalDecisionNotes: decisionNotes.trim() || undefined }));
    const verb = decision === "Approved" ? `${by} has approved` : `${by} has rejected`;
    pushLog(p.id, { stage: "Internal Decision Pending", note: `${verb}${decisionNotes ? ` — ${decisionNotes}` : ""}`, timestamp: t });

    // Reflect the decision on the underlying product
    setProducts((prev) => prev.map((x) => {
      if (x.id !== p.id) return x;
      if (source === "On Hold") {
        if (decision === "Approved") {
          const code = "AP-" + Math.random().toString(36).slice(2, 5).toUpperCase();
          return {
            ...x,
            status: "Approved" as Status,
            statusChangedAt: t,
            orderDecision: {
              state: "pending", internalCode: code, decidedAt: null, decidedBy: null, colors: [],
              improvedGoldenSampleExpected: improvementNeeded,
              improvementNotes: improvementNeeded ? (improvementRemarks.trim() || undefined) : undefined,
            },
            activityLog: [...x.activityLog, {
              action: improvementNeeded
                ? `${verb} — moved to Approved — improvement requirement${improvementRemarks ? ` · ${improvementRemarks}` : ""}`
                : `${verb} — moved to Approved`,
              timestamp: t,
              stages: improvementNeeded ? ["EMAILED TO FACTORY", "IMPROVEMENT REQUIREMENT"] : ["EMAILED TO FACTORY"],
            }],
          };
        }
        return {
          ...x, status: "Rejected" as Status, statusChangedAt: t,
          activityLog: [...x.activityLog, { action: `${verb} — moved to Rejected`, timestamp: t, stages: ["REJECTED"] }],
        };
      }
      // Improvement-sample case: mark resolved on the golden sample
      if (x.goldenWorkflow?.goldenSample) {
        return {
          ...x,
          goldenWorkflow: {
            ...x.goldenWorkflow,
            goldenSample: { ...x.goldenWorkflow.goldenSample, improvementFixed: decision !== "Rejected", improvementFixedAt: t, improvementFixedNotes: decisionNotes.trim() || null },
          },
          activityLog: [...x.activityLog, { action: `${verb} — improvement case resolved`, timestamp: t }],
        };
      }
      return x;
    }));
    addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `${verb} for ${p.codeName}.` });
    showToast(`${decision} — case resolved`);
    setDecisionNotes(""); setImprovementNeeded(false); setImprovementRemarks("");
  }

  function setOrderColor(i: number, field: "color" | "quantity", value: string) {
    setOrderColors((prev) => prev.map((c, j) => j === i ? { ...c, [field]: value } : c));
  }

  function confirmOrderPlace() {
    const t = now();
    const by = session?.name ?? "Unknown";
    const validColors = orderColors.filter((c) => c.color.trim()).map((c) => ({ color: c.color.trim(), quantity: parseInt(c.quantity) || 0 }));

    if (source === "On Hold" && validColors.length === 0) return;

    patchFC(p.id, (f) => ({ ...f, internalDecision: "Order Placed", internalDecisionAt: t, internalDecisionBy: by, internalDecisionNotes: decisionNotes.trim() || undefined }));

    const note = source === "On Hold"
      ? `${by} placed order — ${validColors.map((c) => `${c.color} ×${c.quantity}`).join(", ")}${decisionNotes ? ` · ${decisionNotes}` : ""}`
      : `${by} confirmed continuing with existing order — improvement resolved${decisionNotes ? ` · ${decisionNotes}` : ""}`;
    pushLog(p.id, { stage: "Internal Decision Pending", note, timestamp: t });

    setProducts((prev) => prev.map((x) => {
      if (x.id !== p.id) return x;
      if (source === "On Hold") {
        const code = "AP-" + Math.random().toString(36).slice(2, 5).toUpperCase();
        return {
          ...x,
          status: "Approved" as Status,
          statusChangedAt: t,
          orderDecision: { state: "placed", internalCode: code, decidedAt: t, decidedBy: by, colors: validColors },
          goldenWorkflow: {
            purchaseNotifiedAt: t,
            orderConfirmedAt: t,
            purchaseLog: [{ action: `Order placed (${code}) — ${validColors.map((c) => `${c.color} ×${c.quantity}`).join(", ")}`, timestamp: t }],
            details: null, compliance: null, packaging: null,
            goldenSample: { status: "Requested", expectedDate: "", receivedAt: null, approvedAt: null, improvementFixed: null, improvementFixedAt: null, improvementFixedNotes: null, log: [{ action: "Golden sample requested", timestamp: t }] },
          },
          activityLog: [...x.activityLog, { action: `Order placed (${code}) from Hold — moving to Golden Sample`, timestamp: t, stages: ["ORDER PLACED"] }],
        };
      }
      if (x.goldenWorkflow?.goldenSample) {
        return {
          ...x,
          goldenWorkflow: {
            ...x.goldenWorkflow,
            goldenSample: { ...x.goldenWorkflow.goldenSample, improvementFixed: true, improvementFixedAt: t, improvementFixedNotes: decisionNotes.trim() || null },
          },
          activityLog: [...x.activityLog, { action: `${by} confirmed continuing with existing order — improvement resolved`, timestamp: t }],
        };
      }
      return x;
    }));

    addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: source === "On Hold" ? `Order placed for ${p.codeName} — Golden Sample started.` : `${p.codeName} — improvement resolved, continuing with existing order.` });
    showToast("Order placed — case resolved");
    setDecisionNotes(""); setOrderColors([{ color: "", quantity: "" }]); setShowOrderPlaceForm(false);
  }

  function sendBackToFactory() {
    if (!sendBackDate) return;
    const t = now();
    patchFC(p.id, (f) => ({ ...f, replyReceivedAt: null, replySummary: null, partialResolvedAt: null, expectedReplyDate: sendBackDate, reminderSentForDate: null }));
    pushLog(p.id, { stage: "Factory Not Responded", note: `Sent back to factory — awaiting reply by ${fmtDate(sendBackDate)}${sendBackNote ? ` · ${sendBackNote}` : ""}`, timestamp: t });
    addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `${p.codeName} — sent back to factory, awaiting reply by ${fmtDate(sendBackDate)}.` });
    showToast("Sent back to factory");
    setShowSendBack(false); setSendBackDate(""); setSendBackNote("");
  }

  const caseLog = [...(fc?.caseLog ?? [])].reverse();

  function markImprovementSample() {
    const t = now();
    const nextVersion = (p.sampleVersion ?? 1) + 1;
    setProducts((prev) => prev.map((x) => {
      if (x.id !== p.id) return x;
      const fc = x.factoryComm ?? defaultFactoryComm(t);
      return {
        ...x,
        status: "Pending NPD" as Status,
        sampleVersion: nextVersion,
        statusChangedAt: t,
        factoryComm: { ...fc, improvementSampleExpected: true, expectedReplyDate: improvSampleDate || fc.expectedReplyDate, caseLog: [...(fc.caseLog ?? []), { stage: "Factory Not Responded", note: `Improvement sample expected — will be tracked as v${nextVersion}${improvSampleDate ? ` · expected by ${fmtDate(improvSampleDate)}` : ""}`, timestamp: t }] },
        activityLog: [...x.activityLog, { action: `Improvement sample expected (v${nextVersion}) — sent back to NPD Testing`, timestamp: t, stages: [`IMPROVEMENT SAMPLE v${nextVersion}: NPD PENDING`] }],
      };
    }));
    addNotification({ targetRoles: ALL_ROLES, productId: p.id, productName: p.codeName, message: `${p.codeName} — improvement sample expected, v${nextVersion} sent to NPD Testing.` });
    showToast(`Improvement sample v${nextVersion} — sent to NPD Testing`);
    onClose();
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

            {source === "On Hold" && <ImprovSampleCard tick={improvSampleTick} setTick={setImprovSampleTick} date={improvSampleDate} setDate={setImprovSampleDate} onConfirm={markImprovementSample} nextVersion={(p.sampleVersion ?? 1) + 1} />}
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
            {source === "On Hold" && <ImprovSampleCard tick={improvSampleTick} setTick={setImprovSampleTick} date={improvSampleDate} setDate={setImprovSampleDate} onConfirm={markImprovementSample} nextVersion={(p.sampleVersion ?? 1) + 1} />}
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
            {source === "On Hold" && <ImprovSampleCard tick={improvSampleTick} setTick={setImprovSampleTick} date={improvSampleDate} setDate={setImprovSampleDate} onConfirm={markImprovementSample} nextVersion={(p.sampleVersion ?? 1) + 1} />}
          </div>
        )}

        {stage === "Resolved" && (
          <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4">
            <p className="text-xs font-semibold text-green-500">{fc?.internalDecisionBy} has {fc?.internalDecision === "Rejected" ? "rejected" : fc?.internalDecision === "Order Placed" ? "placed the order for" : "approved"} this case.</p>
            {fc?.internalDecisionNotes && <p className="text-xs text-[#1d4ed8] mt-1">{fc.internalDecisionNotes}</p>}
            <p className="text-[11px] text-[#94a3b8] mt-1">{fmt(fc?.internalDecisionAt)}</p>
          </div>
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
