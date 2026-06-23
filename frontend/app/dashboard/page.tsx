"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { Eye } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { Chip } from "@/components/Chip";
import { useProducts, Status, ProductRow } from "@/lib/products-context";
import { STATUS_DOT, PRIORITY_DOT } from "@/lib/colors";

type ActiveFilter = "All" | "Pending NPD" | "Pending Decision" | "Approved" | "On hold";
const ACTIVE_FILTERS: ActiveFilter[] = ["All", "Pending NPD", "Pending Decision", "Approved", "On hold"];
const GOLDEN_SAMPLE_OPTIONS = ["Not started", "Requested", "In progress", "Received"] as const;

function formatTimestamp(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TimelineRow({ label, value, pending }: { label: string; value: string | null; pending: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#1a3a6e]/30 py-3 last:border-0">
      <span className="text-sm text-[#90bce0]">{label}</span>
      <span className={`text-sm ${value ? "font-medium text-[#ddeeff]" : "text-[#5a8fc4]"}`}>
        {value ? formatTimestamp(value) : pending}
      </span>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26]/80 px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#3b2f23]"
      />
    </label>
  );
}

export default function DashboardPage() {
  const { products, setProducts, addNotification } = useProducts();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<ActiveFilter>("All");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ qaName: "", qaSkuCode: "", qaColour: "", qaMarkings: "", goldenSampleExpectedDate: "" });
  const [draftStatus, setDraftStatus] = useState<typeof GOLDEN_SAMPLE_OPTIONS[number]>("Not started");

  const activeProducts = products.filter((p) => p.status !== "Rejected");
  const archivedProducts = products.filter((p) => p.status === "Rejected");

  const counts = {
    All: activeProducts.length,
    "Pending NPD": activeProducts.filter((p) => p.status === "Pending NPD").length,
    "Pending Decision": activeProducts.filter((p) => p.status === "Pending Decision").length,
    Approved: activeProducts.filter((p) => p.status === "Approved").length,
    "On hold": activeProducts.filter((p) => p.status === "On hold").length,
  };

  const totalAll = products.length;
  const approvedCount = products.filter((p) => p.status === "Approved").length;
  const approvalRate = totalAll ? Math.round((approvedCount / totalAll) * 100) : 0;

  const chartData = (["Pending NPD", "Pending Decision", "Approved", "On hold", "Rejected"] as Status[]).map((status) => ({
    name: status,
    value: products.filter((p) => p.status === status).length,
    color: STATUS_DOT[status],
  }));

  const visible = filter === "All" ? activeProducts : activeProducts.filter((p) => p.status === filter);
  const active = products.find((p) => p.id === activeId) ?? null;

  function openProduct(p: ProductRow) {
    setActiveId(p.id);
    if (p.approvedWorkflow) {
      setDraft({
        qaName: p.approvedWorkflow.qaName,
        qaSkuCode: p.approvedWorkflow.qaSkuCode,
        qaColour: p.approvedWorkflow.qaColour,
        qaMarkings: p.approvedWorkflow.qaMarkings,
        goldenSampleExpectedDate: p.approvedWorkflow.goldenSampleExpectedDate,
      });
      setDraftStatus(p.approvedWorkflow.goldenSampleStatus);
    } else {
      setDraft({ qaName: "", qaSkuCode: "", qaColour: "", qaMarkings: "", goldenSampleExpectedDate: "" });
      setDraftStatus("Not started");
    }
  }

  function decideHold(action: "EMAIL_FACTORY" | "DROP") {
    if (!active) return;
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== active.id) return p;
        if (action === "DROP") return { ...p, status: "Rejected" as Status, statusChangedAt: new Date().toISOString() };
        return {
          ...p,
          statusChangedAt: new Date().toISOString(),
          factoryComm: {
            decidedAction: "EMAIL_FACTORY" as const,
            decidedAt: new Date().toISOString(),
            acknowledgedAt: null,
            replyAt: null,
            replyText: null,
            tentativeReturnDate: null,
            editHistory: [],
          },
        };
      })
    );
    if (active) {
      if (action === "DROP") {
        addNotification({ targetRoles: ["CEO"], productId: active.id, productName: active.codeName, message: "Product has been dropped and rejected." });
      } else {
        addNotification({ targetRoles: ["Dev"], productId: active.id, productName: active.codeName, message: "Factory has been emailed — acknowledge when ready." });
      }
    }
    showToast(action === "EMAIL_FACTORY" ? "Factory emailed — Dev notified" : "Product dropped — CEO notified");
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

  function notifyPurchase() {
    if (!active) return;
    setProducts((prev) =>
      prev.map((p) =>
        p.id === active.id
          ? {
              ...p,
              approvedWorkflow: {
                purchaseNotifiedAt: new Date().toISOString(),
                orderConfirmedAt: null,
                qaName: "",
                qaSkuCode: "",
                qaColour: "",
                qaMarkings: "",
                goldenSampleStatus: "Not started",
                goldenSampleExpectedDate: "",
              },
            }
          : p
      )
    );
  }

  function confirmOrder() {
    if (!active?.approvedWorkflow) return;
    setProducts((prev) =>
      prev.map((p) =>
        p.id === active.id && p.approvedWorkflow
          ? { ...p, approvedWorkflow: { ...p.approvedWorkflow, orderConfirmedAt: new Date().toISOString() } }
          : p
      )
    );
  }

  function saveApprovedDetails() {
    if (!active?.approvedWorkflow) return;
    setProducts((prev) =>
      prev.map((p) =>
        p.id === active.id && p.approvedWorkflow
          ? {
              ...p,
              approvedWorkflow: {
                ...p.approvedWorkflow,
                qaName: draft.qaName,
                qaSkuCode: draft.qaSkuCode,
                qaColour: draft.qaColour,
                qaMarkings: draft.qaMarkings,
                goldenSampleStatus: draftStatus,
                goldenSampleExpectedDate: draft.goldenSampleExpectedDate,
              },
            }
          : p
      )
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
      <p className="mt-1 text-sm text-[#90bce0]">Summary of our products.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            { label: "Total", value: products.length, color: "#ffffff" },
            { label: "Pending NPD", value: counts["Pending NPD"], color: STATUS_DOT["Pending NPD"] },
            { label: "Approved", value: counts["Approved"], color: STATUS_DOT["Approved"] },
            { label: "On hold", value: counts["On hold"], color: STATUS_DOT["On hold"] },
          ] as const
        ).map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-[#1a3a6e]/40 bg-[#060f26]/80 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[#5a8fc4]">{kpi.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-[#1a3a6e]/40 bg-[#060f26]/80 p-6">
        <h2 className="text-base font-semibold text-white">Approval breakdown</h2>
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2} stroke="none">
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums text-[#ddeeff]">{approvalRate}%</span>
              <span className="text-xs text-[#90bce0]">approved</span>
            </div>
          </div>
          <div className="space-y-2">
            {chartData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2 text-sm text-[#90bce0]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name}
                <span className="font-medium tabular-nums text-[#ddeeff]">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {ACTIVE_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              filter === f
                ? "border-[#2a6aaa] bg-[#1a4a8a] text-[#ddeeff]"
                : "border-[#1a3a6e]/50 bg-[#060f26]/80 text-[#90bce0] hover:bg-[#0a1e42]"
            }`}
          >
            {f} <span className="ml-1 opacity-70 tabular-nums">{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[#1a3a6e]/40 bg-[#060f26]/80">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#1a3a6e]/40 text-[#ddeeff]">
              <th className="px-5 py-3 font-medium">Code name</th>
              <th className="px-5 py-3 font-medium">Factory SKU code</th>
              <th className="px-5 py-3 font-medium">Priority</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Assigned On</th>
              <th className="px-5 py-3 text-right font-medium">Deadline</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-[#5a8fc4]">
                  No products match this filter.
                </td>
              </tr>
            ) : (
              visible.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => openProduct(p)}
                  className="cursor-pointer border-b border-[#1a3a6e]/30 transition last:border-0 hover:bg-[#0a1e42]"
                >
                  <td className="px-5 py-4 font-semibold text-white">{p.codeName}</td>
                  <td className="px-5 py-4 text-[#90bce0]">{p.skuCode}</td>
                  <td className="px-5 py-4">
                    <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
                  </td>
                  <td className="px-5 py-4">
                    <Chip color={STATUS_DOT[p.status]} label={p.status} />
                  </td>
                  <td className="px-5 py-4 tabular-nums text-[#f0c060]">
                    {p.statusChangedAt ? formatTimestamp(p.statusChangedAt) : "—"}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-[#f0c060]">{p.deadline}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setViewId(p.id); }}
                      className="rounded-lg p-1.5 text-[#5a8fc4] transition hover:bg-[#1a3a6e]/40 hover:text-[#ddeeff]"
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {archivedProducts.length > 0 && (
        <div className="mt-10">
          <h2 className="text-base font-semibold text-[#90bce0]">Archived</h2>
          <p className="mt-1 text-sm text-[#5a8fc4]">Rejected products — kept for record, out of the active pipeline.</p>
          <div className="mt-3 overflow-hidden rounded-xl border border-[#1a3a6e]/40 bg-[#0a1e42]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#1a3a6e]/40 text-[#5a8fc4]">
                  <th className="px-5 py-3 font-medium">Code name</th>
                  <th className="px-5 py-3 font-medium">Factory SKU code</th>
                  <th className="px-5 py-3 font-medium">Priority</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Rejected on</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {archivedProducts.map((p) => (
                  <tr key={p.id} className="border-b border-[#1a3a6e]/30 last:border-0 opacity-70">
                    <td className="px-5 py-4 text-[#90bce0]">{p.codeName}</td>
                    <td className="px-5 py-4 text-[#5a8fc4]">{p.skuCode}</td>
                    <td className="px-5 py-4">
                      <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
                    </td>
                    <td className="px-5 py-4">
                      <Chip color={STATUS_DOT[p.status]} label={p.status} />
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-[#5a8fc4]">
                      {p.statusChangedAt ? new Date(p.statusChangedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => restoreProduct(p.id, p.codeName)}
                        className="rounded-lg border border-[#2a6aaa]/40 px-3 py-1 text-xs font-medium text-[#90bce0] hover:bg-[#1a4a8a]/30 hover:text-[#ddeeff]">
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!active} onClose={() => setActiveId(null)}>
        {active && active.status === "On hold" && (
          <div>
            <h2 className="text-lg font-semibold text-[#ddeeff]">{active.codeName}</h2>
            <p className="mt-1 text-sm text-[#90bce0]">{active.skuCode} — on hold</p>

            {!active.factoryComm?.decidedAction ? (
              <div className="mt-6">
                <p className="text-sm text-[#90bce0]">No action taken yet. Choose one:</p>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => decideHold("EMAIL_FACTORY")}
                    className="flex-1 rounded-xl bg-[#1a4a8a] py-2.5 text-sm font-medium text-[#ddeeff] hover:opacity-90"
                  >
                    Email factory
                  </button>
                  <button
                    onClick={() => decideHold("DROP")}
                    className="flex-1 rounded-xl border border-[#1a3a6e]/50 bg-[#060f26]/80 py-2.5 text-sm font-medium text-[#e05a5a] hover:bg-[#0a1e42]"
                  >
                    Drop product
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <TimelineRow label="Emailed factory" value={active.factoryComm.decidedAt} pending="—" />
                <TimelineRow label="Dev team acknowledged" value={active.factoryComm.acknowledgedAt} pending="Awaiting acknowledgement" />
                <TimelineRow label="Factory replied" value={active.factoryComm.replyAt} pending="Awaiting reply" />
                {active.factoryComm.replyText && (
                  <div className="mt-3 rounded-xl bg-[#0a1e42] p-3">
                    <p className="text-xs uppercase tracking-wide text-[#5a8fc4]">Reply</p>
                    <p className="mt-1 text-sm text-[#ddeeff]">{active.factoryComm.replyText}</p>
                    {active.factoryComm.tentativeReturnDate && (
                      <p className="mt-2 text-xs text-[#90bce0]">
                        Tentative return date: {active.factoryComm.tentativeReturnDate}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setActiveId(null)}
              className="mt-6 w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26]/80 py-2 text-sm text-[#90bce0] hover:bg-[#0a1e42]"
            >
              Close
            </button>
          </div>
        )}

        {active && active.status === "Approved" && (
          <div>
            <h2 className="text-lg font-semibold text-[#ddeeff]">{active.codeName}</h2>
            <p className="mt-1 text-sm text-[#90bce0]">{active.skuCode} — approved</p>

            {!active.approvedWorkflow ? (
              <div className="mt-6">
                <p className="text-sm text-[#90bce0]">Notify the purchase team to start the order workflow.</p>
                <button
                  onClick={notifyPurchase}
                  className="mt-4 w-full rounded-xl bg-[#1a4a8a] py-2.5 text-sm font-medium text-[#ddeeff] hover:opacity-90"
                >
                  Notify purchase team
                </button>
              </div>
            ) : (
              <div className="mt-6">
                <TimelineRow label="Purchase team notified" value={active.approvedWorkflow.purchaseNotifiedAt} pending="—" />
                <TimelineRow label="Order placement confirmed" value={active.approvedWorkflow.orderConfirmedAt} pending="Awaiting confirmation" />

                {!active.approvedWorkflow.orderConfirmedAt ? (
                  <button
                    onClick={confirmOrder}
                    className="mt-4 w-full rounded-xl bg-[#1a4a8a] py-2.5 text-sm font-medium text-[#ddeeff] hover:opacity-90"
                  >
                    Confirm order placed
                  </button>
                ) : (
                  <div className="mt-5 space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
                      QA + CEO product details
                    </p>
                    <FormField label="Name" value={draft.qaName} onChange={(v) => setDraft((d) => ({ ...d, qaName: v }))} placeholder="Product name" />
                    <FormField label="SKU code" value={draft.qaSkuCode} onChange={(v) => setDraft((d) => ({ ...d, qaSkuCode: v }))} placeholder="Internal SKU" />
                    <FormField label="Colour" value={draft.qaColour} onChange={(v) => setDraft((d) => ({ ...d, qaColour: v }))} placeholder="e.g. Slate Blue" />
                    <FormField
                      label="Markings (logo, rating label)"
                      value={draft.qaMarkings}
                      onChange={(v) => setDraft((d) => ({ ...d, qaMarkings: v }))}
                      placeholder="e.g. Embossed logo, EU rating label"
                    />

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
                        Golden sample status
                      </label>
                      <select
                        value={draftStatus}
                        onChange={(e) => setDraftStatus(e.target.value as typeof GOLDEN_SAMPLE_OPTIONS[number])}
                        className="w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26]/80 px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#3b2f23]"
                      >
                        {GOLDEN_SAMPLE_OPTIONS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
                        Golden sample expected date
                      </label>
                      <input
                        type="date"
                        value={draft.goldenSampleExpectedDate}
                        onChange={(e) => setDraft((d) => ({ ...d, goldenSampleExpectedDate: e.target.value }))}
                        className="w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26]/80 px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#3b2f23]"
                      />
                    </div>

                    <button
                      onClick={saveApprovedDetails}
                      className="w-full rounded-xl bg-[#1a4a8a] py-2.5 text-sm font-medium text-[#ddeeff] hover:opacity-90"
                    >
                      Save details
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setActiveId(null)}
              className="mt-6 w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26]/80 py-2 text-sm text-[#90bce0] hover:bg-[#0a1e42]"
            >
              Close
            </button>
          </div>
        )}

        {active && active.status === "Pending Decision" && (
          <div>
            <h2 className="text-lg font-semibold text-[#ddeeff]">{active.codeName}</h2>
            <p className="mt-1 text-sm text-[#90bce0]">{active.skuCode}</p>
            <div className="mt-6 rounded-xl border border-[#4a9aba]/30 bg-[#4a9aba]/10 px-5 py-4 text-center">
              <p className="text-sm font-semibold text-[#4a9aba]">Awaiting team decision</p>
              <p className="mt-1 text-xs text-[#90bce0]">NPD report passed — CEO &amp; Dev team have been notified. No action taken yet.</p>
            </div>
            {active.npdReport && (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between border-b border-[#1a3a6e]/30 py-2">
                  <span className="text-[#90bce0]">NPD outcome</span>
                  <span className="font-semibold text-green-400">{active.npdReport.outcome}</span>
                </div>
                <div className="flex justify-between border-b border-[#1a3a6e]/30 py-2">
                  <span className="text-[#90bce0]">Submitted</span>
                  <span className="text-[#ddeeff]">{new Date(active.npdReport.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
                {active.npdReport.notes && (
                  <div className="border-b border-[#1a3a6e]/30 py-2">
                    <span className="block text-[#90bce0]">QA notes</span>
                    <span className="mt-1 block text-[#ddeeff]">{active.npdReport.notes}</span>
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setActiveId(null)} className="mt-6 w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26]/80 py-2 text-sm text-[#90bce0] hover:bg-[#0a1e42]">Close</button>
          </div>
        )}

        {active && active.status === "Pending NPD" && (
          <div>
            <h2 className="text-lg font-semibold text-[#ddeeff]">{active.codeName}</h2>
            <p className="mt-1 text-sm text-[#90bce0]">{active.skuCode} — pending NPD testing</p>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between border-b border-[#1a3a6e]/30 py-2">
                <span className="text-[#90bce0]">Factory</span>
                <span className="text-[#ddeeff]">{active.factory || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-[#1a3a6e]/30 py-2">
                <span className="text-[#90bce0]">Sample received</span>
                <span className="text-[#ddeeff]">{active.sampleReceived ? "Yes" : "No"}</span>
              </div>
              {active.sampleReceived && (
                <div className="flex justify-between border-b border-[#1a3a6e]/30 py-2">
                  <span className="text-[#90bce0]">Given to QA on</span>
                  <span className="text-[#ddeeff]">{active.sampleGivenDate || "—"}</span>
                </div>
              )}
              <div className="border-b border-[#1a3a6e]/30 py-2">
                <span className="block text-[#90bce0]">Specifications</span>
                <span className="mt-1 block text-[#ddeeff]">{active.specifications || "—"}</span>
              </div>
            </div>

            <button
              onClick={() => setActiveId(null)}
              className="mt-6 w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26]/80 py-2 text-sm text-[#90bce0] hover:bg-[#0a1e42]"
            >
              Close
            </button>
          </div>
        )}
      </Modal>

      {/* Eye / detail view modal */}
      <Modal open={!!viewId} onClose={() => setViewId(null)}>
        {(() => {
          const p = products.find((x) => x.id === viewId);
          if (!p) return null;
          return (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[#ddeeff]">{p.codeName}</h2>
                  <p className="mt-0.5 text-sm text-[#90bce0]">{p.skuCode}</p>
                </div>
                <Chip color={STATUS_DOT[p.status]} label={p.status} />
              </div>

              {p.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageDataUrl} alt={p.codeName} className="mt-4 h-48 w-full rounded-xl object-cover" />
              ) : (
                <div className="mt-4 flex h-32 items-center justify-center rounded-xl border border-dashed border-[#1a3a6e]/50 bg-[#0a1e42] text-sm text-[#5a8fc4]">
                  No image uploaded
                </div>
              )}

              <div className="mt-4 space-y-2 text-sm">
                {[
                  ["Priority", p.priority],
                  ["Factory", p.factory ?? "—"],
                  ["Deadline", p.deadline],
                  ["Status since", p.statusChangedAt ? formatTimestamp(p.statusChangedAt) : "—"],
                  ["Sample received", p.sampleReceived ? "Yes" : "No"],
                  p.sampleReceived && p.sampleGivenDate ? ["Given to QA on", p.sampleGivenDate] : null,
                ].filter((x): x is string[] => x !== null).map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b border-[#1a3a6e]/30 py-2">
                    <span className="text-[#90bce0]">{label}</span>
                    <span className="font-medium text-[#ddeeff]">{value}</span>
                  </div>
                ))}
                {p.specifications && (
                  <div className="border-b border-[#1a3a6e]/30 py-2">
                    <span className="block text-[#90bce0]">Specifications</span>
                    <span className="mt-1 block text-[#ddeeff]">{p.specifications}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setViewId(null)}
                className="mt-6 w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26]/80 py-2 text-sm text-[#90bce0] hover:bg-[#0a1e42]"
              >
                Close
              </button>
            </div>
          );
        })()}
      </Modal>
    </AppShell>
  );
}