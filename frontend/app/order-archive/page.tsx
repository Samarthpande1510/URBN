"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useProducts, ProductRow, ColorOrder } from "@/lib/products-context";
import { PRIORITY_DOT } from "@/lib/colors";
import { Chip } from "@/components/Chip";
import { useToast } from "@/components/Toast";
import { api, apiErrorMessage } from "@/lib/api";
import { CheckCircle, Plus, X, Archive } from "lucide-react";

function fmt(v: string | null) {
  if (!v) return null;
  return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function OrderForm({ p, onDone }: { p: ProductRow; onDone: () => void }) {
  const { addNotification, refreshProducts } = useProducts();
  const { showToast } = useToast();
  const [colors, setColors] = useState<ColorOrder[]>([{ color: "", quantity: 0 }]);

  function addColor() { setColors((c) => [...c, { color: "", quantity: 0 }]); }
  function removeColor(i: number) { setColors((c) => c.filter((_, idx) => idx !== i)); }
  function updateColor(i: number, field: "color" | "quantity", value: string | number) {
    setColors((c) => c.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  const canPlace = colors.length > 0 && colors.every((c) => c.color.trim() && c.quantity > 0);

  async function placeOrder() {
    if (!canPlace) return;
    const od = p.orderDecision!;
    try {
      await api.products.patchOrderDecision(p.id, { state: "placed", internal_code: od.internalCode, colors }, p.version);
      await api.golden.notifyPurchase(p.id, p.version + 1);
      await api.golden.confirmOrder(p.id, p.version + 2);
      await refreshProducts();
      addNotification({ targetRoles: ["CEO", "Dev", "Sales", "QA"], productId: p.id, productName: p.codeName, message: `Order placed for ${p.codeName} (${od.internalCode}) — moving to Golden Sample.` });
      showToast("Order placed — moved to Golden Sample");
      onDone();
    } catch (e: unknown) { const { message, isConflict } = apiErrorMessage(e); if (isConflict) await refreshProducts(); showToast(isConflict ? message : `Error: ${message}`); }
  }

  return (
    <div className="mt-3 rounded-md border border-[#93c5fd]/40 bg-[#eff6ff] px-4 py-4 space-y-3">
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

export default function OrderArchivePage() {
  const { products, refreshProducts } = useProducts();
  const { showToast } = useToast();
  const [orderingId, setOrderingId] = useState<number | null>(null);

  const canOrder = true;

  const dropped = products.filter((p) => p.status === "Approved" && p.orderDecision?.state === "dropped" && !p.orderDecision?.orderArchived);

  async function archiveOrder(id: number) {
    try {
      const p = products.find((x) => x.id === id);
      await api.orders.archiveOrder(id, p?.version);
      await refreshProducts();
      showToast("Order archived");
    } catch (e: unknown) { const { message, isConflict } = apiErrorMessage(e); if (isConflict) await refreshProducts(); showToast(isConflict ? message : `Error: ${message}`); }
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Order Archive</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">
        Approved products whose orders were dropped. Sales and CEO can revive them and place an order at any time.
      </p>

      {dropped.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-[#bfdbfe]/40 px-5 py-16 text-center">
          <p className="text-sm text-[#64748b]">No dropped orders.</p>
          <p className="mt-1 text-xs text-[#94a3b8]">Products appear here when a drop decision is made on the Approved tab.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {dropped.map((p) => {
            const od = p.orderDecision!;
            const isOrdering = orderingId === p.id;
            return (
              <div key={p.id} className="rounded-md border border-[#bfdbfe]/30 bg-[#ffffff] overflow-hidden">
                <div className="flex flex-wrap items-start gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-[#1d4ed8]">{p.codeName}</p>
                      <span className="text-[10px] font-mono bg-[#eff6ff] border border-[#93c5fd]/30 text-[#3b82f6] px-1.5 py-0.5 rounded">{od.internalCode}</span>
                      <span className="text-[10px] bg-red-500/10 border border-red-500/25 text-red-400 px-1.5 py-0.5 rounded">DROPPED</span>
                    </div>
                    <p className="text-xs text-[#94a3b8] mt-0.5">
                      {p.skuCode && <span>{p.skuCode}</span>}
                      {p.colors && <span> · {p.colors}</span>}
                      {od.decidedAt && <span> · Dropped {fmt(od.decidedAt)}</span>}
                      {od.decidedBy && <span> by {od.decidedBy}</span>}
                    </p>
                  </div>
                  <Chip color={PRIORITY_DOT[p.priority]} label={p.priority} />
                </div>

                {canOrder && !isOrdering && (
                  <div className="border-t border-[#bfdbfe]/20 px-5 py-3 flex items-center gap-3">
                    <button
                      onClick={() => setOrderingId(p.id)}
                      className="flex items-center gap-1.5 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-2 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition"
                    >
                      <CheckCircle size={13} /> Place order
                    </button>
                    <button
                      onClick={() => archiveOrder(p.id)}
                      className="flex items-center gap-1.5 rounded-md border border-dashed border-[#94a3b8]/50 px-3 py-2 text-xs text-[#94a3b8] hover:border-red-300/60 hover:text-red-400 transition"
                    >
                      <Archive size={12} /> Archive
                    </button>
                  </div>
                )}

                {isOrdering && (
                  <div className="border-t border-[#bfdbfe]/30 px-5 py-3">
                    <OrderForm p={p} onDone={() => setOrderingId(null)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dropped.length > 0 && (
        <p className="mt-4 text-xs text-[#2a4a6a]">{dropped.length} dropped {dropped.length === 1 ? "order" : "orders"}</p>
      )}
    </AppShell>
  );
}
