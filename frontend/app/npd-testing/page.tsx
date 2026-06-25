"use client";

import { useState, useRef, useEffect, FormEvent, DragEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { Chip } from "@/components/Chip";
import { useProducts, Status, ProductRow, NpdReport } from "@/lib/products-context";
import { PRIORITY_DOT } from "@/lib/colors";
import { getSession } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { ChevronDown, ChevronUp, FileText, X, Upload } from "lucide-react";
import { GridBeam } from "@/components/ui/grid-beam";

function fmt(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0)  return <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">{Math.abs(days)}d overdue</span>;
  if (days <= 3) return <span className="rounded bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-400">{days}d left</span>;
  if (days <= 7) return <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">{days}d left</span>;
  return null;
}

function NpdForm({ p }: { p: ProductRow }) {
  const { setProducts, addNotification } = useProducts();
  const { showToast } = useToast();

  const [outcome, setOutcome] = useState<"Pass" | "Not Pass" | null>(p.npdReport?.outcome ?? null);
  const [notes, setNotes] = useState(p.npdReport?.notes ?? "");
  const [reportFile, setReportFile] = useState<{ name: string; dataUrl: string } | null>(
    p.npdReport?.fileName ? { name: p.npdReport.fileName, dataUrl: p.npdReport.fileDataUrl ?? "" } : null
  );
  const [dragging, setDragging] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset state when product changes
  useEffect(() => {
    setOutcome(p.npdReport?.outcome ?? null);
    setNotes(p.npdReport?.notes ?? "");
    setReportFile(p.npdReport?.fileName ? { name: p.npdReport.fileName, dataUrl: p.npdReport.fileDataUrl ?? "" } : null);
    setShowLog(false);
  }, [p.id]);

  function readFile(f: File) {
    const reader = new FileReader();
    reader.onload = (ev) => setReportFile({ name: f.name, dataUrl: ev.target?.result as string });
    reader.readAsDataURL(f);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) readFile(f);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!outcome) return;
    const now = new Date().toISOString();
    const report: NpdReport = {
      fileName: reportFile?.name ?? null,
      fileDataUrl: reportFile?.dataUrl ?? null,
      outcome, notes,
      submittedAt: now,
    };
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      status: "Pending Decision" as Status,
      statusChangedAt: now,
      npdReport: report,
      activityLog: [...x.activityLog, {
        action: `NPD report submitted — ${outcome}`,
        timestamp: now,
        note: notes || undefined,
        stages: [x.activityLog.some(e => e.stages?.includes("REVISED TESTING: PENDING"))
          ? (outcome === "Pass" ? "REVISED TESTING: PASS" : "REVISED TESTING: FAIL")
          : (outcome === "Pass" ? "NPD TESTING: PASS" : "NPD TESTING: FAIL")],
      }],
    }));
    addNotification({
      targetRoles: ["CEO", "Dev"],
      productId: p.id,
      productName: p.codeName,
      message: `NPD report submitted (${outcome}) — awaiting decision.`,
    });
    showToast("Report submitted — CEO & Dev notified");
  }

  return (
    <div className="rounded-md border border-[#bfdbfe]/40 bg-[#ffffff] overflow-hidden">

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 px-5 py-4 border-b border-[#bfdbfe]/30">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-white">{p.codeName}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs text-[#1d4ed8]">{p.skuCode} · <span className="text-[#64748b]">{new Date(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></p>
            <DeadlineBadge deadline={p.deadline} />
          </div>
          {p.factory && <p className="mt-0.5 text-xs text-[#94a3b8]">Factory: {p.factory}</p>}
          {p.specifications && <p className="mt-0.5 text-xs text-[#94a3b8]">Specs: {p.specifications}</p>}
        </div>
        <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
      </div>

      {/* Form */}
      <form onSubmit={submit} className="px-5 py-5 space-y-5">

        {/* Outcome */}
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[#1d4ed8]">
            Test outcome <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-3">
            {(["Pass", "Not Pass"] as const).map((o) => (
              <button key={o} type="button" onClick={() => setOutcome(o)}
                className={`flex-1 rounded-md border py-3 text-sm font-semibold transition ${
                  outcome === o
                    ? o === "Pass" ? "border-green-500 bg-green-500/20 text-green-400" : "border-red-500 bg-red-500/20 text-red-400"
                    : "border-[#bfdbfe]/50 bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe]"
                }`}>
                {o === "Pass" ? "✓ Pass" : "✕ Fail"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-[#94a3b8]">Either outcome goes to Decision Pending for CEO / Dev to review.</p>
        </div>

        {/* Observations */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#1d4ed8]">Observations</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
            placeholder="1. Issue found with discharge test performance...&#10;2. LED indication issue...&#10;3. ..."
            className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#64748b]" />
        </div>

        {/* File upload */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#1d4ed8]">
            Report file <span className="normal-case font-normal text-[#94a3b8]">(optional — PDF or Excel)</span>
          </label>
          <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
          {reportFile ? (
            <div className="flex items-center gap-3 rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] px-4 py-3">
              <FileText size={20} className="shrink-0 text-[#3b82f6]" />
              <p className="flex-1 min-w-0 text-sm text-[#0f172a] truncate">{reportFile.name}</p>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-[#64748b] hover:text-[#1d4ed8] underline">Replace</button>
                <button type="button" onClick={() => setReportFile(null)} className="text-[#94a3b8] hover:text-red-400 transition"><X size={15} /></button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-6 text-center transition ${
                dragging ? "border-[#3b82f6] bg-[#0a2540]" : "border-[#bfdbfe]/50 bg-[#eff6ff] hover:border-[#93c5fd]/60 hover:bg-[#dbeafe]"
              }`}
            >
              <Upload size={20} className={dragging ? "text-[#3b82f6]" : "text-[#94a3b8]"} />
              <div>
                <p className="text-sm font-medium text-[#1d4ed8]">{dragging ? "Drop to attach" : "Drag & drop or click to upload"}</p>
                <p className="text-xs text-[#94a3b8]">PDF, XLS, XLSX</p>
              </div>
            </div>
          )}
        </div>

        <button type="submit" disabled={!outcome}
          className="w-full rounded-md bg-[#2563eb] py-3 text-sm font-semibold text-[#0f172a] hover:opacity-90 disabled:opacity-40 transition">
          Submit & Send to Decision
        </button>
      </form>

      {/* Activity log */}
      {p.activityLog.length > 0 && (
        <div className="border-t border-[#bfdbfe]/20">
          <button onClick={() => setShowLog(!showLog)}
            className="flex w-full items-center justify-between px-5 py-3 text-xs text-[#64748b] hover:text-[#64748b] transition">
            <span>Activity log ({p.activityLog.length})</span>
            {showLog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {showLog && (
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
    </div>
  );
}

export default function NpdTestingPage() {
  const { products, search } = useProducts();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null);
  useEffect(() => { setSession(getSession()); }, []);
  const isSales = session?.role === "Sales";

  const q = search.toLowerCase();
  const visible = products
    .filter((p) => {
      if (p.status !== "Pending NPD") return false;
      if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
      return true;
    })
    .sort((a, b) => {
      const ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
      return ORDER[a.priority] - ORDER[b.priority];
    });

  useEffect(() => {
    if (visible.length > 0 && selectedId === null) setSelectedId(visible[0].id);
  }, [visible.length]);

  const selected = visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">NPD Testing</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">Products waiting to be tested by QA. Select a product, fill in the outcome and submit.</p>

      {visible.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-[#bfdbfe]/50 px-5 py-16 text-center text-sm text-[#64748b]">
          No products waiting for NPD testing.
          <p className="mt-1 text-xs text-[#94a3b8]">Once a product is added, it will appear here for QA to test.</p>
        </div>
      ) : (
        <>
          {/* Product switcher */}
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {visible.map((p) => {
              const active = p.id === (selected?.id ?? -1);
              const days = Math.ceil((new Date(p.deadline).getTime() - Date.now()) / 86400000);
              return (
                <button key={p.id} onClick={() => setSelectedId(p.id)}
                  className={`shrink-0 rounded-md border px-4 py-3 text-left transition min-w-[160px] ${active ? "border-[#3b82f6]/60 bg-[#eff6ff]" : "border-[#bfdbfe]/40 bg-[#ffffff] hover:bg-[#eff6ff]/60"}`}>
                  <p className={`text-sm font-medium truncate ${active ? "text-blue-700 font-semibold" : "text-slate-600"}`}>{p.codeName}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_DOT[p.priority] }} />
                    <p className="text-[10px] text-[#64748b]">{p.priority}</p>
                    {days <= 7 && days >= 0 && <p className="text-[10px] text-orange-400 ml-auto">{days}d left</p>}
                    {days < 0 && <p className="text-[10px] text-red-400 ml-auto">overdue</p>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected product form */}
          {selected && (
            <GridBeam rows={4} cols={6} colorVariant="colorful" theme="dark" active className="mt-4 rounded-md border border-[#bfdbfe]/40 bg-[#ffffff]/60">
              {isSales ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-[#64748b]">NPD testing is handled by QA.</p>
                  <p className="text-xs text-[#94a3b8] mt-1">You'll be notified once a product is approved and ready for ordering.</p>
                </div>
              ) : (
                <NpdForm key={selected.id} p={selected} />
              )}
            </GridBeam>
          )}
        </>
      )}
    </AppShell>
  );
}
