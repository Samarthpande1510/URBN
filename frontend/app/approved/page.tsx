"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useProducts, ProductRow, Status, ColorOrder } from "@/lib/products-context";
import { PRIORITY_DOT } from "@/lib/colors";
import { Chip } from "@/components/Chip";
import { getSession, Session } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { CheckCircle, PauseCircle, Trash2, Plus, X } from "lucide-react";
import { GridBeam } from "@/components/ui/grid-beam";

function fmt(v: string | null) {
  if (!v) return null;
  return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function OrderForm({ p, session, onDone }: { p: ProductRow; session: Session; onDone: () => void }) {
  const { setProducts, addNotification } = useProducts();
  const { showToast } = useToast();
  const [colors, setColors] = useState<ColorOrder[]>([{ color: "", quantity: 0 }]);

  function addColor() { setColors((c) => [...c, { color: "", quantity: 0 }]); }
  function removeColor(i: number) { setColors((c) => c.filter((_, idx) => idx !== i)); }
  function updateColor(i: number, field: "color" | "quantity", value: string | number) {
    setColors((c) => c.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  const canPlace = colors.length > 0 && colors.every((c) => c.color.trim() && c.quantity > 0);

  function placeOrder() {
    if (!canPlace) return;
    const now = new Date().toISOString();
    const od = p.orderDecision!;
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      orderDecision: { ...od, state: "placed", decidedAt: now, decidedBy: session.name, colors },
      goldenWorkflow: {
        purchaseNotifiedAt: null, orderConfirmedAt: null, purchaseLog: [],
        details: null, compliance: null, packaging: null, goldenSample: null,
        improvedGoldenSampleExpected: od.improvedGoldenSampleExpected,
      },
      activityLog: [...x.activityLog, {
        action: `Order placed by ${session.name} — ${colors.map((c) => `${c.color} ×${c.quantity}`).join(", ")}`,
        timestamp: now,
        stages: ["ORDER PLACED", "GOLDEN SAMPLES PENDING"],
      }],
    }));
    addNotification({ targetRoles: ["CEO", "Dev", "Sales", "QA"], productId: p.id, productName: p.codeName, message: `Order placed for ${p.codeName} (${od.internalCode}) — moving to Golden Sample.` });
    showToast("Order placed — moved to Golden Sample");
    onDone();
  }

  return (
    <div className="mt-4 rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] px-4 py-4 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[#1d4ed8]">Colors &amp; Quantities</p>
      {colors.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={row.color}
            onChange={(e) => updateColor(i, "color", e.target.value)}
            placeholder="e.g. Black"
            className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#94a3b8]"
          />
          <input
            type="number" min={1}
            value={row.quantity || ""}
            onChange={(e) => updateColor(i, "quantity", parseInt(e.target.value) || 0)}
            placeholder="Qty"
            className="w-20 rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd] placeholder:text-[#94a3b8]"
          />
          {colors.length > 1 && (
            <button onClick={() => removeColor(i)} className="text-[#94a3b8] hover:text-red-400 transition">
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      <button onClick={addColor} className="flex items-center gap-1.5 text-xs text-[#3b82f6] hover:text-[#1d4ed8] transition">
        <Plus size={13} /> Add colour
      </button>
      <div className="flex gap-2 pt-1">
        <button
          onClick={placeOrder}
          disabled={!canPlace}
          className="flex-1 rounded-md bg-green-600 py-2.5 text-sm font-semibold text-slate-900 hover:bg-green-700 disabled:opacity-40 transition"
        >
          Confirm &amp; place order
        </button>
        <button onClick={onDone} className="rounded-md border border-[#bfdbfe]/50 px-4 py-2.5 text-sm text-[#64748b] hover:bg-[#eff6ff]">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProductCard({ p, session, canOrder }: { p: ProductRow; session: Session | null; canOrder: boolean }) {
  const { setProducts, addNotification } = useProducts();
  const { showToast } = useToast();
  const [showOrderForm, setShowOrderForm] = useState(false);
  const od = p.orderDecision!;

  function holdOrder() {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      orderDecision: { ...od, state: "held", decidedAt: now, decidedBy: session?.name ?? "" },
      activityLog: [...x.activityLog, { action: `Order put on hold by ${session?.name}`, timestamp: now, stages: ["ORDER HELD"] }],
    }));
    addNotification({ targetRoles: ["CEO", "Dev"], productId: p.id, productName: p.codeName, message: `Order for ${p.codeName} put on hold.` });
    showToast("Order put on hold");
  }

  function dropOrder() {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      orderDecision: { ...od, state: "dropped", decidedAt: now, decidedBy: session?.name ?? "" },
      activityLog: [...x.activityLog, { action: `Order dropped by ${session?.name} — moved to Order Archive`, timestamp: now, stages: ["ORDER DROPPED"] }],
    }));
    addNotification({ targetRoles: ["CEO", "Dev"], productId: p.id, productName: p.codeName, message: `Order for ${p.codeName} dropped — moved to Order Archive.` });
    showToast("Moved to Order Archive");
  }

  function reinstateOrder() {
    const now = new Date().toISOString();
    setProducts((prev) => prev.map((x) => x.id !== p.id ? x : {
      ...x,
      orderDecision: { ...od, state: "pending", decidedAt: null, decidedBy: null },
      activityLog: [...x.activityLog, { action: `Order reinstated by ${session?.name}`, timestamp: now }],
    }));
    showToast("Order reinstated");
  }

  const isHeld = od.state === "held";

  return (
    <GridBeam rows={4} cols={6} colorVariant="colorful" theme="dark" active className={`rounded-md border bg-[#ffffff] overflow-hidden ${isHeld ? "border-amber-500/20" : "border-[#bfdbfe]/40"}`}>
      <div className="flex flex-wrap items-start gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white">{p.codeName}</p>
            <span className="text-[10px] font-mono bg-[#eff6ff] border border-[#93c5fd]/30 text-[#3b82f6] px-1.5 py-0.5 rounded">{od.internalCode}</span>
            {isHeld && <span className="text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-400 px-1.5 py-0.5 rounded">ON HOLD</span>}
          </div>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            {p.skuCode && <span>{p.skuCode}</span>}
            {p.urbnModelNo && <span> · {p.urbnModelNo}</span>}
            {p.colors && <span> · {p.colors}</span>}
            {p.statusChangedAt && <span> · Approved {fmt(p.statusChangedAt)}</span>}
          </p>
          {od.improvedGoldenSampleExpected && (
            <div className="mt-1.5 rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5">
              <p className="text-[11px] font-medium text-amber-400">⚠ Improvement requirement</p>
              {od.improvementNotes && (
                <p className="text-[11px] text-amber-300/70 mt-0.5 whitespace-pre-wrap">{od.improvementNotes}</p>
              )}
            </div>
          )}
        </div>
        <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
      </div>

      {!isHeld && canOrder && !showOrderForm && (
        <div className="border-t border-[#bfdbfe]/30 px-5 py-3 flex flex-wrap gap-2">
          <button
            onClick={() => setShowOrderForm(true)}
            className="flex items-center gap-1.5 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-2 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition"
          >
            <CheckCircle size={13} /> Place order
          </button>
          <button
            onClick={holdOrder}
            className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition"
          >
            <PauseCircle size={13} /> Hold order
          </button>
          <button
            onClick={dropOrder}
            className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition"
          >
            <Trash2 size={13} /> Drop
          </button>
        </div>
      )}

      {isHeld && canOrder && (
        <div className="border-t border-amber-500/15 bg-amber-500/5 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-amber-400/80">Order on hold{od.decidedBy ? ` · held by ${od.decidedBy}` : ""}</p>
          <div className="flex gap-2">
            <button onClick={reinstateOrder} className="rounded-md border border-[#93c5fd]/40 px-3 py-1.5 text-xs text-[#1d4ed8] hover:bg-[#2563eb]/30">Reinstate</button>
            <button onClick={() => { reinstateOrder(); setTimeout(() => setShowOrderForm(true), 50); }}
              className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20">
              Place order
            </button>
            <button onClick={dropOrder} className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">Drop</button>
          </div>
        </div>
      )}

      {!canOrder && (
        <div className="border-t border-[#bfdbfe]/20 px-5 py-2">
          <p className="text-[11px] text-[#2a4a6a]">Only Sales team and CEO can place or manage orders.</p>
        </div>
      )}

      {showOrderForm && session && (
        <div className="border-t border-[#bfdbfe]/30 px-5 py-3">
          <OrderForm p={p} session={session} onDone={() => setShowOrderForm(false)} />
        </div>
      )}
    </GridBeam>
  );
}

