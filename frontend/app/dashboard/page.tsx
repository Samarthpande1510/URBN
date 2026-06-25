"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
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

const STAGE_PILL_STYLE: Record<string, string> = {
  "NPD TESTING: PENDING":    "bg-[#eff6ff] text-[#64748b] border-[#bfdbfe]/60",
  "NPD TESTING: PASS":       "bg-green-500/15 text-green-400 border-green-500/30",
  "NPD TESTING: FAIL":       "bg-red-500/15 text-red-400 border-red-500/30",
  "EMAILED TO FACTORY":      "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "IMPROVEMENT REQUIREMENT": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "GOLDEN SAMPLES PENDING":  "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "REVISED SAMPLE REQUESTED":"bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "REVISED SAMPLE PENDING":  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "REVISED SAMPLE RECEIVED": "bg-[#eff6ff] text-[#0ea5e9] border-[#0ea5e9]/25",
  "REVISED TESTING: PENDING":"bg-orange-500/10 text-orange-400 border-orange-500/25",
  "REVISED TESTING: PASS":   "bg-green-500/15 text-green-400 border-green-500/30",
  "REVISED TESTING: FAIL":   "bg-red-500/15 text-red-400 border-red-500/30",
  "FACTORY DENIED IMPROVEMENT":"bg-red-500/10 text-red-400 border-red-500/25",
  "PRODUCT DROPPED":         "bg-red-900/20 text-red-500 border-red-800/40",
  "REJECTED":                "bg-red-500/10 text-red-400 border-red-500/25",
  // Golden product stages
  "PURCHASE TEAM NOTIFIED":  "bg-[#eff6ff] text-[#0ea5e9] border-[#0ea5e9]/25",
  "ORDER CONFIRMED":         "bg-[#eff6ff] text-[#0ea5e9] border-[#0ea5e9]/40",
  "PRODUCT DETAILS SAVED":   "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "BOM CONFIRMED":           "bg-purple-500/15 text-purple-300 border-purple-500/35",
  "COMPLIANCE INITIATED":    "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "COMPLIANCE CONFIRMED":    "bg-green-500/15 text-green-400 border-green-500/30",
  "PACKAGING INITIATED":     "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "PACKAGING RELEASED":      "bg-green-500/10 text-green-300 border-green-500/25",
  "GOLDEN SAMPLE TRACKING STARTED": "bg-amber-500/10 text-amber-400 border-amber-500/25",
  "GOLDEN SAMPLE RECEIVED":  "bg-green-500/20 text-green-300 border-green-400/40",
  "ORDER PLACED":            "bg-green-500/15 text-green-400 border-green-500/30",
  "ORDER HELD":              "bg-amber-500/10 text-amber-400 border-amber-500/25",
  "ORDER DROPPED":           "bg-red-500/10 text-red-400 border-red-500/25",
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
  // Collect all explicit stage labels from the activity log in order
  const stages: string[] = [];
  for (const entry of p.activityLog) {
    if (entry.stages) stages.push(...entry.stages);
  }
  // If no stage tags yet, derive the starting state
  if (stages.length === 0) stages.push("NPD TESTING: PENDING");

  // Append a pending suffix for products mid-flow
  if (p.status === "On hold" && p.factoryComm) {
    const last = stages[stages.length - 1];
    if (last === "REVISED SAMPLE REQUESTED" || last === "EMAILED TO FACTORY") {
      stages.push("REVISED SAMPLE PENDING");
    }
  }
  return stages;
}

function getPipelineStage(p: ProductRow): string {
  switch (p.status) {
    case "Pending NPD":
      return "NPD testing pending";
    case "Pending Decision":
      return p.npdReport?.outcome === "Pass"
        ? "NPD testing: pass — decision pending"
        : "NPD testing: fail — decision pending";
    case "Rejected":
      return p.rejectedBy
        ? `Rejection confirmed by ${p.rejectedBy} — pending archive`
        : "Rejected — awaiting CEO decision";
    case "Archived":
      return "Product dropped — archived";
    case "On hold": {
      if (!p.factoryComm?.decidedAction) return "On hold — to be emailed to factory";
      if (!p.factoryComm.acknowledgedAt)  return "On hold — emailed to factory · revised sample requested";
      if (!p.factoryComm.replyAt)         return "On hold — revised sample pending";
      return "On hold — revised sample received · outcome pending";
    }
    case "Approved": {
      const gw = p.goldenWorkflow;
      if (!gw || !gw.purchaseNotifiedAt) return gw?.improvedGoldenSampleExpected
        ? "Emailed to factory — improvement requirement — golden samples pending"
        : "Emailed to factory — golden samples pending";
      if (!gw.orderConfirmedAt)           return "Golden product — order confirmation pending";
      if (!gw.details)                    return "Golden product — product details pending";
      const compDone = !!gw.compliance?.confirmedAt;
      const packDone = !!gw.packaging?.releasedAt;
      const gsDone   = gw.goldenSample?.status === "Received";
      if (gsDone && compDone && packDone)  return "Golden product — all tracks complete";
      if (gsDone)                          return "Golden sample received — tracks in progress";
      if (gw.goldenSample?.status === "In progress") return "Golden sample in progress";
      if (gw.goldenSample?.status === "Requested")   return "Golden samples pending";
      if (!compDone)                       return "Golden product — compliance in progress";
      return "Golden product — packaging & golden sample in progress";
    }
    default:
      return p.status;
  }
}

function holdSubStatus(p: ProductRow): string | null {
  if (p.status !== "On hold") return null;
  if (!p.factoryComm?.decidedAction) return "To be emailed to factory";
  if (!p.factoryComm.acknowledgedAt) return "Emailed to factory · revised sample requested";
  if (!p.factoryComm.replyAt) return "Revised sample pending";
  return "Revised sample received · outcome pending";
}

function TimelineRow({ label, value, pending }: { label: string; value: string | null; pending: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#bfdbfe]/30 py-3 last:border-0">
      <span className="text-sm text-[#1d4ed8]">{label}</span>
      <span className={`text-sm ${value ? "font-medium text-[#0f172a]" : "text-[#64748b]"}`}>
        {value ? formatTimestamp(value) : pending}
      </span>
    </div>
  );
}


export default function DashboardPage() {
  const { products, search } = useProducts();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<ActiveFilter>("All");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);

  const q = search.toLowerCase();
  const activeProducts = products.filter((p) => {
    if (p.status === "Rejected" || p.status === "Archived") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });
  const rejectedCount = products.filter((p) => p.status === "Rejected").length;
  const archivedProducts = products.filter((p) => p.status === "Archived");

  const counts = {
    All: activeProducts.length,
    "Pending NPD": activeProducts.filter((p) => p.status === "Pending NPD").length,
    "Pending Decision": activeProducts.filter((p) => p.status === "Pending Decision").length,
    Approved: activeProducts.filter((p) => p.status === "Approved").length,
    "On hold": activeProducts.filter((p) => p.status === "On hold").length,
  };

  const totalAll = products.length;
  const rejectionRate = totalAll ? Math.round(((rejectedCount + archivedProducts.length) / totalAll) * 100) : 0;
  const priorityData = (["Urgent", "High", "Medium", "Low"] as const)
    .map((pr) => ({ name: pr, value: activeProducts.filter((p) => p.priority === pr).length, color: PRIORITY_DOT[pr] }))
    .filter((d) => d.value > 0);

  const chartData = (["Pending NPD", "Pending Decision", "Approved", "On hold", "Rejected", "Archived"] as Status[]).map((status) => ({
    name: status,
    value: products.filter((p) => p.status === status).length,
    color: STATUS_DOT[status],
  }));

  const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  const visible = (filter === "All" ? activeProducts : activeProducts.filter((p) => p.status === filter))
    .slice()
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));
  const active = products.find((p) => p.id === activeId) ?? null;

  function openProduct(p: ProductRow) {
    setActiveId(p.id);
  }


  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">A live snapshot of every product in the pipeline. Click any row to see details.</p>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            { label: "Total products", hint: "All products ever added", value: products.length, color: "#1e3a8a" },
            { label: "Pending NPD", hint: "Waiting for QA to test", value: counts["Pending NPD"], color: STATUS_DOT["Pending NPD"] },
            { label: "Approved", hint: "Passed QA and CEO review", value: counts["Approved"], color: STATUS_DOT["Approved"] },
            { label: "On hold", hint: "Waiting on factory response", value: counts["On hold"], color: STATUS_DOT["On hold"] },
          ] as const
        ).map((kpi) => (
          <div key={kpi.label} className="rounded-md border border-[#bfdbfe]/40 bg-[#ffffff] px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">{kpi.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
            <p className="mt-1 text-[11px] text-[#94a3b8]">{kpi.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">

        {/* Status donut — rejection rate */}
        <div className="rounded-md border border-[#bfdbfe]/40 bg-[#ffffff] p-5">
          <p className="text-xs font-normal uppercase tracking-wide text-[#64748b]">Status breakdown</p>
          <p className="mt-0.5 text-[11px] text-[#94a3b8]">Where every product sits right now across all stages.</p>
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
                <span className="text-[10px] text-[#1d4ed8]">rejected</span>
              </div>
            </div>
            <div className="space-y-1.5">
              {chartData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 text-xs text-[#1d4ed8]">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="truncate">{entry.name}</span>
                  <span className="ml-auto font-semibold tabular-nums text-[#0f172a]">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Priority breakdown bars */}
        <div className="rounded-md border border-[#bfdbfe]/40 bg-[#ffffff] p-5">
          <p className="text-xs font-normal uppercase tracking-wide text-[#64748b]">Priority split</p>
          <p className="mt-0.5 text-[11px] text-[#94a3b8]">How urgent the active products are. Urgent means action is needed today.</p>
          <div className="mt-4 space-y-3">
            {(["Urgent", "High", "Medium", "Low"] as const).map((pr) => {
              const count = activeProducts.filter((p) => p.priority === pr).length;
              const pct = activeProducts.length ? Math.round((count / activeProducts.length) * 100) : 0;
              return (
                <div key={pr}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium" style={{ color: PRIORITY_DOT[pr] }}>{pr}</span>
                    <span className="tabular-nums text-[#0f172a]">{count} <span className="text-[#64748b]">({pct}%)</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-[#eff6ff] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: PRIORITY_DOT[pr] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-[#0f172a]">Active products</h2>
        <p className="mt-0.5 text-xs text-[#94a3b8]">Use the filters below to narrow down by stage. Click a row to see the full product detail.</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIVE_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded border px-4 py-1.5 text-sm transition ${
              filter === f
                ? "border-blue-600 bg-blue-600 text-white font-medium shadow-sm"
                : "border-blue-100 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-200"
            }`}
          >
            {f} <span className="ml-1 opacity-70 tabular-nums">{counts[f]}</span>
          </button>
        ))}
      </div>

      <GridBeam rows={6} cols={8} colorVariant="ocean" theme="dark" active className="mt-6 overflow-hidden rounded-md border border-[#bfdbfe]/40 bg-[#ffffff]/80">
        <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#bfdbfe]/40 text-[#0f172a]">
              <th className="pl-4 pr-2 py-3 w-14" />
              <th className="px-4 py-3 font-medium">
                Product
                <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Code name · Factory SKU</p>
              </th>
              <th className="px-4 py-3 font-medium">
                Priority
                <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">How urgent this is</p>
              </th>
              <th className="px-4 py-3 font-medium">
                Status
                <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Pipeline stage</p>
              </th>
              <th className="px-4 py-3 font-medium">
                Stages
                <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">All pipeline stages</p>
              </th>
              <th className="px-4 py-3 font-medium">
                Last updated
                <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">When status last changed</p>
              </th>
              <th className="px-4 py-3 text-right font-medium w-32 whitespace-nowrap">
                Deadline
                <p className="text-[10px] font-normal text-[#94a3b8] mt-0.5">Target date</p>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center">
                  <p className="text-sm text-[#64748b]">No products match this filter.</p>
                  <p className="mt-1 text-xs text-[#94a3b8]">Try selecting "All" above, or add a new product using the button in the top right.</p>
                </td>
              </tr>
            ) : (
              visible.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => openProduct(p)}
                  className="cursor-pointer border-b border-[#bfdbfe]/30 transition last:border-0 hover:bg-[#eff6ff]"
                >
                  {/* Thumbnail */}
                  <td className="pl-4 pr-2 py-3" onClick={(e) => { e.stopPropagation(); setViewId(p.id); }}>
                    {p.imageDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageDataUrl}
                        alt={p.codeName}
                        className="h-12 w-12 rounded-md object-cover border border-[#bfdbfe]/40 hover:opacity-80 transition cursor-zoom-in"
                        title="Click to enlarge"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-md border border-[#bfdbfe]/30 bg-[#eff6ff] flex items-center justify-center text-[10px] font-semibold text-[#2a4a6a] select-none">
                        {p.codeName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </td>
                  {/* Name + SKU stacked */}
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900 leading-snug">{p.codeName}</p>
                    <p className="text-xs text-[#64748b] mt-0.5">{p.skuCode}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Chip color={STATUS_DOT[p.status]} label={p.status} />
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <StagePills stages={getPipelineTrail(p)} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[#d97706] whitespace-nowrap">
                    {p.statusChangedAt ? formatTimestamp(p.statusChangedAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#d97706] whitespace-nowrap">
                    {new Date(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </GridBeam>

      {(rejectedCount > 0 || archivedProducts.length > 0) && (
        <div className="mt-8 flex flex-wrap gap-3">
          {rejectedCount > 0 && (
            <a href="/rejected" className="flex-1 min-w-[180px] rounded-md border border-red-500/20 bg-[#ffffff]/60 px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#eff6ff] transition">
              <p className="text-sm text-[#64748b]">
                <span className="font-semibold text-red-400">{rejectedCount}</span> {rejectedCount === 1 ? "product" : "products"} pending CEO confirmation.
              </p>
              <span className="shrink-0 text-xs text-[#1d4ed8]">View →</span>
            </a>
          )}
          {archivedProducts.length > 0 && (
            <a href="/archived" className="flex-1 min-w-[180px] rounded-md border border-[#bfdbfe]/30 bg-[#ffffff]/60 px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#eff6ff] transition">
              <p className="text-sm text-[#64748b]">
                <span className="font-semibold text-[#1d4ed8]">{archivedProducts.length}</span> {archivedProducts.length === 1 ? "product" : "products"} in archive.
              </p>
              <span className="shrink-0 text-xs text-[#1d4ed8]">View →</span>
            </a>
          )}
        </div>
      )}

      <Modal open={!!active} onClose={() => setActiveId(null)}>
        {active && active.status === "On hold" && (
          <div>
            <h2 className="text-lg font-semibold text-[#0f172a]">{active.codeName}</h2>
            <p className="mt-1 text-sm text-[#1d4ed8]">{active.skuCode} — on hold</p>
            <p className="mt-2 text-xs text-[#64748b]">Manage this product from the NPD Testing page.</p>
            <div className="mt-5 space-y-0">
              <TimelineRow label="Factory emailed" value={active.factoryComm?.decidedAt ?? null} pending="No action yet" />
              <TimelineRow label="Dev acknowledged" value={active.factoryComm?.acknowledgedAt ?? null} pending="Pending" />
              <TimelineRow label="Factory replied" value={active.factoryComm?.replyAt ?? null} pending="Pending" />
            </div>
            {active.factoryComm?.replyText && (
              <div className="mt-3 rounded-md bg-[#eff6ff] p-3">
                <p className="text-xs uppercase tracking-wide text-[#64748b]">Reply</p>
                <p className="mt-1 text-sm text-[#0f172a]">{active.factoryComm.replyText}</p>
                {active.factoryComm.tentativeReturnDate && (
                  <p className="mt-1 text-xs text-[#1d4ed8]">Return date: {active.factoryComm.tentativeReturnDate}</p>
                )}
              </div>
            )}
            <button onClick={() => setActiveId(null)} className="mt-6 w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2 text-sm text-[#1d4ed8] hover:bg-[#eff6ff]">Close</button>
          </div>
        )}

        {active && active.status === "Approved" && (
          <div>
            <h2 className="text-lg font-semibold text-[#0f172a]">{active.codeName}</h2>
            <p className="mt-1 text-sm text-[#1d4ed8]">{active.skuCode} — approved</p>
            <p className="mt-2 text-xs text-[#64748b]">Manage the full workflow from the Golden Product page.</p>
            <div className="mt-5 space-y-0">
              <TimelineRow label="Purchase notified" value={active.goldenWorkflow?.purchaseNotifiedAt ?? null} pending="Not yet" />
              <TimelineRow label="Order confirmed" value={active.goldenWorkflow?.orderConfirmedAt ?? null} pending="Pending" />
              <TimelineRow label="Details saved" value={active.goldenWorkflow?.details?.savedAt ?? null} pending="Pending" />
              <TimelineRow label="Compliance confirmed" value={active.goldenWorkflow?.compliance?.confirmedAt ?? null} pending="Pending" />
              <TimelineRow label="Packaging released" value={active.goldenWorkflow?.packaging?.releasedAt ?? null} pending="Pending" />
              <TimelineRow label="Golden sample" value={active.goldenWorkflow?.goldenSample?.receivedAt ?? null} pending={active.goldenWorkflow?.goldenSample?.status ?? "Not started"} />
            </div>
            <button onClick={() => setActiveId(null)} className="mt-6 w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2 text-sm text-[#1d4ed8] hover:bg-[#eff6ff]">Close</button>
          </div>
        )}

        {active && active.status === "Pending Decision" && (
          <div>
            <h2 className="text-lg font-semibold text-[#0f172a]">{active.codeName}</h2>
            <p className="mt-1 text-sm text-[#1d4ed8]">{active.skuCode}</p>
            <div className="mt-6 rounded-md border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-5 py-4 text-center">
              <p className="text-sm font-medium text-[#3b82f6]">Awaiting team decision</p>
              <p className="mt-1 text-xs text-[#1d4ed8]">NPD report passed — CEO &amp; Dev team have been notified. No action taken yet.</p>
            </div>
            {active.npdReport && (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between border-b border-[#bfdbfe]/30 py-2">
                  <span className="text-[#1d4ed8]">NPD outcome</span>
                  <span className="font-semibold text-green-400">{active.npdReport.outcome}</span>
                </div>
                <div className="flex justify-between border-b border-[#bfdbfe]/30 py-2">
                  <span className="text-[#1d4ed8]">Submitted</span>
                  <span className="text-[#0f172a]">{new Date(active.npdReport.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
                {active.npdReport.notes && (
                  <div className="border-b border-[#bfdbfe]/30 py-2">
                    <span className="block text-[#1d4ed8]">QA notes</span>
                    <span className="mt-1 block text-[#0f172a]">{active.npdReport.notes}</span>
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setActiveId(null)} className="mt-6 w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2 text-sm text-[#1d4ed8] hover:bg-[#eff6ff]">Close</button>
          </div>
        )}

        {active && active.status === "Pending NPD" && (
          <div>
            <h2 className="text-lg font-semibold text-[#0f172a]">{active.codeName}</h2>
            <p className="mt-1 text-sm text-[#1d4ed8]">{active.skuCode} — pending NPD testing</p>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between border-b border-[#bfdbfe]/30 py-2">
                <span className="text-[#1d4ed8]">Factory</span>
                <span className="text-[#0f172a]">{active.factory || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-[#bfdbfe]/30 py-2">
                <span className="text-[#1d4ed8]">Sample received</span>
                <span className="text-[#0f172a]">{active.sampleReceived ? "Yes" : "No"}</span>
              </div>
              {active.sampleReceived && (
                <div className="flex justify-between border-b border-[#bfdbfe]/30 py-2">
                  <span className="text-[#1d4ed8]">Given to QA on</span>
                  <span className="text-[#0f172a]">{active.sampleGivenDate || "—"}</span>
                </div>
              )}
              <div className="border-b border-[#bfdbfe]/30 py-2">
                <span className="block text-[#1d4ed8]">Specifications</span>
                <span className="mt-1 block text-[#0f172a]">{active.specifications || "—"}</span>
              </div>
            </div>

            <button
              onClick={() => setActiveId(null)}
              className="mt-6 w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2 text-sm text-[#1d4ed8] hover:bg-[#eff6ff]"
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
          const statusLabel: Record<string, string> = {
            "Pending NPD":      "Waiting for QA to run NPD testing",
            "Pending Decision": "NPD report submitted — waiting for CEO / Dev decision",
            "Approved":         "Approved — currently in the golden product workflow",
            "On hold":          "On hold — currently in talks with the factory",
            "Rejected":         "Rejected — pending CEO confirmation before archiving",
            "Archived":         "Archived — confirmed by CEO, out of the pipeline",
          };

          return (
            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">{p.codeName}</h2>
              <p className="mt-0.5 text-sm text-[#1d4ed8]">{p.skuCode}</p>

              {p.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageDataUrl} alt={p.codeName} className="mt-4 w-full rounded-md object-contain max-h-[60vh] bg-[#eff6ff]" />
              ) : (
                <div className="mt-4 flex h-32 items-center justify-center rounded-md border border-dashed border-[#bfdbfe]/50 bg-[#eff6ff] text-sm text-[#64748b]">
                  No image uploaded
                </div>
              )}

              <div className="mt-4 space-y-0 text-sm">
                {/* Status row — dot + label + description */}
                <div className="flex items-start justify-between border-b border-[#bfdbfe]/30 py-2 gap-4">
                  <span className="text-[#1d4ed8] shrink-0">Status</span>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_DOT[p.status] }} />
                      <span className="font-medium text-[#0f172a]">{p.status}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#64748b]">{statusLabel[p.status]}</p>
                  </div>
                </div>

                {[
                  ["Priority", p.priority],
                  ["Factory", p.factory ?? "—"],
                  ["Deadline", new Date(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })],
                  ["Status since", p.statusChangedAt ? formatTimestamp(p.statusChangedAt) : "—"],
                  ["Sample received", p.sampleReceived ? "Yes" : "No"],
                  p.sampleReceived && p.sampleGivenDate ? ["Given to QA on", p.sampleGivenDate] : null,
                ].filter((x): x is string[] => x !== null).map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b border-[#bfdbfe]/30 py-2">
                    <span className="text-[#1d4ed8]">{label}</span>
                    <span className="font-medium text-[#0f172a]">{value}</span>
                  </div>
                ))}
                {p.specifications && (
                  <div className="border-b border-[#bfdbfe]/30 py-2">
                    <span className="block text-[#1d4ed8]">Specifications</span>
                    <span className="mt-1 block text-[#0f172a]">{p.specifications}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setViewId(null)}
                className="mt-6 w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2 text-sm text-[#1d4ed8] hover:bg-[#eff6ff]"
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