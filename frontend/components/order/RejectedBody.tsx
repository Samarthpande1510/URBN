"use client";

import { useState, useEffect } from "react";
import { useProducts, ProductRow, RejectionComment } from "@/lib/products-context";
import { getSession, Session } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { GridBeam } from "@/components/ui/grid-beam";
import { api, apiErrorMessage } from "@/lib/api";

const STAGE_PILL_STYLE: Record<string, string> = {
  "EMAILED TO FACTORY":      "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "IMPROVEMENT REQUIREMENT": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "GOLDEN SAMPLES PENDING":  "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "ORDER PLACED":            "bg-green-500/15 text-green-400 border-green-500/30",
  "NPD TESTING: PASS":       "bg-green-500/15 text-green-400 border-green-500/30",
  "NPD TESTING: FAIL":       "bg-red-500/15 text-red-400 border-red-500/30",
  "REJECTED":                "bg-red-500/15 text-red-400 border-red-500/30",
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
  for (const entry of p.activityLog) {
    if (entry.stages) stages.push(...entry.stages);
  }
  return stages.length > 0 ? stages : ["EMAILED TO FACTORY"];
}

function fmt(v: string | null | undefined) {
  if (!v) return null;
  return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0)  return <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">{Math.abs(days)}d overdue</span>;
  if (days <= 3) return <span className="rounded bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-400">{days}d left</span>;
  if (days <= 7) return <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">{days}d left</span>;
  return null;
}

type CEOAction = "onhold" | "archive";
interface VerdictState { type: CEOAction; remarks: string }

