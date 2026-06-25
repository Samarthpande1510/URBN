import { Status, Priority } from "./products-context";

export const STATUS_DOT: Record<Status, string> = {
  "Pending NPD":     "#93c5fd",  // blue-300  — waiting/idle
  "Pending Decision":"#3b82f6",  // blue-500  — needs action
  Approved:          "#1d4ed8",  // blue-700  — approved/active
  "On hold":         "#a5b4fc",  // indigo-300 — paused
  Rejected:          "#94a3b8",  // slate-400  — inactive
  Archived:          "#cbd5e1",  // slate-300  — closed
};

export const PRIORITY_DOT: Record<Priority, string> = {
  Urgent: "#1e3a8a", // blue-900 — most critical
  High:   "#3b82f6", // blue-500 — elevated
  Medium: "#93c5fd", // blue-300 — moderate
  Low:    "#dbeafe", // blue-100 — passive
};
