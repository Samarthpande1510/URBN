"use client";

import { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from "react";
import type { Role } from "./auth";

export type Status = "Pending NPD" | "Pending Decision" | "Approved" | "On hold" | "Rejected" | "Archived";

export interface RejectionComment {
  by: string;
  reason: string;
  timestamp: string;
}
export type Priority = "Low" | "Medium" | "High" | "Urgent";
export type FactoryAction = "EMAIL_FACTORY" | "DROP" | null;

export interface ColorOrder {
  color: string;
  quantity: number;
}

export interface OrderDecision {
  state: "pending" | "held" | "dropped" | "placed";
  internalCode: string;
  decidedAt: string | null;
  decidedBy: string | null;
  colors: ColorOrder[];
  improvedGoldenSampleExpected?: boolean;
  improvementNotes?: string;
}

export interface ActivityEntry {
  action: string;
  timestamp: string;
  note?: string;
  stages?: string[]; // Excel-style pipeline stage labels for this transition
}

export interface FactoryComm {
  decidedAction: FactoryAction;
  decidedAt: string | null;
  acknowledgedAt: string | null;
  replyAt: string | null;
  replyText: string | null;
  tentativeReturnDate: string | null;
  editHistory: { editedAt: string; previousReply: string | null; previousDate: string | null }[];
}

export interface ApprovedWorkflow {
  purchaseNotifiedAt: string | null;
  orderConfirmedAt: string | null;
  qaName: string;
  qaSkuCode: string;
  qaColour: string;
  qaMarkings: string;
  goldenSampleStatus: "Not started" | "Requested" | "In progress" | "Received";
  goldenSampleExpectedDate: string;
}

export type GoldenSampleStatus = "Not started" | "Requested" | "In progress" | "Received";

export interface GoldenWorkflow {
  // Stage 1 — purchase
  purchaseNotifiedAt: string | null;
  orderConfirmedAt: string | null;
  purchaseLog: ActivityEntry[];

  // Stage 2 — product details (unlocked after order confirmed)
  details: {
    productName: string;
    skuCode: string;
    colour: string;
    logoMarking: string;
    ratingLabel: string;
    bomConfirmedAt: string | null;
    savedAt: string;
  } | null;

  // Stage 3 — three parallel tracks (unlocked after details saved)
  compliance: {
    status: string;
    expectedDate: string;
    confirmedAt: string | null;
    log: ActivityEntry[];
  } | null;

  packaging: {
    vendorName: string;
    vendorSetAt: string | null;
    expectedDate: string | null;
    sampleIdReceived: string;
    sampleReceivedAt: string | null;
    keyLineDrawingAt: string | null;
    keyLineDrawingImageUrl: string | null;
    keyLineDrawingApprovedAt: string | null;
    keyLineDrawingRejectedAt: string | null;
    artworkStartedAt: string | null;
    artworkImageUrl: string | null;
    artworkApprovedAt: string | null;
    artworkRejectedAt: string | null;
    releasedAt: string | null;
    log: ActivityEntry[];
  } | null;

  goldenSample: {
    status: GoldenSampleStatus;
    expectedDate: string;
    receivedAt: string | null;
    log: ActivityEntry[];
  } | null;
  improvedGoldenSampleExpected?: boolean;
}

export interface NpdReport {
  fileName: string | null;
  fileDataUrl: string | null;
  outcome: "Pass" | "Not Pass";
  notes: string;
  submittedAt: string;
}

export interface ProductRow {
  id: number;
  codeName: string;
  skuCode: string;           // Supplier / factory model number
  urbnModelNo?: string;      // URBN internal model number — assigned at Golden Product stage
  colors?: string;
  priority: Priority;
  status: Status;
  deadline: string;
  factory?: string;
  specifications?: string;
  sampleReceived?: boolean;
  sampleGivenDate?: string;
  imageName?: string | null;
  imageDataUrl?: string | null;
  statusChangedAt?: string;
  rejectedBy?: string;
  rejectionComments?: RejectionComment[];
  npdReport?: NpdReport;
  factoryComm?: FactoryComm;
  approvedWorkflow?: ApprovedWorkflow;
  orderDecision?: OrderDecision;
  goldenWorkflow?: GoldenWorkflow;
  activityLog: ActivityEntry[];
}

export interface NewProductInput {
  productName: string;
  factory: string;
  factorySku: string;
  colors: string;
  priorityLabel: string;
  specifications: string;
  sampleReceived: boolean;
  sampleGivenDate: string;
  deadline: string;
  imageName: string | null;
  imageDataUrl: string | null;
}

const initialProducts: ProductRow[] = [
  { id: 1,  codeName: "SMPL-001", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "Medium", status: "Pending NPD", deadline: "2026-09-21", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-23T09:00:00" }] },
  { id: 2,  codeName: "SMPL-002", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "Medium", status: "Pending NPD", deadline: "2026-09-21", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-23T09:00:00" }] },
  { id: 3,  codeName: "SMPL-003", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "Medium", status: "Pending NPD", deadline: "2026-09-21", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-23T09:00:00" }] },
  { id: 4,  codeName: "SMPL-004", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "High",   status: "Pending NPD", deadline: "2026-08-21", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-22T09:00:00" }] },
  { id: 5,  codeName: "SMPL-005", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "High",   status: "Pending NPD", deadline: "2026-08-18", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-19T09:00:00" }] },
  { id: 6,  codeName: "SMPL-006", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "Medium", status: "Pending NPD", deadline: "2026-08-18", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-19T09:00:00" }] },
  { id: 7,  codeName: "SMPL-007", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "Urgent", status: "Pending NPD", deadline: "2026-07-19", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-05-20T09:00:00" }] },
  { id: 8,  codeName: "SMPL-008", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "Urgent", status: "Pending NPD", deadline: "2026-07-19", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-05-20T09:00:00" }] },
  { id: 9,  codeName: "SMPL-009", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "High",   status: "Pending NPD", deadline: "2026-07-19", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-05-20T09:00:00" }] },
  { id: 10, codeName: "SMPL-010", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "High",   status: "Pending NPD", deadline: "2026-07-18", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-05-19T09:00:00" }] },
  { id: 11, codeName: "SMPL-011", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "High",   status: "Pending NPD", deadline: "2026-08-16", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-17T09:00:00" }] },
  { id: 12, codeName: "SMPL-012", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "Medium", status: "Pending NPD", deadline: "2026-08-05", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-06T09:00:00" }] },
  { id: 13, codeName: "SMPL-013", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "Medium", status: "Pending NPD", deadline: "2026-08-15", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-16T09:00:00" }] },
  { id: 14, codeName: "SMPL-014", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "Medium", status: "Pending NPD", deadline: "2026-08-15", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-16T09:00:00" }] },
  { id: 15, codeName: "SMPL-015", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "High",   status: "Pending NPD", deadline: "2026-08-19", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-20T09:00:00" }] },
  { id: 16, codeName: "SMPL-016", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "Medium", status: "Pending NPD", deadline: "2026-08-21", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-22T09:00:00" }] },
  { id: 17, codeName: "SMPL-017", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "High",   status: "Pending NPD", deadline: "2026-08-05", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-06T09:00:00" }] },
  { id: 18, codeName: "SMPL-018", skuCode: "", urbnModelNo: undefined, colors: undefined, priority: "High",   status: "Pending NPD", deadline: "2026-08-04", imageDataUrl: "/app-bg2.png", activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: "2026-06-05T09:00:00" }] },
];

function mapPriority(label: string): Priority {
  if (label === "Urgent") return "Urgent";
  if (label.startsWith("P1")) return "High";
  if (label.startsWith("P2")) return "Medium";
  if (label.startsWith("P3")) return "Low";
  return "Low";
}

export interface AppNotification {
  id: string;
  targetRoles: Role[];
  productId: number;
  productName: string;
  message: string;
  createdAt: string;
  read: boolean;
}

interface ProductsContextValue {
  products: ProductRow[];
  setProducts: Dispatch<SetStateAction<ProductRow[]>>;
  addProduct: (input: NewProductInput) => void;
  deleteProduct: (id: number) => void;
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, "id" | "createdAt" | "read">) => void;
  dismissNotification: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (role: Role) => void;
  search: string;
  setSearch: (q: string) => void;
}

const ProductsContext = createContext<ProductsContextValue | null>(null);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  function addNotification(n: Omit<AppNotification, "id" | "createdAt" | "read">) {
    setNotifications((prev) => [{ ...n, id: `${n.productId}-${Date.now()}`, createdAt: new Date().toISOString(), read: false }, ...prev]);
  }

  function dismissNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function markNotificationRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  function markAllNotificationsRead(role: Role) {
    setNotifications((prev) => prev.map((n) => n.targetRoles.includes(role) ? { ...n, read: true } : n));
  }

  function deleteProduct(id: number) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setNotifications((prev) => prev.filter((n) => n.productId !== id));
  }

  function addProduct(input: NewProductInput) {
    setProducts((prev) => {
      const nextId = prev.length ? Math.max(...prev.map((p) => p.id)) + 1 : 1;
      const now = new Date().toISOString();
      return [
        ...prev,
        {
          id: nextId,
          codeName: input.productName,
          skuCode: input.factorySku,
          colors: input.colors || undefined,
          priority: mapPriority(input.priorityLabel),
          status: "Pending NPD",
          deadline: input.deadline,
          factory: input.factory,
          specifications: input.specifications,
          sampleReceived: input.sampleReceived,
          sampleGivenDate: input.sampleGivenDate || undefined,
          imageName: input.imageName,
          imageDataUrl: input.imageDataUrl,
          statusChangedAt: now,
          activityLog: [{ action: "Product added", stages: ["NPD TESTING: PENDING"], timestamp: now }],
        },
      ];
    });
  }

  return (
    <ProductsContext.Provider value={{ products, setProducts, addProduct, deleteProduct, notifications, addNotification, dismissNotification, markNotificationRead, markAllNotificationsRead, search, setSearch }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error("useProducts must be used within a ProductsProvider");
  return ctx;
}