export default function ApprovedPage() {
  const { products, search } = useProducts();
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => { setSession(getSession()); }, []);

  const role = session?.role;
  const canOrder = role === "CEO" || role === "Sales"; // STAFF = Sales

  const q = search.toLowerCase();
  const approvedProducts = products.filter((p) => {
    if (p.status !== "Approved") return false;
    if (p.orderDecision?.state === "dropped" || p.orderDecision?.state === "placed") return false;
    if (!p.orderDecision) return false;
    if (q) return p.codeName.toLowerCase().includes(q) || p.skuCode.toLowerCase().includes(q);
    return true;
  });

  const pending = approvedProducts.filter((p) => p.orderDecision?.state === "pending");
  const held = approvedProducts.filter((p) => p.orderDecision?.state === "held");

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Approved</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">
        Products that have passed NPD testing. Sales team and CEO can place orders before proceeding to Golden Sample.
      </p>

      {approvedProducts.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-[#bfdbfe]/40 px-5 py-16 text-center">
          <p className="text-sm text-[#64748b]">No approved products awaiting order.</p>
          <p className="mt-1 text-xs text-[#94a3b8]">Products appear here after passing Decision Pending.</p>
        </div>
      ) : (
        <>
          {/* Awaiting order */}
          {pending.length > 0 && (
            <div className="mt-6 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#64748b]">Awaiting order decision — {pending.length}</p>
              {pending.map((p) => (
                <ProductCard key={p.id} p={p} session={session} canOrder={canOrder} />
              ))}
            </div>
          )}

          {/* On Hold */}
          {held.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-amber-500/20" />
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-500/70">Orders on hold — {held.length}</p>
                <div className="h-px flex-1 bg-amber-500/20" />
              </div>
              <div className="rounded-md border border-amber-500/15 bg-amber-500/3 p-3 space-y-2">
                {held.map((p) => (
                  <ProductCard key={p.id} p={p} session={session} canOrder={canOrder} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
