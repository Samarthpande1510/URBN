"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useProducts, Status, ProductRow } from "@/lib/products-context";
import { PRIORITY_DOT } from "@/lib/colors";
import { Chip } from "@/components/Chip";
import { getSession, Session } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { ChevronDown, ChevronUp, CheckCircle, Circle, Clock } from "lucide-react";
import { GridBeam } from "@/components/ui/grid-beam";

function fmt(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type Step = "email" | "factory_response" | "reply" | "outcome";

function currentStep(p: ProductRow): Step {
  if (!p.factoryComm?.decidedAt) return "email";
  if (!p.factoryComm.acknowledgedAt) return "factory_response";
  if (!p.factoryComm.replyAt) return "reply";
  return "outcome";
}

function StepDot({ done, active, label, sub }: { done: boolean; active: boolean; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {done
        ? <CheckCircle size={16} className="shrink-0 text-green-400" />
        : active
          ? <Circle size={16} className="shrink-0 text-[#3b82f6]" />
          : <Circle size={16} className="shrink-0 text-[#bfdbfe]" />}
      <div className="min-w-0">
        <p className={`text-xs font-medium leading-tight ${done ? "text-green-400" : active ? "text-[#0f172a]" : "text-[#94a3b8]"}`}>{label}</p>
        {sub && <p className="text-[10px] text-[#94a3b8] leading-tight truncate">{sub}</p>}
      </div>
    </div>
  );
}

// Mini 3-step progress bar for switcher
function StepBar({ step }: { step: Step }) {
  const steps: Step[] = ["email", "factory_response", "reply", "outcome"];
  const idx = steps.indexOf(step);
  return (
    <div className="flex gap-1 mt-1.5">
      {["email", "acknowledge", "reply"].map((s, i) => (
        <div key={s} className="h-1.5 flex-1 rounded-full transition-colors"
          style={{ background: i < idx || step === "outcome" ? "#22c55e" : i === idx ? "#3b82f6" : "#eff6ff" }} />
      ))}
    </div>
  );
}

function HoldDetail({ p, isQA, isReadOnly }: { p: ProductRow; isQA: boolean; isReadOnly: boolean }) {
  const { setProducts, addNotification } = useProducts();
  const { showToast } = useToast();
  const [replyDraft, setReplyDraft] = useState(p.factoryComm?.replyText ?? "");
  const [returnDateDraft, setReturnDateDraft] = useState(p.factoryComm?.tentativeReturnDate ?? "");
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);

  const step = currentStep(p);

  // Reset state when product changes
  useEffect(() => {
    setReplyDraft(p.factoryComm?.replyText ?? "");
    setReturnDateDraft(p.factoryComm?.tentativeReturnDate ?? "");
    setShowReplyForm(false);
    setShowTimeline(true);
  }, [p.id]);

  function emailFactory() {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x, statusChangedAt: now,
      factoryComm: { decidedAction: "EMAIL_FACTORY", decidedAt: now, acknowledgedAt: null, replyAt: null, replyText: null, tentativeReturnDate: null, editHistory: [] },
      activityLog: [...x.activityLog, { action: "Factory emailed", timestamp: now, stages: ["EMAILED TO FACTORY"] }],
    }));
    addNotification({ targetRoles: ["Dev"], productId: p.id, productName: p.codeName, message: "Factory has been emailed — acknowledge when ready." });
    showToast("Factory emailed — Dev team notified");
  }

  function acknowledge() {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) =>
      x.id === p.id && x.factoryComm
        ? { ...x, factoryComm: { ...x.factoryComm, acknowledgedAt: now }, activityLog: [...x.activityLog, { action: "Dev team acknowledged", timestamp: now, stages: ["REVISED SAMPLE REQUESTED"] }] }
        : x
    ));
    showToast("Acknowledged");
  }

  function saveReply() {
    if (!p.factoryComm || !replyDraft.trim()) return;
    const now = new Date().toISOString();
    const isEdit = !!p.factoryComm.replyAt;
    setProducts((prev) => prev.map((x) => {
      if (x.id !== p.id || !x.factoryComm) return x;
      return {
        ...x,
        factoryComm: {
          ...x.factoryComm,
          replyText: replyDraft,
          tentativeReturnDate: returnDateDraft || null,
          replyAt: x.factoryComm.replyAt ?? now,
          editHistory: isEdit
            ? [...x.factoryComm.editHistory, { editedAt: now, previousReply: p.factoryComm!.replyText, previousDate: p.factoryComm!.tentativeReturnDate }]
            : x.factoryComm.editHistory,
        },
        activityLog: [...x.activityLog, { action: isEdit ? "Factory reply updated" : "Factory reply logged", timestamp: now, note: replyDraft, stages: isEdit ? undefined : ["REVISED SAMPLE RECEIVED"] }],
      };
    }));
    setShowReplyForm(false);
    showToast(isEdit ? "Reply updated" : "Reply saved");
  }

  function factoryAgreesToFix() {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      status: "Pending NPD" as Status,
      statusChangedAt: now,
      factoryComm: undefined,
      npdReport: undefined,
      activityLog: [...x.activityLog, { action: "Revised sample received — returned to NPD Testing for revised test cycle", timestamp: now, stages: ["REVISED TESTING: PENDING"] }],
    }));
    addNotification({ targetRoles: ["QA", "Dev"], productId: p.id, productName: p.codeName, message: `${p.codeName} returned to Pending NPD — factory sending revised sample.` });
    showToast("Returned to Pending NPD — new test cycle");
  }

  function factoryDenied() {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id === p.id ? {
      ...x,
      status: "Archived" as Status,
      statusChangedAt: now,
      activityLog: [...x.activityLog, { action: "Factory denied improvement — product dropped and archived", timestamp: now, stages: ["FACTORY DENIED IMPROVEMENT", "PRODUCT DROPPED"] }],
    } : x));
    addNotification({ targetRoles: ["CEO", "Dev", "Sales", "QA"], productId: p.id, productName: p.codeName, message: `${p.codeName} archived — factory denied improvement request.` });
    showToast("Product archived — factory denied improvement");
  }

  return (
    <GridBeam rows={5} cols={7} colorVariant="sunset" theme="dark" active className="rounded-md border border-[#bfdbfe]/40 bg-[#ffffff] overflow-hidden">

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 px-5 py-4 border-b border-[#bfdbfe]/30">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-white">{p.codeName}</p>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <p className="text-xs text-[#1d4ed8]">{p.skuCode}</p>
            {p.factory && <p className="text-xs text-[#64748b]">· {p.factory}</p>}
            {p.statusChangedAt && <p className="text-xs text-[#94a3b8]">· On hold since {fmt(p.statusChangedAt)}</p>}
          </div>
        </div>
        <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
      </div>

      {/* Step tracker */}
      <div className="grid grid-cols-3 gap-0 border-b border-[#bfdbfe]/30 divide-x divide-[#bfdbfe]/30">
        {[
          { id: "email" as Step,            label: "Emailed to factory",       sub: p.factoryComm?.decidedAt ? fmt(p.factoryComm.decidedAt) : undefined },
          { id: "factory_response" as Step, label: "Factory response",          sub: p.factoryComm?.acknowledgedAt ? fmt(p.factoryComm.acknowledgedAt) : undefined },
          { id: "reply" as Step,            label: "Revised sample received",   sub: p.factoryComm?.replyAt ? fmt(p.factoryComm.replyAt) : undefined },
        ].map(({ id, label, sub }) => {
          const steps: Step[] = ["email", "factory_response", "reply", "outcome"];
          const stepIdx = steps.indexOf(id);
          const currentIdx = steps.indexOf(step);
          const done = stepIdx < currentIdx || step === "outcome";
          const active = stepIdx === currentIdx;
          return (
            <div key={id} className={`px-4 py-3 ${active ? "bg-[#eff6ff]/60" : ""}`}>
              <StepDot done={done} active={active} label={label} sub={sub ?? undefined} />
            </div>
          );
        })}
      </div>

      {/* Active step content */}
      <div className="px-5 py-5">

        {step === "email" && (
          <div>
            <p className="text-sm font-medium text-[#0f172a] mb-1">Email factory with observations and request a revised sample</p>
            <p className="text-xs text-[#64748b] mb-4">Once emailed, log it here to track the factory's response.</p>
            <button onClick={emailFactory} className="w-full rounded-md bg-[#2563eb] py-3 text-sm font-semibold text-[#0f172a] hover:opacity-90 transition">
              Emailed to factory
            </button>
          </div>
        )}

        {step === "factory_response" && (
          <div>
            <div className="flex items-start gap-3 mb-4 rounded-md border border-[#93c5fd]/30 bg-[#eff6ff] px-4 py-3">
              <Clock size={16} className="shrink-0 text-[#3b82f6] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[#0f172a]">Emailed to factory on {fmt(p.factoryComm!.decidedAt)}</p>
                <p className="text-xs text-[#64748b] mt-0.5">Waiting for factory to respond — did they agree to fix or deny?</p>
              </div>
            </div>
            {!isReadOnly && (
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={acknowledge} className="flex-1 rounded-md border border-green-500/30 bg-green-500/10 py-3 text-sm font-semibold text-green-400 hover:bg-green-500/20 transition">
                  Revised sample requested
                  <p className="text-[11px] font-normal text-green-500/60 mt-0.5">Factory agreed to fix — waiting for revised sample</p>
                </button>
                <button onClick={factoryDenied} className="flex-1 rounded-md border border-red-500/30 bg-red-500/5 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 transition">
                  Factory denied improvement — product dropped
                  <p className="text-[11px] font-normal text-red-500/50 mt-0.5">Factory refused to address issues — archived</p>
                </button>
              </div>
            )}
            {isReadOnly && (
              <p className="text-xs text-[#94a3b8]">Awaiting factory response — a Dev team member will log the outcome.</p>
            )}
          </div>
        )}

        {step === "reply" && (
          <div>
            <div className="flex items-start gap-3 mb-4 rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <Clock size={16} className="shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-300">Revised sample pending — waiting on factory</p>
                <p className="text-xs text-amber-200/60 mt-0.5">Come back once you've received their reply and log it below.</p>
              </div>
            </div>
            {!showReplyForm ? (
              <button onClick={() => setShowReplyForm(true)} className="w-full rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] py-3 text-sm font-medium text-[#1d4ed8] hover:bg-[#2563eb]/30 transition">
                Revised sample received — log details
              </button>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#1d4ed8]">Factory response</span>
                  <textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} rows={4}
                    placeholder="Paste or type the factory's reply here..."
                    className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#64748b]" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#1d4ed8]">Expected return / sample date <span className="normal-case font-normal text-[#94a3b8]">(optional)</span></span>
                  <input type="date" value={returnDateDraft} onChange={(e) => setReturnDateDraft(e.target.value)}
                    className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
                </label>
                <div className="flex gap-2">
                  <button onClick={saveReply} disabled={!replyDraft.trim()} className="flex-1 rounded-md bg-[#2563eb] py-2.5 text-sm font-semibold text-[#0f172a] hover:opacity-90 disabled:opacity-40 transition">
                    Save factory response
                  </button>
                  <button onClick={() => setShowReplyForm(false)} className="rounded-md border border-[#bfdbfe]/50 px-4 py-2.5 text-sm text-[#64748b] hover:bg-[#eff6ff] transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "outcome" && (
          <div>
            <div className="rounded-md border border-[#bfdbfe]/40 bg-[#eff6ff] px-4 py-3 mb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Factory response</p>
                <div className="flex items-center gap-2">
                  {p.factoryComm?.tentativeReturnDate && (
                    <span className="text-xs text-[#d97706]">Return by {fmtDate(p.factoryComm.tentativeReturnDate)}</span>
                  )}
                  {!isReadOnly && (
                    <button onClick={() => { setShowReplyForm(true); setReplyDraft(p.factoryComm?.replyText ?? ""); setReturnDateDraft(p.factoryComm?.tentativeReturnDate ?? ""); }}
                      className="text-[10px] text-[#64748b] hover:text-[#1d4ed8] underline">Edit</button>
                  )}
                </div>
              </div>
              <p className="text-sm text-[#0f172a] whitespace-pre-wrap">{p.factoryComm?.replyText}</p>
              <p className="mt-1 text-[10px] text-[#94a3b8]">Logged {fmt(p.factoryComm?.replyAt ?? null)}</p>
            </div>

            {showReplyForm && (
              <div className="mb-4 space-y-3 rounded-md border border-[#bfdbfe]/40 bg-[#ffffff] p-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#1d4ed8]">Update factory response</span>
                  <textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} rows={3}
                    className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#1d4ed8]">Expected return date</span>
                  <input type="date" value={returnDateDraft} onChange={(e) => setReturnDateDraft(e.target.value)}
                    className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
                </label>
                <div className="flex gap-2">
                  <button onClick={saveReply} className="flex-1 rounded-md bg-[#2563eb] py-2 text-sm font-medium text-[#0f172a] hover:opacity-90">Update</button>
                  <button onClick={() => setShowReplyForm(false)} className="rounded-md border border-[#bfdbfe]/50 px-4 py-2 text-sm text-[#64748b] hover:bg-[#eff6ff]">Cancel</button>
                </div>
              </div>
            )}

            {!isReadOnly && !showReplyForm && (
              <div>
                <p className="text-xs text-[#64748b] mb-3">Revised sample received — what is the outcome?</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={factoryAgreesToFix} className="flex-1 rounded-md border border-green-500/30 bg-green-500/10 py-3 text-sm font-semibold text-green-400 hover:bg-green-500/20 transition">
                    Revised sample received — send for revised testing
                    <p className="text-[11px] font-normal text-green-500/60 mt-0.5">Returns to NPD Testing for a new test cycle</p>
                  </button>
                  <button onClick={factoryDenied} className="flex-1 rounded-md border border-red-500/30 bg-red-500/5 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 transition">
                    Factory denied improvement — product dropped
                    <p className="text-[11px] font-normal text-red-500/50 mt-0.5">Factory refused to address issues — archived</p>
                  </button>
                </div>
              </div>
            )}

            {p.factoryComm?.editHistory && p.factoryComm.editHistory.length > 0 && (
              <div className="mt-4 rounded-md bg-[#eff6ff] px-4 py-3 space-y-1">
                <p className="text-xs font-normal uppercase tracking-wide text-[#64748b]">Edit history</p>
                {p.factoryComm.editHistory.map((h, i) => (
                  <p key={i} className="text-xs text-[#1d4ed8]">
                    <span className="text-[#d97706]">{fmt(h.editedAt)}</span> — was: "{h.previousReply ?? "—"}" / {h.previousDate ?? "no date"}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Activity log */}
      {p.activityLog.length > 0 && (
        <div className="border-t border-[#bfdbfe]/20">
          <button onClick={() => setShowTimeline(!showTimeline)}
            className="flex w-full items-center justify-between px-5 py-3 text-xs text-[#64748b] hover:text-[#64748b] transition">
            <span>Activity log ({p.activityLog.length})</span>
            {showTimeline ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {showTimeline && (
            <div className="px-5 pb-4 space-y-2">
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
    </GridBeam>
  );
}

export default function OnHoldPage() {
  const { products, search } = useProducts();
  const [session, setSession] = useState<Session | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => { setSession(getSession()); }, []);

  const isQA = session?.role === "QA";
  const isSales = session?.role === "Sales";
  const isReadOnly = isQA || isSales;

  const q = search.toLowerCase();
  const visible = products.filter((p) => {
    if (p.status !== "On hold") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });

  useEffect(() => {
    if (visible.length > 0 && selectedId === null) setSelectedId(visible[0].id);
  }, [visible.length]);

  const selected = visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">On Hold</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">
        Products waiting on factory resolution. Select a product to see its current step and take action.
      </p>

      {visible.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-[#bfdbfe]/40 px-5 py-16 text-center">
          <p className="text-sm text-[#64748b]">No products currently on hold.</p>
          <p className="mt-1 text-xs text-[#94a3b8]">Products appear here when a decision of "On Hold" is made in Decision Pending.</p>
        </div>
      ) : (
        <>
          {/* Product switcher */}
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {visible.map((p) => {
              const active = p.id === (selected?.id ?? -1);
              const step = currentStep(p);
              const stepLabels: Record<Step, string> = {
                email: "Email factory",
                factory_response: "Factory response",
                reply: "Awaiting sample",
                outcome: "Decide outcome",
              };
              return (
                <button key={p.id} onClick={() => setSelectedId(p.id)}
                  className={`shrink-0 rounded-md border px-4 py-3 text-left transition min-w-[160px] ${active ? "border-[#f59e0b]/50 bg-[#eff6ff]" : "border-[#bfdbfe]/40 bg-[#ffffff] hover:bg-[#eff6ff]/60"}`}>
                  <p className={`text-sm font-medium truncate ${active ? "text-blue-700 font-semibold" : "text-slate-600"}`}>{p.codeName}</p>
                  <p className="text-[10px] text-[#64748b] mt-0.5">{stepLabels[step]}</p>
                  <StepBar step={step} />
                </button>
              );
            })}
          </div>

          {/* Selected product detail */}
          {selected && (
            <div className="mt-4">
              <HoldDetail key={selected.id} p={selected} isQA={isQA} isReadOnly={isReadOnly} />
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
