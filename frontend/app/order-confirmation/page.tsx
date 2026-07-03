"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ApprovedBody, type ApprovedView } from "@/components/order/ApprovedBody";
import { OnHoldBody } from "@/components/order/OnHoldBody";
import { RejectedBody } from "@/components/order/RejectedBody";

type LeftFilter = "Orders Pending" | "Orders Placed" | "Orders On Hold";
type RightFilter = "Approved" | "Hold" | "Rejected";

const LEFT_FILTERS: { key: LeftFilter; view: ApprovedView }[] = [
  { key: "Orders Pending", view: "pending" },
  { key: "Orders Placed", view: "placed" },
  { key: "Orders On Hold", view: "held" },
];

const RIGHT_FILTERS: RightFilter[] = ["Approved", "Hold", "Rejected"];

export default function OrderConfirmationPage() {
  const [active, setActive] = useState<{ side: "left" | "right"; key: LeftFilter | RightFilter }>({ side: "left", key: "Orders Pending" });

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-slate-900">Order Confirmation</h1>
      <p className="mt-1 text-sm text-[#1d4ed8]">
        Update the order status of each product approved, or manage factory hold and rejection flows.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {/* Left filter group — order lifecycle on Accepted products */}
        <div className="flex flex-wrap gap-2">
          {LEFT_FILTERS.map(({ key }) => (
            <button
              key={key}
              onClick={() => setActive({ side: "left", key })}
              className={`rounded border px-4 py-1.5 text-sm transition ${
                active.side === "left" && active.key === key
                  ? "border-blue-600 bg-blue-600 text-white font-medium shadow-sm"
                  : "border-blue-100 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-200"
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="hidden h-8 w-px bg-[#bfdbfe]/60 sm:block" />

        {/* Right filter group — original Approved / Hold / Rejected flows */}
        <div className="flex flex-wrap gap-2">
          {RIGHT_FILTERS.map((key) => (
            <button
              key={key}
              onClick={() => setActive({ side: "right", key })}
              className={`rounded border px-4 py-1.5 text-sm transition ${
                active.side === "right" && active.key === key
                  ? key === "Rejected"
                    ? "border-red-500 bg-red-500 text-white font-medium shadow-sm"
                    : key === "Hold"
                    ? "border-amber-500 bg-amber-500 text-white font-medium shadow-sm"
                    : "border-blue-600 bg-blue-600 text-white font-medium shadow-sm"
                  : "border-blue-100 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-200"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {active.side === "left" && (
        <ApprovedBody view={LEFT_FILTERS.find((f) => f.key === active.key)!.view} />
      )}
      {active.side === "right" && active.key === "Approved" && <ApprovedBody view="all" />}
      {active.side === "right" && active.key === "Hold" && <OnHoldBody />}
      {active.side === "right" && active.key === "Rejected" && <RejectedBody />}
    </AppShell>
  );
}