export function RejectedBody() {
  const { products, addNotification, refreshProducts, search } = useProducts();
  const { showToast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [noteInput, setNoteInput] = useState<Record<number, string>>({});
  const [verdict, setVerdict] = useState<Record<number, VerdictState>>({});
  useEffect(() => { setSession(getSession()); }, []);

  const isCEO = session?.role === "CEO";
  const q = search.toLowerCase();
  const visible = products.filter((p) => {
    if (p.status !== "Rejected") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q);
    return true;
  });

  function addNote(p: ProductRow) {
    const text = (noteInput[p.id] ?? "").trim(); if (!text) return;
    const now = new Date().toISOString();
    const comment: RejectionComment = { by: session?.name ?? "Unknown", reason: text, timestamp: now };
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      rejectionComments: [...(x.rejectionComments ?? []), comment],
      activityLog: [...x.activityLog, { action: `Rejection note added by ${session?.name ?? "Unknown"}`, timestamp: now }],
    }));
    setNoteInput((prev) => ({ ...prev, [p.id]: "" }));
  }

  async function moveToOnHold(p: ProductRow, remarks: string) {
    try {
      await api.products.submitDecision(p.id, "On hold", remarks || undefined, p.version);
      await refreshProducts();
      addNotification({ targetRoles: ["CEO", "Dev"], productId: p.id, productName: p.codeName, message: `${p.codeName} moved back to On Hold by CEO.` });
      showToast("Moved back to On Hold");
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    }
    setVerdict((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
  }

  async function archiveProduct(p: ProductRow, remarks: string) {
    try {
      await api.products.archive(p.id, remarks || undefined, p.version);
      await refreshProducts();
      addNotification({ targetRoles: ["CEO", "Dev"], productId: p.id, productName: p.codeName, message: `${p.codeName} archived.` });
      showToast("Product archived");
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    }
    setVerdict((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
  }

  function openVerdict(id: number, type: CEOAction) {
    setVerdict((prev) => {
      if (prev[id]?.type === type) { const n = { ...prev }; delete n[id]; return n; }
      return { ...prev, [id]: { type, remarks: "" } };
    });
  }

  return (
    <>
      <p className="mt-1 text-sm text-red-400">
        Products that did not pass NPD testing or were rejected after review.
        <span className="ml-1 text-[#94a3b8]">Only the CEO can archive products.</span>
      </p>

      <GridBeam rows={6} cols={8} colorVariant="sunset" theme="dark" active className="mt-4 overflow-hidden rounded-md border border-red-500/20 bg-[#ffffff]/80">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-red-500/15 text-[#0f172a]">
                <th className="pl-4 pr-2 py-3 w-14" />
                <th className="px-4 py-3 font-medium">
                  Product
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Code name · Factory</p>
                </th>
                <th className="px-4 py-3 font-medium w-48">
                  Remarks
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Decision Pending feedback</p>
                </th>
                <th className="px-4 py-3 font-medium">
                  NPD Result
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Testing outcome</p>
                </th>
                <th className="px-4 py-3 font-medium">
                  Notes
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Rejection comments</p>
                </th>
                <th className="px-4 py-3 font-medium">
                  Stages
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Pipeline trail</p>
                </th>
                <th className="px-4 py-3 font-medium">
                  Last updated
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">When status changed</p>
                </th>
                <th className="px-4 py-3 font-medium">
                  Actions
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">On Hold / Archive (CEO only)</p>
                </th>
                <th className="px-4 py-3 text-right font-medium whitespace-nowrap">
                  Deadline
                  <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Target date</p>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <p className="text-sm text-[#64748b]">No rejected products.</p>
                    <p className="mt-1 text-xs text-[#94a3b8]">Products appear here when rejected from Decision Pending or On Hold.</p>
                  </td>
                </tr>
              ) : (
                visible.map((p) => {
                  const v = verdict[p.id] ?? null;
                  const noteCount = (p.rejectionComments ?? []).length;
                  const isExpanded = expanded === p.id;
                  const npdOutcome = p.npdReport?.outcome;

                  return (
                    <>
                      <tr key={p.id}
                        onClick={() => setExpanded(isExpanded ? null : p.id)}
                        className={`border-b border-red-500/10 cursor-pointer ${isExpanded || v ? "bg-red-500/5" : "hover:bg-red-500/3"}`}>
                        {/* Thumbnail */}
                        <td className="pl-4 pr-2 py-3">
                          {p.imageDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageDataUrl} alt={p.codeName} className="h-12 w-12 rounded-md object-cover border border-red-500/20" />
                          ) : (
                            <div className="h-12 w-12 rounded-md border border-red-500/20 bg-red-500/10 flex items-center justify-center text-[10px] font-semibold text-red-400 select-none">
                              {p.codeName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </td>

                        {/* Product */}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 leading-snug">{p.codeName}</p>
                          <p className="text-xs text-[#64748b] mt-0.5">{p.factory ?? p.skuCode}</p>
                          {p.rejectedBy && (
                            <p className="text-[10px] text-red-400 mt-0.5">Rejected by {p.rejectedBy}</p>
                          )}
                        </td>

                        {/* Remarks */}
                        <td className="px-4 py-3 w-48">
                          {p.verdictRemarks ? (
                            <p className="text-xs text-amber-700 italic leading-snug break-words whitespace-normal">"{p.verdictRemarks}"</p>
                          ) : <span className="text-xs text-[#94a3b8]">—</span>}
                        </td>

                        {/* NPD Result */}
                        <td className="px-4 py-3">
                          {npdOutcome ? (
                            <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${npdOutcome === "Pass" ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
                              {npdOutcome === "Pass" ? "Pass" : "Fail"}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#94a3b8]">—</span>
                          )}
                        </td>

                        {/* Notes count */}
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${noteCount > 0 ? "text-red-400" : "text-[#94a3b8]"}`}>
                            {noteCount > 0 ? `${noteCount} note${noteCount !== 1 ? "s" : ""}` : "No notes yet"}
                          </span>
                          <p className="text-[10px] text-[#94a3b8] mt-0.5">Click row to view / add</p>
                        </td>

                        {/* Stages */}
                        <td className="px-4 py-3 w-40">
                          <StagePills stages={getPipelineTrail(p)} />
                        </td>

                        {/* Last updated */}
                        <td className="px-4 py-3 tabular-nums text-[#d97706] whitespace-nowrap text-xs" onClick={(e) => e.stopPropagation()}>
                          {p.statusChangedAt ? fmt(p.statusChangedAt) : "—"}
                        </td>

                        {/* Actions — everyone can move back to On Hold, only CEO can Archive */}
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1.5 flex-wrap">
                            {([
                              { key: "onhold" as CEOAction, label: "→ On Hold", style: v?.type === "onhold" ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-[#bfdbfe]/50 bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe]" },
                              ...(isCEO ? [{ key: "archive" as CEOAction, label: "Archive", style: v?.type === "archive" ? "border-red-500 bg-red-500/20 text-red-400" : "border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/15" }] : []),
                            ]).map(({ key, label, style }) => (
                              <button key={key} onClick={() => openVerdict(p.id, key)}
                                className={`rounded border px-2.5 py-1 text-xs font-medium transition ${style}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </td>

                        {/* Deadline */}
                        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <DeadlineBadge deadline={p.deadline} />
                            <span className="tabular-nums text-[#d97706] text-xs">
                              {new Date(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded notes sub-row */}
                      {isExpanded && !v && (
                        <tr key={`${p.id}-notes`} className="border-b border-red-500/10 bg-red-500/3">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="space-y-4">
                              {/* Existing comments */}
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-2">Rejection notes</p>
                                {(p.rejectionComments ?? []).length === 0 ? (
                                  <p className="text-xs text-[#94a3b8]">No notes added yet.</p>
                                ) : (
                                  <ul className="space-y-2">
                                    {(p.rejectionComments ?? []).map((c, i) => (
                                      <li key={i} className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2.5">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-[11px] font-semibold text-[#0f172a]">{c.by}</span>
                                          <span className="text-[10px] text-[#94a3b8]">{fmt(c.timestamp)}</span>
                                        </div>
                                        <p className="text-sm text-[#475569]">{c.reason}</p>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              {/* Add note */}
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b] mb-2">Add a note</p>
                                <div className="flex gap-2">
                                  <textarea
                                    value={noteInput[p.id] ?? ""}
                                    onChange={(e) => setNoteInput((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                    placeholder="Add your observation or reason…"
                                    rows={2}
                                    className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-red-400 placeholder:text-[#94a3b8] resize-none"
                                  />
                                  <button
                                    onClick={() => addNote(p)}
                                    disabled={!(noteInput[p.id] ?? "").trim()}
                                    className="self-end rounded-md border border-red-500/40 bg-red-500/15 px-4 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25 disabled:opacity-40 transition">
                                    Add note
                                  </button>
                                </div>
                              </div>

                              {/* NPD observations */}
                              {p.npdReport?.notes && (
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b] mb-2">NPD Observations</p>
                                  <p className="rounded-md border border-[#bfdbfe]/30 bg-[#f8faff] px-3 py-2.5 text-sm text-[#475569]">{p.npdReport.notes}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Verdict sub-row */}
                      {v && (
                        <tr key={`${p.id}-v`} className="border-b border-red-500/10 bg-red-500/5">
                          <td colSpan={9} className="px-6 py-4">
                            <div className={`rounded-md border p-4 ${v.type === "onhold" ? "border-amber-500/25 bg-amber-500/5" : "border-red-500/25 bg-red-500/5"}`}>
                              <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${v.type === "onhold" ? "text-amber-400" : "text-red-400"}`}>
                                {v.type === "onhold" ? "Move back to On Hold — add remarks" : "Archive product — add remarks"}
                              </p>
                              <textarea
                                value={v.remarks}
                                onChange={(e) => setVerdict((prev) => ({ ...prev, [p.id]: { ...prev[p.id], remarks: e.target.value } }))}
                                placeholder="Optional remarks…"
                                rows={2}
                                className="w-full rounded-md border border-[#bfdbfe]/50 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#94a3b8] resize-none"
                              />
                              <div className="mt-3 flex gap-2">
                                <button
                                  onClick={() => v.type === "onhold" ? moveToOnHold(p, v.remarks) : archiveProduct(p, v.remarks)}
                                  className={`rounded-md border px-4 py-1.5 text-xs font-semibold transition ${v.type === "onhold" ? "border-amber-500/40 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" : "border-red-500/40 bg-red-500/20 text-red-400 hover:bg-red-500/30"}`}>
                                  {v.type === "onhold" ? "Confirm → On Hold" : "Confirm Archive"}
                                </button>
                                <button
                                  onClick={() => setVerdict((prev) => { const n = { ...prev }; delete n[p.id]; return n; })}
                                  className="rounded-md border border-[#bfdbfe]/50 px-4 py-1.5 text-xs text-[#64748b] hover:bg-[#eff6ff] transition">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GridBeam>
    </>
  );
}
