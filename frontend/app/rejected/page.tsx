"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useProducts, ProductRow, Status, RejectionComment } from "@/lib/products-context";
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

function RejectedCard({ p, session }: { p: ProductRow; session: Session | null }) {
  const { setProducts, addNotification } = useProducts();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState("");

  const isCEO = session?.role === "CEO";
  const isSales = session?.role === "Sales";

  function addComment() {
    if (!commentText.trim() || !session) return;
    const comment: RejectionComment = {
      by: session.name,
      reason: commentText.trim(),
      timestamp: new Date().toISOString(),
    };
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      rejectionComments: [...(x.rejectionComments ?? []), comment],
      activityLog: [...x.activityLog, { action: `Comment added by ${session.name}`, timestamp: comment.timestamp, note: comment.reason }],
    }));
    if (!isCEO) {
      addNotification({
        targetRoles: ["CEO"],
        productId: p.id,
        productName: p.codeName,
        message: `${session.name} added a rejection note: "${comment.reason}"`,
      });
    }
    setCommentText("");
    showToast("Note added");
  }

  function emailFactory() {
    if (!session) return;
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      status: "On hold" as Status,
      statusChangedAt: now,
      factoryComm: { decidedAction: "EMAIL_FACTORY", decidedAt: now, acknowledgedAt: null, replyAt: null, replyText: null, tentativeReturnDate: null, editHistory: [] },
      activityLog: [...x.activityLog, { action: `Factory emailed about rejection by ${session.name} — product returned to On Hold`, timestamp: now, stages: ["EMAILED TO FACTORY"] }],
    }));
    addNotification({ targetRoles: ["Dev"], productId: p.id, productName: p.codeName, message: `${p.codeName} returned to On Hold — factory emailed about rejection.` });
    showToast("Factory emailed — product moved back to On Hold");
  }

  function sendToOnHold() {
    if (!session) return;
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      status: "On hold" as Status,
      statusChangedAt: now,
      factoryComm: { decidedAction: null, decidedAt: null, acknowledgedAt: null, replyAt: null, replyText: null, tentativeReturnDate: null, editHistory: [] },
      activityLog: [...x.activityLog, { action: `Moved to On Hold by ${session.name} — factory to be emailed`, timestamp: now, stages: ["EMAILED TO FACTORY"] }],
    }));
    addNotification({ targetRoles: ["Dev"], productId: p.id, productName: p.codeName, message: `${p.codeName} is salvageable — moved to On Hold, email factory with failure observations.` });
    showToast(`${p.codeName} moved to On Hold`);
  }

  function confirmRejection() {
    const now = new Date().toISOString();
    const name = session?.name ?? "CEO";
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      rejectedBy: name,
      activityLog: [...x.activityLog, { action: `Rejection confirmed by ${name} — not salvageable`, timestamp: now }],
    }));
    addNotification({
      targetRoles: ["Dev", "Sales", "QA"],
      productId: p.id,
      productName: p.codeName,
      message: `${p.codeName} confirmed not salvageable by CEO — pending archive.`,
    });
    showToast("Rejection confirmed");
  }

  function archiveProduct() {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      status: "Archived" as Status,
      statusChangedAt: now,
      activityLog: [...x.activityLog, { action: "Archived — removed from active pipeline", timestamp: now, stages: ["PRODUCT DROPPED"] }],
    }));
    addNotification({
      targetRoles: ["Dev", "Sales", "QA"],
      productId: p.id,
      productName: p.codeName,
      message: `${p.codeName} archived.`,
    });
    showToast(`${p.codeName} archived`);
  }

  return (
    <GridBeam rows={4} cols={5} colorVariant="sunset" theme="dark" active className="rounded-md border border-[#bfdbfe]/40 bg-[#ffffff] overflow-hidden">

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900">{p.codeName}</p>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <p className="text-xs text-[#1d4ed8]">{p.skuCode}</p>
            {p.factory && <p className="text-xs text-[#64748b]">· {p.factory}</p>}
            {p.statusChangedAt && <p className="text-xs text-[#94a3b8]">· Rejected {fmt(p.statusChangedAt)}</p>}
          </div>
        </div>
        <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 rounded-lg border border-[#bfdbfe]/50 px-3 py-1.5 text-xs text-[#64748b] hover:bg-[#eff6ff] hover:text-[#1d4ed8]"
        >
          Details {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* NPD report summary if available */}
      {p.npdReport && (
        <div className="border-t border-[#bfdbfe]/30 px-5 py-2 flex flex-wrap gap-4 text-xs">
          <div>
            <span className="text-[#64748b]">NPD outcome: </span>
            <span className={`font-medium ${p.npdReport.outcome === "Pass" ? "text-green-400" : "text-red-400"}`}>{p.npdReport.outcome}</span>
          </div>
          {p.npdReport.notes && (
            <div className="flex-1 min-w-0">
              <span className="text-[#64748b]">QA note: </span>
              <span className="text-[#1d4ed8]">{p.npdReport.notes}</span>
            </div>
          )}
        </div>
      )}

      {/* Rejection comments */}
      <div className="border-t border-[#bfdbfe]/30 px-5 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[#64748b] mb-2">
          Rejection notes {(p.rejectionComments?.length ?? 0) > 0 ? `(${p.rejectionComments!.length})` : ""}
        </p>

        {(!p.rejectionComments || p.rejectionComments.length === 0) ? (
          <p className="text-xs text-[#94a3b8]">No notes yet. Add one below to explain why this product should be rejected.</p>
        ) : (
          <div className="space-y-2 mb-3">
            {p.rejectionComments.map((c, i) => (
              <div key={i} className="rounded-md bg-[#eff6ff] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#1d4ed8]">{c.by}</span>
                  <span className="text-[10px] text-[#94a3b8]">{fmt(c.timestamp)}</span>
                </div>
                <p className="mt-0.5 text-xs text-[#0f172a]">{c.reason}</p>
              </div>
            ))}
          </div>
        )}

        {/* Add comment — non-Sales only */}
        {!isSales ? (
          <div className="mt-2 flex gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addComment()}
              placeholder="Add a reason or note..."
              className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#eff6ff] px-3 py-2 text-xs text-[#0f172a] placeholder-[#94a3b8] outline-none focus:border-[#93c5fd]"
            />
            <button
              onClick={addComment}
              disabled={!commentText.trim()}
              className="rounded-md border border-[#93c5fd]/40 px-3 py-2 text-xs font-medium text-[#1d4ed8] hover:bg-[#2563eb]/30 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-[#94a3b8]">View only — this product hasn't been approved for ordering.</p>
        )}
      </div>

      {/* CEO decision: salvageable → On Hold, confirm rejection, or archive */}
      {isCEO ? (
        !p.rejectedBy ? (
          <div className="border-t border-[#bfdbfe]/30 bg-[#ffffff] px-5 py-4">
            <p className="text-xs font-medium text-[#0f172a] mb-1">CEO decision required</p>
            <p className="text-xs text-[#64748b] mb-3">Is this product salvageable? Move it back to On Hold, or confirm it as not salvageable.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={emailFactory}
                className="flex-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm font-semibold text-amber-400 hover:bg-amber-500/10 transition"
              >
                Email factory — return to On Hold
                <p className="text-[11px] font-normal text-amber-500/60 mt-0.5">Email factory with observations, await revised sample</p>
              </button>
              <button
                onClick={sendToOnHold}
                className="flex-1 rounded-md border border-blue-300/40 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition"
              >
                Move to On Hold
                <p className="text-[11px] font-normal text-blue-400 mt-0.5">Factory to be emailed by Dev team</p>
              </button>
              <button
                onClick={confirmRejection}
                className="flex-1 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition"
              >
                Not salvageable
                <p className="text-[11px] font-normal text-red-500/50 mt-0.5">Confirm rejection — ready to archive</p>
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-[#bfdbfe]/30 bg-[#ffffff] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-red-400">Rejection confirmed by {p.rejectedBy}</p>
              <p className="text-xs text-[#94a3b8] mt-0.5">Ready to be permanently archived.</p>
            </div>
            <button
              onClick={archiveProduct}
              className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition"
            >
              Archive product
            </button>
          </div>
        )
      ) : (
        <div className="border-t border-[#bfdbfe]/20 px-5 py-2.5">
          {p.rejectedBy
            ? <p className="text-[11px] text-[#64748b]">Rejection confirmed by {p.rejectedBy} — awaiting CEO to archive.</p>
            : <p className="text-[11px] text-[#94a3b8]">Awaiting CEO decision. Add notes above to help inform the call.</p>}
        </div>
      )}

      {/* Timeline */}
      {expanded && p.activityLog.length > 0 && (
        <div className="border-t border-[#bfdbfe]/30 px-5 py-3 space-y-2">
          <p className="text-xs font-normal uppercase tracking-wide text-[#64748b]">Timeline</p>
          {[...p.activityLog].reverse().map((entry, i) => (
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
}

export default function RejectedPage() {
  const { products, search } = useProducts();
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => { setSession(getSession()); }, []);

  const q = search.toLowerCase();
  const visible = products.filter((p) => {
    if (p.status !== "Rejected") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });

  const isCEO = session?.role === "CEO";

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Rejected</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">
        Products that have been rejected and are pending CEO confirmation before archiving.
      </p>
      <p className="mt-1 text-xs text-[#94a3b8]">
        {isCEO
          ? "Review the team's notes and confirm each rejection to move it to the archive."
          : "Add a note explaining why this product should be rejected. The CEO will review and confirm."}
      </p>

      <div className="mt-6 space-y-3">
        {visible.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#bfdbfe]/40 px-5 py-16 text-center">
            <p className="text-sm text-[#64748b]">No products pending rejection confirmation.</p>
            <p className="mt-1 text-xs text-[#94a3b8]">Products appear here when rejected in Decision Pending or On Hold, before the CEO confirms archiving.</p>
          </div>
        ) : (
          visible.map((p) => <RejectedCard key={p.id} p={p} session={session} />)
        )}
      </div>
    </AppShell>
  );
}
