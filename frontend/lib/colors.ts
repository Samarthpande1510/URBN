import { Status, Priority } from "./products-context";

export const STATUS_DOT: Record<Status, string> = {
  "Pending NPD":     "#6366f1", // indigo — neutral/waiting
  "Pending Decision":"#38bdf8", // sky blue — needs action
  Approved:          "#22c55e", // emerald green — success
  "On hold":         "#f59e0b", // amber — caution
  Rejected:          "#ef4444", // clean red — stopped
};

export const PRIORITY_DOT: Record<Priority, string> = {
  Urgent: "#f43f5e", // rose-500 — alarm
  High:   "#f97316", // orange-500 — elevated
  Medium: "#eab308", // yellow-500 — moderate
  Low:    "#94a3b8", // slate-400 — passive
};
