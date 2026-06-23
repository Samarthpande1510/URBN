"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { Chip } from "@/components/Chip";
import { useProducts, Status, ProductRow, NpdReport } from "@/lib/products-context";
import { STATUS_DOT, PRIORITY_DOT } from "@/lib/colors";
import { getSession, Session } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { ChevronDown, ChevronUp } from "lucide-react";
import { GridBeam } from "@/components/ui/grid-beam";

type Filter = "All" | "Pending NPD" | "Pending Decision" | "Approved" | "On hold";
const FILTERS: Filter[] = ["All", "Pending NPD", "Pending Decision", "Approved", "On hold"];

function fmt(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Row({ label, value, pending }: { label: string; value: string | null; pending?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#1a3a6e]/30 py-3 last:border-0">
      <span className="text-sm text-[#90bce0]">{label}</span>
      <span className={`text-sm ${value ? "font-medium text-[#ddeeff]" : "text-[#5a8fc4]"}`}>
        {value ? fmt(value) : (pending ?? "—")}
      </span>
    </div>
  );
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0)
    return <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">{Math.abs(days)}d overdue</span>;
  if (days <= 3)
    return <span className="rounded bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-400">{days}d left</span>;
  if (days <= 7)
    return <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">{days}d left</span>;
  return null;
}

