"use client";

import { useState, useRef, useEffect, FormEvent, DragEvent } from "react";
import { parseServerDate } from "@/lib/datetime";
import { useProducts, ProductRow, NpdReport, Status, FactoryComm } from "@/lib/products-context";
import { api, apiErrorMessage } from "@/lib/api";
import { PRIORITY_DOT } from "@/lib/colors";
import { Chip } from "@/components/Chip";
import { useToast } from "@/components/Toast";
import { ChevronDown, ChevronUp, FileText, X, Upload, CheckCircle2, PackageCheck } from "lucide-react";
import { uploadFile } from "@/lib/upload";

function fmt(value: string | null) {
  if (!value) return null;
  return parseServerDate(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function DeadlineBadge({ deadline }: { deadline?: string | null }) {
  if (!deadline) return null;
  const days = Math.ceil((parseServerDate(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0)  return <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">{Math.abs(days)}d overdue</span>;
  if (days <= 3) return <span className="rounded bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-400">{days}d left</span>;
  if (days <= 7) return <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">{days}d left</span>;
  return null;
}

export function NpdForm({ p, onSubmit }: { p: ProductRow; onSubmit?: () => void }) {
  const { addNotification, refreshProducts } = useProducts();
  const { showToast } = useToast();

  const isImprov = !!p.factoryComm?.improvementSampleExpected;
  const [outcome, setOutcome] = useState<"Pass" | "Not Pass" | null>(isImprov ? null : (p.npdReport?.outcome ?? null));
  const [notes, setNotes] = useState(isImprov ? "" : (p.npdReport?.notes ?? ""));
  const [reportFile, setReportFile] = useState<{ name: string; dataUrl: string } | null>(
    isImprov ? null : (p.npdReport?.fileName ? { name: p.npdReport.fileName, dataUrl: p.npdReport.fileDataUrl ?? "" } : null)
  );
  const [dragging, setDragging] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const improv = !!p.factoryComm?.improvementSampleExpected;
    setOutcome(improv ? null : (p.npdReport?.outcome ?? null));
    setNotes(improv ? "" : (p.npdReport?.notes ?? ""));
    setReportFile(improv ? null : (p.npdReport?.fileName ? { name: p.npdReport.fileName, dataUrl: p.npdReport.fileDataUrl ?? "" } : null));
    setShowLog(false);
  }, [p.id]);

  const MAX_FILE_MB = 5;

  async function readFile(f: File) {
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      showToast(`File too large — max ${MAX_FILE_MB}MB`);
      return;
    }
    setUploadingFile(true);
    try {
      // uploaded to R2 — DB only stores the URL
      const url = await uploadFile(f, "npd");
      setReportFile({ name: f.name, dataUrl: url });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFile(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) readFile(f);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!outcome || uploadingFile) return;
    try {
      await api.products.submitNpd(p.id, {
        outcome,
        notes: notes || undefined,
        file_name: reportFile?.name || undefined,
        file_url: reportFile?.dataUrl || undefined,
      }, p.version);
      await refreshProducts();
      addNotification({
        targetRoles: ["CEO", "Dev"],
        productId: p.id,
        productName: p.codeName,
        message: `NPD report submitted (${outcome}) — awaiting decision.`,
      });
      showToast("Report submitted — CEO & Dev notified");
      onSubmit?.();
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    }
  }

  const sampleNotReceived = !p.sampleReceived;

  const [markingSample, setMarkingSample] = useState(false);
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [editingReceivedDate, setEditingReceivedDate] = useState(false);
  const [receivedDateDraft, setReceivedDateDraft] = useState(p.sampleGivenDate ?? "");

  async function markReceived() {
    setMarkingSample(true);
    try {
      await api.products.update(p.id, { sample_received: true, sample_given_date: receivedDate }, p.version);
      await refreshProducts();
      showToast("Sample marked received");
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    } finally {
      setMarkingSample(false);
    }
  }

  async function saveReceivedDate() {
    if (!receivedDateDraft) return;
    setMarkingSample(true);
    try {
      await api.products.update(p.id, { sample_given_date: receivedDateDraft }, p.version);
      await refreshProducts();
      setEditingReceivedDate(false);
      showToast("Received date updated");
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    } finally {
      setMarkingSample(false);
    }
  }

  return (
    <div className="overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 px-5 py-4 border-b border-[#bfdbfe]/30">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-slate-900">{p.codeName}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs text-[#1d4ed8]">{p.skuCode} · <span className="text-[#64748b]">{parseServerDate(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })}</span></p>
            <DeadlineBadge deadline={p.deadline} />
          </div>
          {p.factory && <p className="mt-0.5 text-xs text-[#94a3b8]">Factory: {p.factory}</p>}
          {p.specifications && <p className="mt-0.5 text-xs text-[#94a3b8]">Specs: {p.specifications}</p>}
        </div>
        <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
      </div>

      {/* Sample received — big action at the top of the form */}
      <div className="mx-5 mt-4">
        {p.sampleReceived ? (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-green-600">
                <CheckCircle2 size={18} className="shrink-0" />
                Sample received{p.sampleGivenDate ? ` — ${parseServerDate(p.sampleGivenDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })}` : ""}
              </p>
              {!editingReceivedDate && (
                <button type="button" onClick={() => { setReceivedDateDraft(p.sampleGivenDate ?? ""); setEditingReceivedDate(true); }}
                  className="shrink-0 rounded-md border border-green-500/30 px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-500/10">
                  Edit date
                </button>
              )}
            </div>
            {editingReceivedDate && (
              <div className="mt-2 flex gap-2">
                <input type="date" value={receivedDateDraft} onChange={(e) => setReceivedDateDraft(e.target.value)}
                  className="flex-1 rounded-md border border-green-500/30 bg-white px-3 py-1.5 text-sm text-[#0f172a] outline-none focus:border-green-500" />
                <button type="button" onClick={saveReceivedDate} disabled={!receivedDateDraft || markingSample}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
                  Save
                </button>
                <button type="button" onClick={() => setEditingReceivedDate(false)}
                  className="rounded-md border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-500/10">
                  Cancel
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={markReceived}
              disabled={markingSample}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-green-500/50 bg-green-500/10 px-4 py-4 text-base font-bold text-green-600 transition hover:bg-green-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PackageCheck size={20} />
              {markingSample ? "Marking…" : "Sample received?"}
            </button>
            <div className="mt-2">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">Date received (defaults to today)</label>
              <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                className="w-full rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-green-500" />
            </div>
            <p className="mt-2 text-center text-xs text-amber-600">
              Confirm the sample has arrived to unlock the NPD report below.
            </p>
          </>
        )}
      </div>

      {/* Form */}
      <form onSubmit={submit} className={`px-5 py-5 space-y-5 ${sampleNotReceived ? "pointer-events-none opacity-40 select-none" : ""}`}>
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
                {o === "Pass" ? "Pass" : "Fail"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-[#94a3b8]">Either outcome goes to Decision Pending for CEO / Dev to review.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#1d4ed8]">Observations</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
            placeholder="1. Issue found with discharge test performance...&#10;2. LED indication issue...&#10;3. ..."
            className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#64748b]" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#1d4ed8]">
            Report file <span className="normal-case font-normal text-[#94a3b8]">(optional — PDF or Excel)</span>
          </label>
          <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
          {uploadingFile ? (
            <div className="flex items-center justify-center rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] px-4 py-6">
              <p className="animate-pulse text-sm text-[#1d4ed8]">Uploading…</p>
            </div>
          ) : reportFile ? (
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
                dragging ? "border-[#3b82f6] bg-[#eff6ff]" : "border-[#bfdbfe]/50 bg-[#eff6ff] hover:border-[#93c5fd]/60 hover:bg-[#dbeafe]"
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

        <button type="submit" disabled={!outcome || uploadingFile}
          className="w-full rounded-md bg-[#2563eb] py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition">
          {uploadingFile ? "Uploading file…" : "Submit & Send to Decision"}
        </button>
      </form>

      {/* Activity log */}
      {p.activityLog.length > 0 && (
        <div className="border-t border-[#bfdbfe]/20">
          <button onClick={() => setShowLog(!showLog)}
            className="flex w-full items-center justify-between px-5 py-3 text-xs text-[#64748b] hover:text-[#1d4ed8] transition">
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
