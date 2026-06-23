import { Status, Priority } from "./products-context";

export const STATUS_DOT: Record<Status, string> = {
  "Pending NPD": "#7a6fbf",
  "Pending Decision": "#4a9aba",
  Approved: "#4a7c3f",
  "On hold": "#b8860b",
  Rejected: "#a14a3d",
};

export const PRIORITY_DOT: Record<Priority, string> = {
  Urgent: "#ff2d55",
  High: "#e05050",
  Medium: "#e8a020",
  Low: "#60a8d0",
};
