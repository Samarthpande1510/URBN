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
import { GridBeam } from "@/components/ui/grid-beam";

type ActiveFilter = "All" | "Pending NPD" | "Pending Decision" | "Approved" | "On hold";
const ACTIVE_FILTERS: ActiveFilter[] = ["All", "Pending NPD", "Pending Decision", "Approved", "On hold"];

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


export default function DashboardPage() {
  const { products, setProducts, addNotification, search } = useProducts();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<ActiveFilter>("All");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);

  const q = search.toLowerCase();
  const activeProducts = products.filter((p) => {
    if (p.status === "Rejected") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });
  const archivedProducts = products.filter((p) => {
    if (p.status !== "Rejected") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });

  const counts = {
    All: activeProducts.length,
    "Pending NPD": activeProducts.filter((p) => p.status === "Pending NPD").length,
    "Pending Decision": activeProducts.filter((p) => p.status === "Pending Decision").length,
    Approved: activeProducts.filter((p) => p.status === "Approved").length,
    "On hold": activeProducts.filter((p) => p.status === "On hold").length,
  };

  const totalAll = products.length;
  const rejectedCount = products.filter((p) => p.status === "Rejected").length;
  const rejectionRate = totalAll ? Math.round((rejectedCount / totalAll) * 100) : 0;
  const priorityData = (["Urgent", "High", "Medium", "Low"] as const)
    .map((pr) => ({ name: pr, value: activeProducts.filter((p) => p.priority === pr).length, color: PRIORITY_DOT[pr] }))
    .filter((d) => d.value > 0);

  const chartData = (["Pending NPD", "Pending Decision", "Approved", "On hold", "Rejected"] as Status[]).map((status) => ({
    name: status,
    value: products.filter((p) => p.status === status).length,
    color: STATUS_DOT[status],
  }));

  const visible = filter === "All" ? activeProducts : activeProducts.filter((p) => p.status === filter);
  const active = products.find((p) => p.id === activeId) ?? null;

  function openProduct(p: ProductRow) {
    setActiveId(p.id);
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


  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
      <p className="mt-1 text-sm text-[#90bce0]">A live snapshot of every product in the pipeline. Click any row to see details.</p>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            { label: "Total products", hint: "All products ever added", value: products.length, color: "#ffffff" },
            { label: "Pending NPD", hint: "Waiting for QA to test", value: counts["Pending NPD"], color: STATUS_DOT["Pending NPD"] },
            { label: "Approved", hint: "Passed QA and CEO review", value: counts["Approved"], color: STATUS_DOT["Approved"] },
            { label: "On hold", hint: "Waiting on factory response", value: counts["On hold"], color: STATUS_DOT["On hold"] },
          ] as const
        ).map((kpi) => (
          <div key={kpi.label} className="rounded-md border border-[#1a3a6e]/40 bg-[#060f26] px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[#5a8fc4]">{kpi.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
            <p className="mt-1 text-[11px] text-[#3a5a8a]">{kpi.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">

        {/* Status donut — rejection rate */}
        <div className="rounded-md border border-[#1a3a6e]/40 bg-[#060f26] p-5">
          <p className="text-xs font-normal uppercase tracking-wide text-[#5a8fc4]">Status breakdown</p>
          <p className="mt-0.5 text-[11px] text-[#3a5a8a]">Where every product sits right now across all stages.</p>
          <div className="mt-3 flex items-center gap-5">
            <div className="relative h-36 w-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
                    {chartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums text-[#a14a3d]">{rejectionRate}%</span>
                <span className="text-[10px] text-[#90bce0]">rejected</span>
              </div>
            </div>
            <div className="space-y-1.5">
              {chartData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 text-xs text-[#90bce0]">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="truncate">{entry.name}</span>
                  <span className="ml-auto font-semibold tabular-nums text-[#ddeeff]">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Priority breakdown bars */}
        <div className="rounded-md border border-[#1a3a6e]/40 bg-[#060f26] p-5">
          <p className="text-xs font-normal uppercase tracking-wide text-[#5a8fc4]">Priority split</p>
          <p className="mt-0.5 text-[11px] text-[#3a5a8a]">How urgent the active products are. Urgent means action is needed today.</p>
          <div className="mt-4 space-y-3">
            {(["Urgent", "High", "Medium", "Low"] as const).map((pr) => {
              const count = activeProducts.filter((p) => p.priority === pr).length;
              const pct = activeProducts.length ? Math.round((count / activeProducts.length) * 100) : 0;
              return (
                <div key={pr}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium" style={{ color: PRIORITY_DOT[pr] }}>{pr}</span>
                    <span className="tabular-nums text-[#ddeeff]">{count} <span className="text-[#5a8fc4]">({pct}%)</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-[#0a1e42] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: PRIORITY_DOT[pr] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-[#ddeeff]">Active products</h2>
        <p className="mt-0.5 text-xs text-[#3a5a8a]">Use the filters below to narrow down by stage. Click a row to see the full product detail.</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIVE_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded border px-4 py-1.5 text-sm transition ${
              filter === f
                ? "border-[#2a6aaa] bg-[#1a4a8a] text-[#ddeeff]"
                : "border-[#1a3a6e]/50 bg-[#060f26] text-[#90bce0] hover:bg-[#0a1e42]"
            }`}
          >
            {f} <span className="ml-1 opacity-70 tabular-nums">{counts[f]}</span>
          </button>
        ))}
      </div>

      <GridBeam rows={6} cols={8} colorVariant="ocean" theme="dark" active className="mt-6 overflow-hidden rounded-md border border-[#1a3a6e]/40 bg-[#060f26]/80">
        <div className="overflow-x-auto">
        <table className="min-w-[700px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#1a3a6e]/40 text-[#ddeeff]">
              <th className="px-5 py-3 font-medium">
                Code name
                <p className="text-[10px] font-normal text-[#3a5a8a] mt-0.5">Internal product name</p>
              </th>
              <th className="px-5 py-3 font-medium">
                Factory SKU code
                <p className="text-[10px] font-normal text-[#3a5a8a] mt-0.5">Code given by the factory</p>
              </th>
              <th className="px-5 py-3 font-medium">
                Priority
                <p className="text-[10px] font-normal text-[#3a5a8a] mt-0.5">How urgent this is</p>
              </th>
              <th className="px-5 py-3 font-medium">
                Status
                <p className="text-[10px] font-normal text-[#3a5a8a] mt-0.5">Current pipeline stage</p>
              </th>
              <th className="px-5 py-3 font-medium">
                Last updated
                <p className="text-[10px] font-normal text-[#3a5a8a] mt-0.5">When status last changed</p>
              </th>
              <th className="px-5 py-3 text-right font-medium w-36 whitespace-nowrap">
                Deadline
                <p className="text-[10px] font-normal text-[#3a5a8a] mt-0.5">Target completion date</p>
              </th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center">
                  <p className="text-sm text-[#5a8fc4]">No products match this filter.</p>
                  <p className="mt-1 text-xs text-[#3a5a8a]">Try selecting "All" above, or add a new product using the button in the top right.</p>
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
                  <td className="px-5 py-4 text-right tabular-nums text-[#f0c060] whitespace-nowrap">{new Date(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
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
      </GridBeam>

      {archivedProducts.length > 0 && (
        <div className="mt-10">
          <h2 className="text-base font-semibold text-[#90bce0]">Archived products</h2>
          <p className="mt-1 text-sm text-[#5a8fc4]">These products did not pass QA or were rejected. They are kept here for your records but are no longer in the active pipeline. You can restore them if needed.</p>
          <div className="mt-3 overflow-hidden rounded-md border border-[#1a3a6e]/40 bg-[#0a1e42]">
            <div className="overflow-x-auto">
            <table className="min-w-[560px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#1a3a6e]/40 text-[#5a8fc4]">
                  <th className="px-5 py-3 font-medium">Code name</th>
                  <th className="px-5 py-3 font-medium">Factory SKU code</th>
                  <th className="px-5 py-3 font-medium">Rejected by</th>
                  <th className="px-5 py-3 text-right font-medium">Rejected on</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {archivedProducts.map((p) => (
                  <tr key={p.id} className="border-b border-[#1a3a6e]/30 last:border-0 opacity-70">
                    <td className="px-5 py-4 text-[#90bce0]">{p.codeName}</td>
                    <td className="px-5 py-4 text-[#5a8fc4]">{p.skuCode}</td>
                    <td className="px-5 py-4 text-[#90bce0]">{p.rejectedBy ?? "—"}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-[#5a8fc4]">
                      {p.statusChangedAt ? new Date(p.statusChangedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <button onClick={() => restoreProduct(p.id, p.codeName)}
                          className="rounded-lg border border-[#2a6aaa]/40 px-3 py-1 text-xs font-medium text-[#90bce0] hover:bg-[#1a4a8a]/30 hover:text-[#ddeeff]">
                          Restore
                        </button>
                        <span className="text-[10px] text-[#2a4a6a]">Sends back to Pending NPD</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      <Modal open={!!active} onClose={() => setActiveId(null)}>
        {active && active.status === "On hold" && (
          <div>
            <h2 className="text-lg font-semibold text-[#ddeeff]">{active.codeName}</h2>
            <p className="mt-1 text-sm text-[#90bce0]">{active.skuCode} — on hold</p>
            <p className="mt-2 text-xs text-[#5a8fc4]">Manage this product from the NPD Testing page.</p>
            <div className="mt-5 space-y-0">
              <TimelineRow label="Factory emailed" value={active.factoryComm?.decidedAt ?? null} pending="No action yet" />
              <TimelineRow label="Dev acknowledged" value={active.factoryComm?.acknowledgedAt ?? null} pending="Pending" />
              <TimelineRow label="Factory replied" value={active.factoryComm?.replyAt ?? null} pending="Pending" />
            </div>
            {active.factoryComm?.replyText && (
              <div className="mt-3 rounded-md bg-[#0a1e42] p-3">
                <p className="text-xs uppercase tracking-wide text-[#5a8fc4]">Reply</p>
                <p className="mt-1 text-sm text-[#ddeeff]">{active.factoryComm.replyText}</p>
                {active.factoryComm.tentativeReturnDate && (
                  <p className="mt-1 text-xs text-[#90bce0]">Return date: {active.factoryComm.tentativeReturnDate}</p>
                )}
              </div>
            )}
            <button onClick={() => setActiveId(null)} className="mt-6 w-full rounded-md border border-[#1a3a6e]/50 bg-[#060f26] py-2 text-sm text-[#90bce0] hover:bg-[#0a1e42]">Close</button>
          </div>
        )}

        {active && active.status === "Approved" && (
          <div>
            <h2 className="text-lg font-semibold text-[#ddeeff]">{active.codeName}</h2>
            <p className="mt-1 text-sm text-[#90bce0]">{active.skuCode} — approved</p>
            <p className="mt-2 text-xs text-[#5a8fc4]">Manage the full workflow from the Golden Product page.</p>
            <div className="mt-5 space-y-0">
              <TimelineRow label="Purchase notified" value={active.goldenWorkflow?.purchaseNotifiedAt ?? null} pending="Not yet" />
              <TimelineRow label="Order confirmed" value={active.goldenWorkflow?.orderConfirmedAt ?? null} pending="Pending" />
              <TimelineRow label="Details saved" value={active.goldenWorkflow?.details?.savedAt ?? null} pending="Pending" />
              <TimelineRow label="Compliance confirmed" value={active.goldenWorkflow?.compliance?.confirmedAt ?? null} pending="Pending" />
              <TimelineRow label="Packaging released" value={active.goldenWorkflow?.packaging?.releasedAt ?? null} pending="Pending" />
              <TimelineRow label="Golden sample" value={active.goldenWorkflow?.goldenSample?.receivedAt ?? null} pending={active.goldenWorkflow?.goldenSample?.status ?? "Not started"} />
            </div>
            <button onClick={() => setActiveId(null)} className="mt-6 w-full rounded-md border border-[#1a3a6e]/50 bg-[#060f26] py-2 text-sm text-[#90bce0] hover:bg-[#0a1e42]">Close</button>
          </div>
        )}

        {active && active.status === "Pending Decision" && (
          <div>
            <h2 className="text-lg font-semibold text-[#ddeeff]">{active.codeName}</h2>
            <p className="mt-1 text-sm text-[#90bce0]">{active.skuCode}</p>
            <div className="mt-6 rounded-md border border-[#4a9aba]/30 bg-[#4a9aba]/10 px-5 py-4 text-center">
              <p className="text-sm font-medium text-[#4a9aba]">Awaiting team decision</p>
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
            <button onClick={() => setActiveId(null)} className="mt-6 w-full rounded-md border border-[#1a3a6e]/50 bg-[#060f26] py-2 text-sm text-[#90bce0] hover:bg-[#0a1e42]">Close</button>
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
              className="mt-6 w-full rounded-md border border-[#1a3a6e]/50 bg-[#060f26] py-2 text-sm text-[#90bce0] hover:bg-[#0a1e42]"
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
                <img src={p.imageDataUrl} alt={p.codeName} className="mt-4 h-48 w-full rounded-md object-cover" />
              ) : (
                <div className="mt-4 flex h-32 items-center justify-center rounded-md border border-dashed border-[#1a3a6e]/50 bg-[#0a1e42] text-sm text-[#5a8fc4]">
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
                className="mt-6 w-full rounded-md border border-[#1a3a6e]/50 bg-[#060f26] py-2 text-sm text-[#90bce0] hover:bg-[#0a1e42]"
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