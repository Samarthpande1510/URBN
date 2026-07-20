"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { parseServerDate } from "@/lib/datetime";
import { useToast } from "@/components/Toast";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { Chip } from "@/components/Chip";
import { useProducts, Status, ProductRow } from "@/lib/products-context";
import { STATUS_DOT, PRIORITY_DOT } from "@/lib/colors";
import { GridBeam } from "@/components/ui/grid-beam";
import { getSession } from "@/lib/auth";
import { api, apiErrorMessage } from "@/lib/api";

type ActiveFilter = "All" | "Pending NPD" | "Pending Decision" | "Approved" | "On hold" | "Rejected";
const ACTIVE_FILTERS: ActiveFilter[] = ["All", "Pending NPD", "Pending Decision", "Approved", "On hold", "Rejected"];

function formatTimestamp(value: string | null) {
  if (!value) return null;
  return parseServerDate(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

const STAGE_PILL_STYLE: Record<string, string> = {
  "NPD TESTING: PENDING":    "bg-[#eff6ff] text-[#64748b] border-[#bfdbfe]/60",
  "NPD TESTING: PASS":       "bg-green-500/15 text-green-400 border-green-500/30",
  "NPD TESTING: FAIL":       "bg-red-500/15 text-red-400 border-red-500/30",
  "EMAILED TO FACTORY":      "bg-[#eff6ff] text-[#3b82f6] border-[#93c5fd]/40",
  "IMPROVEMENT REQUIREMENT": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "DECISION PENDING":         "bg-amber-500/10 text-amber-500 border-amber-500/30",
  "GOLDEN SAMPLES PENDING":  "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "ORDER PENDING":           "bg-purple-500/10 text-purple-400 border-purple-500/25",
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
  const stages: string[] = [];
  const fc = p.factoryComm;
  const gw = p.goldenWorkflow;
  const od = p.orderDecision;
  const v = p.sampleVersion ?? 1;

  // ── Step 1: NPD Testing (always first) ──
  if (!p.npdReport) {
    stages.push("NPD TESTING: PENDING");
    return stages;
  }
  stages.push(p.npdReport.outcome === "Pass" ? "NPD TESTING: PASS" : "NPD TESTING: FAIL");

  // ── Rejected / Archived ──
  if (p.status === "Rejected" || p.status === "Archived") {
    stages.push("REJECTED");
    return stages;
  }

  // ── On Hold / Improvement sample cycle ──
  if (p.status === "On hold" || (v > 1 && fc && !gw)) {
    stages.push("EMAILED TO FACTORY");
    stages.push("REVISED SAMPLE REQUESTED");
    const sampleReceived = !!fc?.improvementSampleReceivedAt;
    if (!sampleReceived) {
      stages.push("REVISED SAMPLE PENDING");
    } else if (p.npdReport && v > 1) {
      // Improvement sample NPD submitted — show result
      stages.push("REVISED SAMPLE RECEIVED");
      stages.push(p.npdReport.outcome === "Pass" ? "REVISED TESTING: PASS" : "REVISED TESTING: FAIL");
    } else {
      stages.push("REVISED SAMPLE RECEIVED");
    }
    return stages;
  }

  // ── Improvement sample: in NPD Testing ──
  if (v > 1 && fc && p.status === "Pending NPD") {
    stages.push("EMAILED TO FACTORY");
    stages.push("REVISED SAMPLE REQUESTED");
    stages.push("REVISED SAMPLE RECEIVED");
    stages.push("REVISED TESTING: PENDING");
    return stages;
  }

  // ── Approved / Golden workflow ──
  if (p.status === "Approved" || p.status === "Pending NPD" || p.status === "Pending Decision") {
    if (fc?.replyReceivedAt) {
      stages.push("EMAILED TO FACTORY");
      stages.push("REVISED SAMPLE REQUESTED");
      stages.push("REVISED SAMPLE RECEIVED");
    }

    if (!gw?.purchaseNotifiedAt) {
      stages.push(p.status === "Pending Decision" ? "DECISION PENDING" : "ORDER PENDING");
      return stages;
    }
    stages.push("PURCHASE TEAM NOTIFIED");
    if (gw.orderConfirmedAt) stages.push("ORDER CONFIRMED");
    if (gw.details) stages.push("PRODUCT DETAILS SAVED");
    if (gw.details?.bomConfirmedAt) stages.push("BOM CONFIRMED");

    const compTracks = gw.compliance?.tracks ?? [];
    if (compTracks.length > 0) {
      stages.push(compTracks.every((t) => t.confirmedAt) ? "COMPLIANCE CONFIRMED" : "COMPLIANCE INITIATED");
    }
    if (gw.packaging?.kldEmailedToDesignerAt) stages.push("PACKAGING RELEASED");
    else if (gw.packaging) stages.push("PACKAGING INITIATED");

    const gs = gw.goldenSample;
    if (gs?.status === "Received") stages.push("GOLDEN SAMPLE RECEIVED");
    else if (gs?.status === "In progress" || gs?.status === "Requested") stages.push("GOLDEN SAMPLE TRACKING STARTED");

    if (od?.state === "placed") stages.push("ORDER PLACED");
    else if (od?.state === "held") stages.push("ORDER HELD");
    else if (od?.state === "dropped") stages.push("ORDER DROPPED");

    return stages;
  }

  return stages.length ? stages : ["NPD TESTING: PENDING"];
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
      if (!gw.details)                    return "Golden product — Part 1: product details pending";
      const part1Checks = [gw.details.colourConfirmedAt, gw.details.logoMarkingConfirmedAt, gw.details.ratingLabelConfirmedAt, gw.details.bomConfirmedAt];
      const part1Done = part1Checks.filter(Boolean).length;
      if (part1Done < part1Checks.length) return `Golden product — Part 1: ${part1Done}/${part1Checks.length} confirmations done`;
      const tracks = gw.compliance?.tracks ?? [];
      const compDone = tracks.length > 0 && tracks.every((tr) => !!tr.confirmedAt);
      const packDone = !!gw.packaging?.kldEmailedToDesignerAt;
      const gsDone   = gw.goldenSample?.status === "Received";
      const compConfirmedCount = tracks.filter((tr) => tr.confirmedAt).length;
      const complianceLabel = tracks.length === 0
        ? "compliance not started"
        : compDone
        ? `compliance confirmed (${tracks.map((tr) => tr.name).join(", ")})`
        : `compliance ${compConfirmedCount}/${tracks.length} confirmed (${tracks.map((tr) => tr.name).join(", ")})`;
      if (gsDone && compDone && packDone)  return "Golden product — all tracks complete";
      if (gsDone)                          return `Golden sample received — ${complianceLabel}, packaging in progress`;
      if (gw.goldenSample?.status === "In progress") return `Golden sample in progress — ${complianceLabel}`;
      if (gw.goldenSample?.status === "Requested")   return `Golden samples pending — ${complianceLabel}`;
      if (!compDone)                       return `Golden product — ${complianceLabel}`;
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


const PRIORITY_OPTIONS = ["Urgent", "P1 — High", "P2 — Medium", "P3 — Low"];
const emptyEditForm = { productName: "", factory: "", factorySku: "", colors: "", priority: PRIORITY_OPTIONS[0], specifications: "", sampleReceived: false, sampleGivenDate: "", deadline: "" };

export default function DashboardPage() {
  const { products, setProducts, refreshProducts, search } = useProducts();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<ActiveFilter>("All");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editImageName, setEditImageName] = useState<string | null>(null);
  const [editImageDataUrl, setEditImageDataUrl] = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null);
  useEffect(() => { setSession(getSession()); }, []);
  const isCEO = session?.role === "CEO";

  function openModal(id: number) {
    setActiveId(id);
  }

  function openEdit(p: ProductRow) {
    const priorityMap: Record<string, string> = { Urgent: "Urgent", High: "P1 — High", Medium: "P2 — Medium", Low: "P3 — Low" };
    setEditForm({
      productName: p.codeName,
      factory: p.factory ?? "",
      factorySku: p.skuCode,
      colors: (p as ProductRow & { colors?: string }).colors ?? "",
      priority: priorityMap[p.priority] ?? PRIORITY_OPTIONS[0],
      specifications: p.specifications ?? "",
      sampleReceived: p.sampleReceived ?? false,
      sampleGivenDate: p.sampleGivenDate ?? "",
      deadline: p.deadline ?? "",
    });
    setEditImageName(null);
    setEditImageDataUrl(p.imageDataUrl ?? null);
    setEditId(p.id);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editId) return;
    const p = products.find((x) => x.id === editId);
    if (!p) return;
    const priorityLabelMap: Record<string, string> = { "Urgent": "Urgent", "P1 — High": "High", "P2 — Medium": "Medium", "P3 — Low": "Low" };
    try {
      await api.products.update(editId, {
        code_name: editForm.productName.trim() || p.codeName,
        factory: editForm.factory || undefined,
        sku_code: editForm.factorySku || undefined,
        priority: priorityLabelMap[editForm.priority] ?? p.priority,
        specifications: editForm.specifications || undefined,
        sample_received: editForm.sampleReceived,
        sample_given_date: editForm.sampleGivenDate || undefined,
        deadline: editForm.deadline || p.deadline,
        image_url: editImageDataUrl ?? p.imageDataUrl ?? undefined,
      }, p.version);
      await refreshProducts();
      showToast("Product updated");
      setEditId(null);
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    }
  }

  // Terminal products only: order placed, order dropped, or rejected (confirmation stage)
  function canHide(p: ProductRow): boolean {
    return p.status === "Rejected" || p.orderDecision?.state === "placed" || p.orderDecision?.state === "dropped";
  }

  async function hideProduct(p: ProductRow) {
    try {
      await api.products.hide(p.id, p.version);
      await refreshProducts();
      showToast(`${p.codeName} moved to Hidden`);
    } catch (err: unknown) {
      const { message, isConflict } = apiErrorMessage(err);
      if (isConflict) await refreshProducts();
      showToast(isConflict ? message : `Error: ${message}`);
    }
  }

  const q = search.toLowerCase();
  const activeProducts = products.filter((p) => {
    if (p.hidden) return false;
    if (p.status === "Rejected" || p.status === "Archived" || p.status === "Removed") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });
  const rejectedProducts = products.filter((p) => {
    if (p.hidden) return false;
    if (p.status !== "Rejected") return false;
    if (q) return p.codeName.toLowerCase().includes(q) || (p.factory ?? "").toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });
  const rejectedCount = products.filter((p) => p.status === "Rejected").length;
  // Matches the exact filter used on /decision-pending — excludes improvement-sample cases.
  const pendingCeoConfirmationCount = products.filter(
    (p) => p.status === "Pending Decision" && !p.factoryComm?.improvementSampleExpected
  ).length;
  const archivedProducts = products.filter((p) => p.status === "Archived");

  const allTabProducts = [
    ...activeProducts,
    ...rejectedProducts,
  ];

  const counts = {
    All: allTabProducts.length,
    "Pending NPD": activeProducts.filter((p) => p.status === "Pending NPD").length,
    "Pending Decision": activeProducts.filter((p) => p.status === "Pending Decision").length,
    Approved: activeProducts.filter((p) => p.status === "Approved").length,
    "On hold": activeProducts.filter((p) => p.status === "On hold").length,
    Rejected: rejectedProducts.length,
  };

  const totalAll = products.length;
  const rejectionRate = totalAll ? Math.round(((rejectedCount + archivedProducts.length) / totalAll) * 100) : 0;
  const priorityData = (["Urgent", "High", "Medium", "Low"] as const)
    .map((pr) => ({ name: pr, value: activeProducts.filter((p) => p.priority === pr).length, color: PRIORITY_DOT[pr] }))
    .filter((d) => d.value > 0);

  const chartData = (["Pending NPD", "Pending Decision", "Approved", "On hold", "Rejected", "Archived", "Removed"] as Status[]).map((status) => ({
    name: status,
    value: products.filter((p) => p.status === status).length,
    color: STATUS_DOT[status],
  }));

  const getAddedAt = (p: ProductRow) => p.activityLog[0]?.timestamp ?? p.statusChangedAt ?? "";
  const visible = (filter === "Rejected" ? rejectedProducts : filter === "All" ? allTabProducts : activeProducts.filter((p) => p.status === filter))
    .slice()
    .sort((a, b) => {
      const aRej = a.status === "Rejected" ? 1 : 0;
      const bRej = b.status === "Rejected" ? 1 : 0;
      if (aRej !== bRej) return aRej - bRej;
      return getAddedAt(b).localeCompare(getAddedAt(a));
    });
  const active = products.find((p) => p.id === activeId) ?? null;

  function openProduct(p: ProductRow) {
    openModal(p.id);
  }


  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">A live snapshot of every product in the pipeline. Click any row to see details.</p>

      
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
                Product Name
              </th>
              <th className="px-4 py-3 font-medium">
                Priority
              </th>
              <th className="px-4 py-3 font-medium">
                Current Status
              </th>
              <th className="px-4 py-3 font-medium">
                Product Stages
              </th>
              <th className="px-4 py-3 font-medium">
                Last updated
              </th>
              <th className="px-4 py-3 text-right font-medium w-32 whitespace-nowrap">
                Deadline
              </th>
              <th className="px-4 py-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center">
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
                    <p className="font-semibold text-slate-900 leading-snug flex items-center gap-1.5 flex-wrap">
                      {p.codeName}
                      {(p.sampleVersion ?? 1) >= 1 && (
                        <span className="rounded-md border border-purple-500/50 bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-600 tracking-wide">v{p.sampleVersion ?? 1} {p.status === "Approved" ? "Approved" : p.status === "On hold" ? "On Hold" : p.status === "Rejected" ? "Rejected" : ""}</span>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <Chip color={STATUS_DOT[p.status]} label={p.status} />
                    <p className="mt-1 text-[11px] text-[#64748b] leading-snug max-w-[180px]">{getPipelineStage(p)}</p>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <StagePills stages={getPipelineTrail(p)} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[#d97706] whitespace-nowrap">
                    {p.statusChangedAt ? formatTimestamp(p.statusChangedAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#d97706] whitespace-nowrap">
                    {p.deadline ? parseServerDate(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" }) : <span className="text-[#94a3b8]">—</span>}
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEdit(p)}
                        className="rounded border border-[#bfdbfe]/50 px-2.5 py-1 text-xs text-[#64748b] hover:bg-[#eff6ff] hover:text-[#1d4ed8] transition whitespace-nowrap"
                      >
                        ✎ Edit
                      </button>
                      {canHide(p) && (
                        <button
                          onClick={() => hideProduct(p)}
                          title="Move to the Hidden tab — data is kept, just decluttered from the dashboard"
                          className="rounded border border-[#bfdbfe]/50 px-2.5 py-1 text-xs text-[#94a3b8] hover:bg-[#eff6ff] hover:text-[#64748b] transition whitespace-nowrap"
                        >
                          Hide
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </GridBeam>

      {(pendingCeoConfirmationCount > 0 || archivedProducts.length > 0) && (
        <div className="mt-8 flex flex-wrap gap-3">
          {pendingCeoConfirmationCount > 0 && (
            <a href="/decision-pending" className="flex-1 min-w-[180px] rounded-md border border-red-500/20 bg-[#ffffff]/60 px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#eff6ff] transition">
              <p className="text-sm text-[#64748b]">
                <span className="font-semibold text-red-400">{pendingCeoConfirmationCount}</span> {pendingCeoConfirmationCount === 1 ? "product" : "products"} pending CEO confirmation.
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
        {active && (
          <div className="mb-5 border-b border-[#bfdbfe]/30 pb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-[#0f172a] flex-1">{active.codeName}</h2>
              <button onClick={() => { setActiveId(null); openEdit(active); }} className="rounded border border-[#bfdbfe]/50 px-2.5 py-1 text-xs text-[#64748b] hover:bg-[#eff6ff] hover:text-[#1d4ed8] transition">
                ✎ Edit
              </button>
            </div>
          </div>
        )}
        {active && active.status === "Pending NPD" && (
          <div>
            <p className="mt-1 text-sm text-[#1d4ed8]">{active.skuCode}</p>
            <div className="mt-6 rounded-md border border-[#bfdbfe]/40 bg-[#eff6ff] px-5 py-4 text-center">
              <p className="text-sm font-medium text-[#1d4ed8]">Waiting for QA to run NPD testing</p>
              <p className="mt-1 text-xs text-[#64748b]">This is a read-only summary. NPD testing is managed from the NPD Testing page.</p>
            </div>
            <div className="mt-4 space-y-0 text-sm">
              {([
                ["Priority", active.priority],
                ["Factory", active.factory ?? "—"],
                active.deadline ? ["Deadline", parseServerDate(active.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })] : null,
              ].filter(Boolean) as string[][]).map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-[#bfdbfe]/30 py-2">
                  <span className="text-[#1d4ed8]">{label}</span>
                  <span className="font-medium text-[#0f172a]">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setActiveId(null)} className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2 text-sm text-[#1d4ed8] hover:bg-[#eff6ff]">Close</button>
            </div>
          </div>
        )}

        {active && active.status === "On hold" && (
          <div>
            <p className="mt-1 text-sm text-[#1d4ed8]">{active.skuCode} — on hold</p>
            <p className="mt-2 text-xs text-[#64748b]">Manage this product from the On Hold page.</p>
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
            <div className="mt-6 flex gap-3">
              <button onClick={() => setActiveId(null)} className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2 text-sm text-[#1d4ed8] hover:bg-[#eff6ff]">Close</button>
            </div>
          </div>
        )}

        {active && active.status === "Approved" && (
          <div>
            <p className="mt-1 text-sm text-[#1d4ed8]">{active.skuCode} — approved</p>
            <p className="mt-2 text-xs text-[#64748b]">Manage the full workflow from the Golden Product page.</p>
            <p className="mt-1 text-xs font-medium text-[#1d4ed8]">{getPipelineStage(active)}</p>
            <div className="mt-5 space-y-0">
              <TimelineRow label="Purchase notified" value={active.goldenWorkflow?.purchaseNotifiedAt ?? null} pending="Not yet" />
              <TimelineRow label="Order confirmed" value={active.goldenWorkflow?.orderConfirmedAt ?? null} pending="Pending" />
              <TimelineRow label="Details saved" value={active.goldenWorkflow?.details?.savedAt ?? null} pending="Pending" />
              {active.goldenWorkflow?.details && (
                <div className="flex items-center justify-between border-b border-[#bfdbfe]/30 py-3 last:border-0">
                  <span className="text-sm text-[#1d4ed8]">Part 1 confirmations</span>
                  <span className="text-sm font-medium text-[#0f172a]">
                    {[active.goldenWorkflow.details.colourConfirmedAt, active.goldenWorkflow.details.logoMarkingConfirmedAt, active.goldenWorkflow.details.ratingLabelConfirmedAt, active.goldenWorkflow.details.bomConfirmedAt].filter(Boolean).length}/4 done
                  </span>
                </div>
              )}
              {active.goldenWorkflow?.compliance?.tracks.length ? (
                <div className="flex items-center justify-between border-b border-[#bfdbfe]/30 py-3 last:border-0">
                  <span className="text-sm text-[#1d4ed8]">Compliance</span>
                  <span className="text-sm font-medium text-[#0f172a]">
                    {active.goldenWorkflow.compliance.tracks.filter((tr) => tr.confirmedAt).length}/{active.goldenWorkflow.compliance.tracks.length} confirmed
                  </span>
                </div>
              ) : (
                <TimelineRow label="Compliance confirmed" value={null} pending="Not started" />
              )}
              <TimelineRow label="Packaging completed" value={active.goldenWorkflow?.packaging?.kldEmailedToDesignerAt ?? null} pending="Pending" />
              <TimelineRow label="Golden sample" value={active.goldenWorkflow?.goldenSample?.receivedAt ?? null} pending={active.goldenWorkflow?.goldenSample?.status ?? "Not started"} />
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setActiveId(null)} className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2 text-sm text-[#1d4ed8] hover:bg-[#eff6ff]">Close</button>
            </div>
          </div>
        )}

        {active && active.status === "Pending Decision" && (
          <div>
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
                {active.npdReport.notes && (
                  <div className="border-b border-[#bfdbfe]/30 py-2">
                    <span className="block text-[#1d4ed8]">QA notes</span>
                    <span className="mt-1 block text-[#0f172a]">{active.npdReport.notes}</span>
                  </div>
                )}
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button onClick={() => setActiveId(null)} className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2 text-sm text-[#1d4ed8] hover:bg-[#eff6ff]">Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit product modal */}
      <Modal open={!!editId} onClose={() => setEditId(null)}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[#0f172a]">Edit Product</h2>
          <button onClick={() => setEditId(null)} className="text-[#64748b] hover:text-[#0f172a]">✕</button>
        </div>
        <form onSubmit={saveEdit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">Product Name *</label>
            <input required value={editForm.productName} onChange={(e) => setEditForm((f) => ({ ...f, productName: e.target.value }))}
              className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">Factory Name</label>
              <input value={editForm.factory} onChange={(e) => setEditForm((f) => ({ ...f, factory: e.target.value }))}
                placeholder="e.g. Shenzhen PowerTech"
                className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">Factory SKU</label>
              <input value={editForm.factorySku} onChange={(e) => setEditForm((f) => ({ ...f, factorySku: e.target.value }))}
                placeholder="e.g. UPR136"
                className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">Priority</label>
            <select value={editForm.priority} onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
              className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]">
              {PRIORITY_OPTIONS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">Specifications</label>
            <textarea value={editForm.specifications} onChange={(e) => setEditForm((f) => ({ ...f, specifications: e.target.value }))}
              rows={3} placeholder="Capacity, wattage, key specs..."
              className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">Deadline</label>
            <input type="date" value={editForm.deadline} onChange={(e) => setEditForm((f) => ({ ...f, deadline: e.target.value }))}
              className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">Product image</label>
            <input ref={editFileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setEditImageName(file?.name ?? null);
                if (file) {
                  if (file.size > 2 * 1024 * 1024) { showToast("Image too large — max 2MB"); e.target.value = ""; return; }
                  const r = new FileReader(); r.onload = (ev) => setEditImageDataUrl(ev.target?.result as string ?? null); r.readAsDataURL(file);
                }
              }} />
            <button type="button" onClick={() => editFileRef.current?.click()}
              className="relative w-full overflow-hidden rounded-md border-2 border-dashed border-[#bfdbfe]/50 bg-[#ffffff] text-sm text-[#1d4ed8] hover:bg-[#eff6ff]">
              {editImageDataUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={editImageDataUrl} alt="preview" className="h-32 w-full object-cover" />
                : <div className="flex flex-col items-center justify-center py-6"><span className="text-2xl">↑</span><span className="mt-1 text-sm">Click to upload photo</span></div>}
            </button>
            {editImageDataUrl && <button type="button" onClick={() => setEditImageDataUrl(null)} className="mt-1 text-xs text-red-400 hover:underline">Remove image</button>}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { const p = products.find((x) => x.id === editId); if (p) openEdit(p); }}
              className="rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-4 py-2.5 text-sm font-medium text-[#64748b] hover:bg-[#eff6ff]">Clear</button>
            <button type="button" onClick={() => setEditId(null)}
              className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2.5 text-sm font-medium text-[#1d4ed8] hover:bg-[#eff6ff]">Cancel</button>
            <button type="submit"
              className="flex-1 rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Save</button>
          </div>
        </form>
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
                  ["Deadline", parseServerDate(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })],
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