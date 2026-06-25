"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useProducts, Status, ProductRow } from "@/lib/products-context";
import { PRIORITY_DOT } from "@/lib/colors";
import { Chip } from "@/components/Chip";
import { getSession, Session } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { ChevronDown, ChevronUp } from "lucide-react";
import { GridBeam } from "@/components/ui/grid-beam";

function fmt(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function DecisionPendingPage() {
  const { products, setProducts, addNotification, search } = useProducts();
  const { showToast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [improvementReq, setImprovementReq] = useState<Record<number, boolean>>({});
  const [improvementNotes, setImprovementNotes] = useState<Record<number, string>>({});

  useEffect(() => { setSession(getSession()); }, []);

  const isQA = session?.role === "QA";
  const isCEO = session?.role === "CEO";
  const isSales = session?.role === "Sales";
  const isReadOnly = isQA || isSales;

  const q = search.toLowerCase();
  const visible = products
    .filter((p) => {
      if (p.status !== "Pending Decision") return false;
      if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
      return true;
    })
    .sort((a, b) => {
      const ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
      return ORDER[a.priority] - ORDER[b.priority];
    });

  // PASS → email factory → Approved (Golden Product)
  function approveAndEmail(p: ProductRow) {
    const now = new Date().toISOString();
    const hasImprovement = !!improvementReq[p.id];
    const notes = improvementNotes[p.id]?.trim() || undefined;
    const internalCode = "AP-" + Math.random().toString(36).slice(2, 5).toUpperCase();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      status: "Approved" as Status,
      statusChangedAt: now,
      orderDecision: {
        state: "pending",
        internalCode,
        decidedAt: null,
        decidedBy: null,
        colors: [],
        improvedGoldenSampleExpected: hasImprovement,
        improvementNotes: notes,
      },
      activityLog: [...x.activityLog, {
        action: hasImprovement
          ? "Pass — emailed to factory — improvement requirement — awaiting order decision"
          : "Pass — emailed to factory — awaiting order decision",
        timestamp: now,
        stages: hasImprovement
          ? ["EMAILED TO FACTORY", "IMPROVEMENT REQUIREMENT"]
          : ["EMAILED TO FACTORY"],
      }],
    }));
    addNotification({ targetRoles: ["CEO", "Dev", "Sales", "Sales"], productId: p.id, productName: p.codeName, message: `${p.codeName} approved (${internalCode}) — Sales/CEO to place order.` });
    showToast(`${p.codeName} approved — awaiting order`);
  }

  // FAIL: salvageable → email factory → On Hold
  function sendToOnHold(p: ProductRow) {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      status: "On hold" as Status,
      statusChangedAt: now,
      factoryComm: { decidedAction: "EMAIL_FACTORY", decidedAt: now, acknowledgedAt: null, replyAt: null, replyText: null, tentativeReturnDate: null, editHistory: [] },
      activityLog: [...x.activityLog, { action: "Factory emailed — sent to On Hold", timestamp: now, stages: ["EMAILED TO FACTORY"] }],
    }));
    addNotification({ targetRoles: ["Dev"], productId: p.id, productName: p.codeName, message: `${p.codeName} put on hold — email factory with failure observations and await their response.` });
    showToast(`${p.codeName} sent to On Hold`);
  }

  // FAIL: move to Rejected buffer (CEO will decide: On Hold or Archive)
  function sendToRejected(p: ProductRow) {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      status: "Rejected" as Status,
      statusChangedAt: now,
      activityLog: [...x.activityLog, { action: "Sent to Rejected — awaiting CEO decision on salvageability", timestamp: now, stages: ["REJECTED"] }],
    }));
    addNotification({ targetRoles: ["CEO"], productId: p.id, productName: p.codeName, message: `${p.codeName} failed NPD — CEO review needed: salvageable (On Hold) or archive?` });
    showToast(`${p.codeName} sent to Rejected for CEO review`);
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Decision Pending</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">
        Products that have completed NPD testing and are waiting for a final decision.
      </p>
      <p className="mt-1 text-xs text-[#94a3b8]">
        {isReadOnly
          ? isSales
            ? "Decisions are made by CEO and Dev. You'll be notified when a product is approved for ordering."
            : "You are in read-only mode — only CEO and Dev can make decisions here."
          : "Review each product's NPD result and observations, then make a decision based on the outcome."}
      </p>

      <div className="mt-6 space-y-3">
        {visible.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#bfdbfe]/40 px-5 py-16 text-center">
            <p className="text-sm text-[#64748b]">No products waiting for a decision.</p>
            <p className="mt-1 text-xs text-[#94a3b8]">Products appear here once QA submits an NPD report.</p>
          </div>
        ) : (
          visible.map((p) => {
            const isPass = p.npdReport?.outcome === "Pass";
            return (
              <GridBeam key={p.id} rows={4} cols={6} colorVariant="ocean" theme="dark" active className="rounded-md border border-[#bfdbfe]/40 bg-[#ffffff] overflow-hidden">

                {/* Header */}
                <div className="flex flex-wrap items-start gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white">{p.codeName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <p className="text-xs text-[#1d4ed8]">{p.skuCode}</p>
                      {p.factory && <p className="text-xs text-[#64748b]">· {p.factory}</p>}
                      {p.colors && <p className="text-xs text-[#94a3b8]">· {p.colors}</p>}
                    </div>
                  </div>
                  <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
                  <button
                    onClick={() => setExpandedLog(expandedLog === p.id ? null : p.id)}
                    className="flex items-center gap-1 rounded-lg border border-[#bfdbfe]/50 px-3 py-1.5 text-xs text-[#64748b] hover:bg-[#eff6ff] hover:text-[#1d4ed8]">
                    Timeline {expandedLog === p.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>

                {/* NPD result + observations */}
                {p.npdReport && (
                  <div className={`border-t border-[#bfdbfe]/30 px-5 py-4 ${isPass ? "bg-green-500/5" : "bg-red-500/5"}`}>
                    <div className="flex flex-wrap gap-4 mb-3">
                      <div>
                        <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">NPD Outcome</p>
                        <p className={`text-lg font-bold ${isPass ? "text-green-400" : "text-red-400"}`}>
                          {isPass ? "✓ Pass" : "✕ Fail"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">Submitted</p>
                        <p className="text-xs text-[#1d4ed8]">{fmt(p.npdReport.submittedAt)}</p>
                      </div>
                      {p.npdReport.fileName && (
                        <div>
                          <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">Report</p>
                          <p className="text-xs text-[#3b82f6]">{p.npdReport.fileName}</p>
                        </div>
                      )}
                    </div>
                    {p.npdReport.notes && (
                      <div>
                        <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">QA Observations</p>
                        <p className="text-sm text-[#0f172a] whitespace-pre-wrap leading-relaxed">{p.npdReport.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Decision buttons */}
                {!isReadOnly && (
                  <div className="border-t border-[#bfdbfe]/30 px-5 py-4">
                    {isPass ? (
                      <div>
                        <p className="text-xs text-[#64748b] mb-3">
                          Product passed NPD testing. Approve to email the factory and start Golden Product, or override below.
                        </p>
                        {/* Improvement requirement toggle */}
                        <div className="mb-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!improvementReq[p.id]}
                              onChange={(e) => setImprovementReq((r) => ({ ...r, [p.id]: e.target.checked }))}
                              className="h-4 w-4 rounded accent-amber-400"
                            />
                            <div>
                              <p className="text-sm font-medium text-amber-300">Improvement requirement</p>
                              <p className="text-xs text-amber-500/70">Check if the factory must implement improvements before golden sample is accepted</p>
                            </div>
                          </label>
                          {!!improvementReq[p.id] && (
                            <textarea
                              value={improvementNotes[p.id] ?? ""}
                              onChange={(e) => setImprovementNotes((r) => ({ ...r, [p.id]: e.target.value }))}
                              placeholder="Describe the required improvements (e.g. fix cable quality, improve casing finish)…"
                              rows={3}
                              className="mt-3 w-full rounded-md border border-amber-500/30 bg-[#ffffff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-amber-400 placeholder:text-[#5a4a2a] resize-none"
                            />
                          )}
                        </div>
                        <button
                          onClick={() => approveAndEmail(p)}
                          className="w-full rounded-md border border-green-500/40 bg-green-500/10 py-3 text-sm font-semibold text-green-400 hover:bg-green-500/20 transition mb-2"
                        >
                          {improvementReq[p.id]
                            ? "✓ Email factory — improvement requirement — golden samples pending"
                            : "✓ Email factory with pass result — golden samples pending"}
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={() => sendToOnHold(p)}
                            className="flex-1 rounded-md border border-amber-500/30 bg-amber-500/5 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/10 transition"
                          >
                            Put on Hold
                          </button>
                          <button
                            onClick={() => sendToRejected(p)}
                            className="flex-1 rounded-md border border-red-500/30 bg-red-500/5 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-[#64748b] mb-3">
                          Product failed NPD testing. Email the factory with observations and request a revised sample, or send to Rejected for CEO to decide.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <button
                            onClick={() => sendToOnHold(p)}
                            className="flex-1 rounded-md border border-amber-500/30 bg-amber-500/5 py-3 text-sm font-semibold text-amber-400 hover:bg-amber-500/10 transition"
                          >
                            Email factory — put on hold
                            <p className="text-[11px] font-normal text-amber-500/60 mt-0.5">Sends to On Hold to track factory response</p>
                          </button>
                          <button
                            onClick={() => sendToRejected(p)}
                            className="flex-1 rounded-md border border-red-500/30 bg-red-500/5 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 transition"
                          >
                            Send to Rejected
                            <p className="text-[11px] font-normal text-red-500/50 mt-0.5">CEO decides: On Hold or Archive</p>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isReadOnly && p.npdReport && (
                  <div className="border-t border-[#bfdbfe]/20 px-5 py-2">
                    <p className="text-[11px] text-[#2a4a6a]">Decisions are made by CEO and Dev team.</p>
                  </div>
                )}

                {/* Timeline */}
                {expandedLog === p.id && p.activityLog.length > 0 && (
                  <div className="border-t border-[#bfdbfe]/30 px-5 py-3 space-y-2">
                    <p className="text-xs font-normal uppercase tracking-wide text-[#64748b]">Timeline</p>
                    {p.activityLog.map((entry, i) => (
                      <div key={i} className="flex gap-3 text-xs">
                        <span className="text-[#d97706] tabular-nums shrink-0">{fmt(entry.timestamp)}</span>
                        <span className="text-[#0f172a]">{entry.action}</span>
                        {entry.note && <span className="text-[#1d4ed8] truncate">— {entry.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </GridBeam>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
