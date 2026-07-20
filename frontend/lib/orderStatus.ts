import type { ProductRow } from "./products-context";
import { STATUS_DOT } from "./colors";

// Approving a product only sets Product.status = "Approved" — the Hold/Drop
// actions on Order Confirmation only change orderDecision.state, leaving the
// underlying product status untouched. This computes what the "Current
// Status" chip should actually display so Hold/Drop show up everywhere
// (dashboard, hidden, NPD testing, etc.), not just as a stage pill.
export function getDisplayStatusLabel(p: ProductRow): string {
  if (p.status === "Approved") {
    if (p.orderDecision?.state === "held") return "Order On Hold";
    if (p.orderDecision?.state === "dropped") return "Order Dropped";
  }
  return p.status;
}

export function getDisplayStatusColor(p: ProductRow): string {
  if (p.status === "Approved") {
    if (p.orderDecision?.state === "held") return "#f59e0b";   // amber-500
    if (p.orderDecision?.state === "dropped") return "#ef4444"; // red-500
  }
  return STATUS_DOT[p.status];
}