export default function NpdTestingPage() {
  const { products, setProducts, addNotification, search } = useProducts();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>("All");
  const [session, setSession] = useState<Session | null>(null);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  // NPD report modal
  const [reportId, setReportId] = useState<number | null>(null);
  const [reportFile, setReportFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [outcome, setOutcome] = useState<"Pass" | "Not Pass" | null>(null);
  const [notes, setNotes] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Hold modal
  const [holdId, setHoldId] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [returnDateDraft, setReturnDateDraft] = useState("");

  useEffect(() => { setSession(getSession()); }, []);

  const isQA = session?.role === "QA";

  const STATUS_ORDER: Record<string, number> = { "Pending NPD": 0, "Pending Decision": 1, "On hold": 2, Approved: 3 };
  const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

  const q = search.toLowerCase();
  const visible = products
    .filter((p) => {
      if (p.status === "Rejected") return false;
      if (filter !== "All" && p.status !== filter) return false;
      if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
      return true;
    })
    .sort((a, b) => {
      const statusDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (statusDiff !== 0) return statusDiff;
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    });

  const counts: Record<Filter, number> = {
    All: products.filter((p) => p.status !== "Rejected").length,
    "Pending NPD": products.filter((p) => p.status === "Pending NPD").length,
    "Pending Decision": products.filter((p) => p.status === "Pending Decision").length,
    Approved: products.filter((p) => p.status === "Approved").length,
    "On hold": products.filter((p) => p.status === "On hold").length,
  };

  const reportProduct = products.find((p) => p.id === reportId) ?? null;
  const holdProduct = products.find((p) => p.id === holdId) ?? null;

  function openReport(p: ProductRow) {
    setReportId(p.id);
    if (p.npdReport) {
      setOutcome(p.npdReport.outcome);
      setNotes(p.npdReport.notes);
      setReportFile(p.npdReport.fileName ? { name: p.npdReport.fileName, dataUrl: p.npdReport.fileDataUrl ?? "" } : null);
    } else {
      setOutcome(null); setNotes(""); setReportFile(null);
    }
  }

  function submitReport(e: FormEvent) {
    e.preventDefault();
    if (!reportProduct || !outcome) return;
    const now = new Date().toISOString();
    const report: NpdReport = { fileName: reportFile?.name ?? null, fileDataUrl: reportFile?.dataUrl ?? null, outcome, notes, submittedAt: now };

    if (outcome === "Not Pass") {
      setProducts((prev) => prev.map((p) => p.id === reportProduct.id ? {
        ...p,
        status: "Rejected" as Status,
        statusChangedAt: now,
        npdReport: report,
        activityLog: [...p.activityLog, { action: `NPD report submitted — Not Pass`, timestamp: now, note: notes || undefined }, { action: "Archived — failed NPD", timestamp: now }],
      } : p));
      showToast("Report submitted — product archived");
    } else {
      setProducts((prev) => prev.map((p) => p.id === reportProduct.id ? {
        ...p,
        status: "Pending Decision" as Status,
        statusChangedAt: now,
        npdReport: report,
        activityLog: [...p.activityLog, { action: "NPD report submitted — Pass", timestamp: now, note: notes || undefined }],
      } : p));
      addNotification({ targetRoles: ["CEO", "Dev"], productId: reportProduct.id, productName: reportProduct.codeName, message: "NPD report passed — awaiting CEO decision." });
      showToast("Report submitted — CEO & Dev notified");
    }
    setReportId(null);
  }

  function ceoDecide(productId: number, productName: string, decision: "Approved" | "On hold" | "Rejected") {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((p) => {
      if (p.id !== productId) return p;
      const base = { ...p, status: decision as Status, statusChangedAt: now, activityLog: [...p.activityLog, { action: `CEO decision: ${decision}`, timestamp: now }] };
      if (decision === "Approved") {
        return { ...base, goldenWorkflow: { purchaseNotifiedAt: null, orderConfirmedAt: null, purchaseLog: [], details: null, compliance: null, packaging: null, goldenSample: null } };
      }
      if (decision === "On hold") {
        return { ...base, factoryComm: { decidedAction: null as null, decidedAt: null, acknowledgedAt: null, replyAt: null, replyText: null, tentativeReturnDate: null, editHistory: [] } };
      }
      return base;
    }));
    if (decision === "Rejected") {
      addNotification({ targetRoles: ["CEO", "Dev", "Purchase"], productId, productName, message: `Product rejected by CEO.` });
    }
    showToast(`Product ${decision.toLowerCase()}`);
  }

  function openHold(p: ProductRow) {
    setHoldId(p.id);
    setReplyDraft(p.factoryComm?.replyText ?? "");
    setReturnDateDraft(p.factoryComm?.tentativeReturnDate ?? "");
  }

  function decideFactory(action: "EMAIL_FACTORY" | "DROP") {
    if (!holdProduct) return;
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((p) => {
      if (p.id !== holdProduct.id) return p;
      if (action === "DROP") return {
        ...p, status: "Rejected" as Status, statusChangedAt: now,
        activityLog: [...p.activityLog, { action: "Dropped — product rejected", timestamp: now }],
      };
      return {
        ...p, statusChangedAt: now,
        factoryComm: { decidedAction: "EMAIL_FACTORY", decidedAt: now, acknowledgedAt: null, replyAt: null, replyText: null, tentativeReturnDate: null, editHistory: [] },
        activityLog: [...p.activityLog, { action: "Factory emailed", timestamp: now }],
      };
    }));
    if (action === "EMAIL_FACTORY") {
      addNotification({ targetRoles: ["Dev"], productId: holdProduct.id, productName: holdProduct.codeName, message: "Factory has been emailed — acknowledge when ready." });
      showToast("Factory emailed — Dev team notified");
    } else {
      addNotification({ targetRoles: ["CEO"], productId: holdProduct.id, productName: holdProduct.codeName, message: "Product has been dropped and rejected." });
      showToast("Product dropped — CEO notified");
      setHoldId(null);
    }
  }

  function rejectFromHold() {
    if (!holdProduct) return;
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((p) => p.id === holdProduct.id ? {
      ...p, status: "Rejected" as Status, statusChangedAt: now,
      activityLog: [...p.activityLog, { action: "Rejected after hold — factory response unsatisfactory", timestamp: now }],
    } : p));
    addNotification({ targetRoles: ["CEO"], productId: holdProduct.id, productName: holdProduct.codeName, message: "Product rejected after hold — factory response was unsatisfactory." });
    showToast("Product rejected — CEO notified");
    setHoldId(null);
  }

  function restoreProduct(productId: number, productName: string) {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((p) => p.id === productId ? {
      ...p, status: "Pending NPD" as Status, statusChangedAt: now,
      factoryComm: undefined,
      activityLog: [...p.activityLog, { action: "Restored to Pending NPD", timestamp: now }],
    } : p));
    addNotification({ targetRoles: ["CEO", "Dev"], productId, productName, message: "Product has been restored to Pending NPD." });
    showToast("Product restored to Pending NPD");
  }

  function acknowledge() {
    if (!holdProduct) return;
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((p) =>
      p.id === holdProduct.id && p.factoryComm
        ? { ...p, factoryComm: { ...p.factoryComm, acknowledgedAt: now }, activityLog: [...p.activityLog, { action: "Dev team acknowledged", timestamp: now }] }
        : p
    ));
    showToast("Acknowledged");
  }

  function saveReply() {
    if (!holdProduct?.factoryComm) return;
    const now = new Date().toISOString();
    const prev_reply = holdProduct.factoryComm.replyText;
    const prev_date = holdProduct.factoryComm.tentativeReturnDate;
    const isEdit = !!holdProduct.factoryComm.replyAt;
    setProducts((prev) => prev.map((p) => {
      if (p.id !== holdProduct.id || !p.factoryComm) return p;
      return {
        ...p,
        factoryComm: {
          ...p.factoryComm,
          replyText: replyDraft,
          tentativeReturnDate: returnDateDraft,
          replyAt: p.factoryComm.replyAt ?? now,
          editHistory: isEdit
            ? [...p.factoryComm.editHistory, { editedAt: now, previousReply: prev_reply, previousDate: prev_date }]
            : p.factoryComm.editHistory,
        },
        activityLog: [...p.activityLog, { action: isEdit ? "Factory reply updated" : "Factory reply logged", timestamp: now, note: replyDraft }],
      };
    }));
    showToast(isEdit ? "Reply updated" : "Reply saved");
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-white">NPD Testing</h1>
      <p className="mt-1 text-sm text-[#90bce0]">Track test reports and decisions across all active products.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded border px-4 py-1.5 text-sm transition ${filter === f ? "border-[#2a6aaa] bg-[#1a4a8a] text-[#ddeeff]" : "border-[#1a3a6e]/50 bg-[#060f26] text-[#90bce0] hover:bg-[#0a1e42]"}`}>
            {f} <span className="ml-1 opacity-60 tabular-nums">{counts[f]}</span>
          </button>
        ))}
      </div>

      <GridBeam rows={5} cols={6} colorVariant="colorful" theme="dark" active className="mt-6 rounded-md border border-[#1a3a6e]/40 bg-[#060f26]/60 p-3 space-y-3">
        {visible.length === 0 && (
          <div className="rounded-md border border-[#1a3a6e]/40 bg-[#060f26] px-5 py-10 text-center text-sm text-[#5a8fc4]">No products match this filter.</div>
        )}

        {visible.map((p) => (
          <div key={p.id} className="rounded-md border border-[#1a3a6e]/40 bg-[#060f26] overflow-hidden">
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white">{p.codeName}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-[#90bce0]">{p.skuCode} · <span className="text-[#5a8fc4]">{new Date(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></p>
                  <DeadlineBadge deadline={p.deadline} />
                </div>
              </div>
              <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />

              <div className="flex flex-wrap gap-2">
                {/* NPD report button — all roles */}
                <button onClick={() => openReport(p)}
                  className="rounded-lg border border-[#2a6aaa]/50 px-3 py-1.5 text-xs font-medium text-[#90bce0] hover:bg-[#1a4a8a]/40 hover:text-[#ddeeff]">
                  {p.npdReport ? (p.status === "Pending NPD" ? "Re-upload Report" : "View Report") : "Upload Report"}
                </button>

                {/* Manage hold */}
                {p.status === "On hold" && (
                  <button onClick={() => openHold(p)} className="rounded-lg border border-[#f0c060]/30 px-3 py-1.5 text-xs font-medium text-[#f0c060] hover:bg-[#f0c060]/10">Manage Hold</button>
                )}

                {/* Activity log toggle */}
                <button onClick={() => setExpandedLog(expandedLog === p.id ? null : p.id)}
                  className="flex items-center gap-1 rounded-lg border border-[#1a3a6e]/50 px-3 py-1.5 text-xs text-[#5a8fc4] hover:bg-[#0a1e42] hover:text-[#90bce0]">
                  Timeline {expandedLog === p.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>
            </div>

            {/* Status banner */}
            {(p.status === "Pending Decision" || p.status === "Approved" || p.status === "On hold") && (
              <div className="border-t border-[#1a3a6e]/30 px-5 py-3 flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full shrink-0 ${
                  p.status === "Approved" ? "bg-green-400" :
                  p.status === "On hold" ? "bg-amber-400" :
                  "bg-sky-400"
                }`} />
                <p className="font-medium text-sm text-white">
                  {p.status === "Approved" ? "Accepted" : p.status}
                </p>
                {p.statusChangedAt && <p className="text-xs text-[#5a8fc4]">since {fmt(p.statusChangedAt)}</p>}
              </div>
            )}

            {/* Decision panel — compact, non-QA only */}
            {p.status === "Pending Decision" && !isQA && (
              <div className="border-t border-[#1a3a6e]/30 px-5 py-3 flex items-center gap-2">
                <span className="text-xs text-[#5a8fc4] mr-1">Decide:</span>
                <button onClick={() => ceoDecide(p.id, p.codeName, "Approved")} className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-1.5 text-sm font-medium text-green-400 hover:bg-green-500/20">Approve</button>
                <button onClick={() => ceoDecide(p.id, p.codeName, "On hold")} className="rounded-lg border border-[#f0c060]/30 bg-[#f0c060]/10 px-4 py-1.5 text-sm font-medium text-[#f0c060] hover:bg-[#f0c060]/20">Hold</button>
                <button onClick={() => ceoDecide(p.id, p.codeName, "Rejected")} className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20">Reject</button>
              </div>
            )}

            {/* Activity log */}
            {expandedLog === p.id && p.activityLog.length > 0 && (
              <div className="border-t border-[#1a3a6e]/30 px-5 py-3 space-y-2">
                <p className="text-xs font-normal uppercase tracking-wide text-[#5a8fc4]">Timeline</p>
                {[...p.activityLog].reverse().map((entry, i) => (
                  <div key={i} className="flex gap-3 text-xs">
                    <span className="text-[#f0c060] tabular-nums shrink-0">{fmt(entry.timestamp)}</span>
                    <span className="text-[#ddeeff]">{entry.action}</span>
                    {entry.note && <span className="text-[#90bce0] truncate">— {entry.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </GridBeam>

      {/* NPD Report modal */}
      <Modal open={!!reportProduct} onClose={() => setReportId(null)}>
        {reportProduct && (
          <form onSubmit={submitReport}>
            <h2 className="text-lg font-semibold text-[#ddeeff]">Upload NPD Report</h2>
            <p className="mt-0.5 text-sm text-[#90bce0]">{reportProduct.codeName} · {reportProduct.skuCode}</p>

            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#90bce0]">Report file</label>
                <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => setReportFile({ name: f.name, dataUrl: ev.target?.result as string });
                    reader.readAsDataURL(f);
                  }} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-[#1a3a6e]/50 bg-[#0a1e42] py-8 text-sm text-[#90bce0] hover:bg-[#0d2550]">
                  <span className="text-2xl">↑</span>
                  <span className="mt-2">{reportFile?.name ?? "Click to upload — PDF or Excel"}</span>
                </button>
              </div>

              <div>
                <label className="mb-2 block text-xs font-normal uppercase tracking-wide text-[#90bce0]">Test outcome *</label>
                <div className="flex gap-3">
                  {(["Pass", "Not Pass"] as const).map((o) => (
                    <button key={o} type="button" onClick={() => setOutcome(o)}
                      className={`flex-1 rounded-md border py-2.5 text-sm font-medium transition ${
                        outcome === o
                          ? o === "Pass" ? "border-green-500 bg-green-500/20 text-green-400" : "border-red-500 bg-red-500/20 text-red-400"
                          : "border-[#1a3a6e]/50 bg-[#0a1e42] text-[#90bce0] hover:bg-[#0d2550]"
                      }`}>
                      {o === "Pass" ? "✓ Pass" : "✕ Not Pass"}
                    </button>
                  ))}
                </div>
                {outcome === "Not Pass" && <p className="mt-2 text-xs text-red-400">Product will be archived immediately.</p>}
                {outcome === "Pass" && <p className="mt-2 text-xs text-green-400">CEO and Dev team will be notified for a decision.</p>}
              </div>

              <div>
                <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#90bce0]">QA notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                  placeholder="Summary of key findings..."
                  className="w-full rounded-md border border-[#1a3a6e]/50 bg-[#0a1e42] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa] placeholder:text-[#5a8fc4]" />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setReportId(null)} className="flex-1 rounded-md border border-[#1a3a6e]/50 bg-[#060f26] py-2.5 text-sm text-[#90bce0] hover:bg-[#0a1e42]">Cancel</button>
              <button type="submit" disabled={!outcome}
                className="flex-1 rounded-md bg-[#1a4a8a] py-2.5 text-sm font-medium text-[#ddeeff] hover:opacity-90 disabled:opacity-40">
                Submit Report
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Hold management modal */}
      <Modal open={!!holdProduct} onClose={() => setHoldId(null)}>
        {holdProduct && (
          <div>
            <h2 className="text-lg font-semibold text-[#ddeeff]">{holdProduct.codeName}</h2>
            <p className="mt-0.5 text-sm text-[#90bce0]">{holdProduct.skuCode} — on hold</p>

            {!holdProduct.factoryComm?.decidedAction ? (
              <div className="mt-6">
                <p className="text-sm text-[#90bce0]">No action taken yet. Choose one:</p>
                <div className="mt-4 flex gap-3">
                  <button onClick={() => decideFactory("EMAIL_FACTORY")} className="flex-1 rounded-md bg-[#1a4a8a] py-2.5 text-sm font-medium text-[#ddeeff] hover:opacity-90">Email factory</button>
                  {!isQA && (
                    <button onClick={() => decideFactory("DROP")} className="flex-1 rounded-md border border-[#1a3a6e]/50 bg-[#060f26] py-2.5 text-sm font-medium text-red-400 hover:bg-[#0a1e42]">Drop product</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-1">
                <Row label="Factory emailed" value={holdProduct.factoryComm.decidedAt} />

                {!holdProduct.factoryComm.acknowledgedAt ? (
                  <div className="flex items-center justify-between border-b border-[#1a3a6e]/30 py-3">
                    <span className="text-sm text-[#90bce0]">Dev team acknowledged</span>
                    <button onClick={acknowledge} className="rounded-lg bg-[#1a4a8a] px-3 py-1 text-xs font-medium text-[#ddeeff] hover:opacity-90">Mark acknowledged</button>
                  </div>
                ) : (
                  <Row label="Dev team acknowledged" value={holdProduct.factoryComm.acknowledgedAt} />
                )}

                <div className="pt-3 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#90bce0]">
                      Factory reply {holdProduct.factoryComm.replyAt && <span className="text-[#f0c060] normal-case font-normal">· last saved {fmt(holdProduct.factoryComm.replyAt)}</span>}
                    </span>
                    <textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} rows={3}
                      placeholder="Paste factory reply here..."
                      className="w-full rounded-md border border-[#1a3a6e]/50 bg-[#0a1e42] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa] placeholder:text-[#5a8fc4]" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#90bce0]">Tentative return date</span>
                    <input type="date" value={returnDateDraft} onChange={(e) => setReturnDateDraft(e.target.value)}
                      className="w-full rounded-md border border-[#1a3a6e]/50 bg-[#0a1e42] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa]" />
                  </label>
                  <div className="flex gap-2">
                    <button onClick={saveReply} className="flex-1 rounded-md bg-[#1a4a8a] py-2.5 text-sm font-medium text-[#ddeeff] hover:opacity-90">
                      {holdProduct.factoryComm.replyAt ? "Update reply" : "Save reply"}
                    </button>
                    {!isQA && (
                      <button onClick={rejectFromHold} className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20">
                        Reject
                      </button>
                    )}
                  </div>

                  {holdProduct.factoryComm.editHistory.length > 0 && (
                    <div className="rounded-md bg-[#0a1e42] px-4 py-3 space-y-1">
                      <p className="text-xs font-normal uppercase tracking-wide text-[#5a8fc4]">Edit history</p>
                      {holdProduct.factoryComm.editHistory.map((h, i) => (
                        <p key={i} className="text-xs text-[#90bce0]"><span className="text-[#f0c060]">{fmt(h.editedAt)}</span> — was: "{h.previousReply ?? "—"}" / {h.previousDate ?? "no date"}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <button onClick={() => setHoldId(null)} className="mt-4 w-full rounded-md border border-[#1a3a6e]/50 bg-[#060f26] py-2 text-sm text-[#90bce0] hover:bg-[#0a1e42]">Close</button>
          </div>
        )}
      </Modal>

      {/* Rejected / archived section */}
      {products.filter((p) => p.status === "Rejected").length > 0 && (
        <div className="mt-10">
          <p className="text-sm font-medium text-[#5a8fc4]">Rejected ({products.filter((p) => p.status === "Rejected").length})</p>
          <p className="mt-0.5 text-xs text-[#3a5a8a]">Archived products. Restore to put back into Pending NPD.</p>
          <div className="mt-3 space-y-2">
            {products.filter((p) => p.status === "Rejected").map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-md border border-[#1a3a6e]/30 bg-[#060f26] px-5 py-3 opacity-70">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#90bce0]">{p.codeName}</p>
                  <p className="text-xs text-[#3a5a8a]">{p.skuCode} · Rejected {p.statusChangedAt ? new Date(p.statusChangedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</p>
                </div>
                {!isQA && (
                  <button onClick={() => restoreProduct(p.id, p.codeName)}
                    className="shrink-0 rounded-lg border border-[#2a6aaa]/40 px-3 py-1.5 text-xs font-medium text-[#90bce0] hover:bg-[#1a4a8a]/30 hover:text-[#ddeeff]">
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
