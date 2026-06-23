"use client";

import { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from "react";
import type { Role } from "./auth";

export type Status = "Pending NPD" | "Pending Decision" | "Approved" | "On hold" | "Rejected";
export type Priority = "Low" | "Medium" | "High" | "Urgent";
export type FactoryAction = "EMAIL_FACTORY" | "DROP" | null;

export interface ActivityEntry {
  action: string;
  timestamp: string;
  note?: string;
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
    markings: string;
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
  skuCode: string;
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
  npdReport?: NpdReport;
  factoryComm?: FactoryComm;
  approvedWorkflow?: ApprovedWorkflow;
  goldenWorkflow?: GoldenWorkflow;
  activityLog: ActivityEntry[];
}

export interface NewProductInput {
  productName: string;
  factory: string;
  factorySku: string;
  priorityLabel: string;
  specifications: string;
  sampleReceived: boolean;
  sampleGivenDate: string;
  deadline: string;
  imageName: string | null;
  imageDataUrl: string | null;
}

const initialProducts: ProductRow[] = [
  {
    id: 1, codeName: "Aria Knit Tee", skuCode: "FAC-2291", priority: "High",
    status: "Approved", deadline: "2026-07-12", statusChangedAt: "2026-06-10T09:00:00",
    activityLog: [
      { action: "Product added", timestamp: "2026-06-01T08:00:00" },
      { action: "NPD report submitted — Pass", timestamp: "2026-06-08T10:30:00" },
      { action: "CEO approved", timestamp: "2026-06-10T09:00:00" },
    ],
    npdReport: { fileName: "aria-npd.pdf", fileDataUrl: null, outcome: "Pass", notes: "All specs met.", submittedAt: "2026-06-08T10:30:00" },
    goldenWorkflow: {
      purchaseNotifiedAt: "2026-06-10T10:00:00",
      orderConfirmedAt: "2026-06-11T09:30:00",
      purchaseLog: [
        { action: "Purchase team notified", timestamp: "2026-06-10T10:00:00" },
        { action: "Order confirmed by purchase team", timestamp: "2026-06-11T09:30:00" },
      ],
      details: { productName: "Aria Knit Tee", skuCode: "URB-KT-001", colour: "Slate Blue", markings: "Embossed logo, EU rating label", savedAt: "2026-06-11T11:00:00" },
      compliance: { status: "Under review", expectedDate: "2026-07-01", confirmedAt: null, log: [{ action: "Compliance review started", timestamp: "2026-06-11T11:00:00" }] },
      packaging: { vendorName: "PackCo Ltd", vendorSetAt: "2026-06-11T11:00:00", sampleIdReceived: "PKG-0091", sampleReceivedAt: "2026-06-15T10:00:00", keyLineDrawingAt: null, keyLineDrawingImageUrl: null, keyLineDrawingApprovedAt: null, keyLineDrawingRejectedAt: null, artworkStartedAt: null, artworkImageUrl: null, artworkApprovedAt: null, artworkRejectedAt: null, releasedAt: null, log: [{ action: "Vendor assigned: PackCo Ltd", timestamp: "2026-06-11T11:00:00" }, { action: "Packaging sample received — PKG-0091", timestamp: "2026-06-15T10:00:00" }] },
      goldenSample: { status: "Requested", expectedDate: "2026-07-05", receivedAt: null, log: [{ action: "Golden sample requested", timestamp: "2026-06-11T11:00:00" }] },
    },
  },
  {
    id: 2, codeName: "Coastal Linen Shirt", skuCode: "FAC-2305", priority: "Medium",
    status: "On hold", deadline: "2026-07-18", statusChangedAt: "2026-06-20T10:15:00",
    activityLog: [
      { action: "Product added", timestamp: "2026-06-05T09:00:00" },
      { action: "NPD report submitted — Pass", timestamp: "2026-06-12T11:00:00" },
      { action: "CEO put on hold", timestamp: "2026-06-20T10:15:00" },
      { action: "Factory emailed", timestamp: "2026-06-20T10:15:00" },
      { action: "Dev team acknowledged", timestamp: "2026-06-20T14:02:00" },
    ],
    npdReport: { fileName: "coastal-npd.pdf", fileDataUrl: null, outcome: "Pass", notes: "Minor stitching issue flagged.", submittedAt: "2026-06-12T11:00:00" },
    factoryComm: {
      decidedAction: "EMAIL_FACTORY",
      decidedAt: "2026-06-20T10:15:00",
      acknowledgedAt: "2026-06-20T14:02:00",
      replyAt: null, replyText: null, tentativeReturnDate: null,
      editHistory: [],
    },
  },
  {
    id: 3, codeName: "Drift Denim Jacket", skuCode: "FAC-2310", priority: "High",
    status: "Rejected", deadline: "2026-06-30", statusChangedAt: "2026-06-05T14:30:00",
    activityLog: [
      { action: "Product added", timestamp: "2026-06-01T10:00:00" },
      { action: "NPD report submitted — Not Pass", timestamp: "2026-06-05T14:30:00", note: "Structural failure in seam test." },
      { action: "Archived — failed NPD", timestamp: "2026-06-05T14:30:00" },
    ],
    npdReport: { fileName: "drift-npd.pdf", fileDataUrl: null, outcome: "Not Pass", notes: "Structural failure in seam test.", submittedAt: "2026-06-05T14:30:00" },
  },
  {
    id: 4, codeName: "Haven Wool Coat", skuCode: "FAC-2318", priority: "Low",
    status: "Approved", deadline: "2026-08-02", statusChangedAt: "2026-06-12T11:00:00",
    goldenWorkflow: { purchaseNotifiedAt: "2026-06-12T12:00:00", orderConfirmedAt: null, purchaseLog: [{ action: "Purchase team notified", timestamp: "2026-06-12T12:00:00" }], details: null, compliance: null, packaging: null, goldenSample: null },
    activityLog: [
      { action: "Product added", timestamp: "2026-06-03T09:00:00" },
      { action: "NPD report submitted — Pass", timestamp: "2026-06-10T09:00:00" },
      { action: "CEO approved", timestamp: "2026-06-12T11:00:00" },
    ],
    npdReport: { fileName: "haven-npd.pdf", fileDataUrl: null, outcome: "Pass", notes: "Excellent quality.", submittedAt: "2026-06-10T09:00:00" },
  },
  {
    id: 5, codeName: "Nomad Cargo Pant", skuCode: "FAC-2322", priority: "Medium",
    status: "On hold", deadline: "2026-07-25", statusChangedAt: "2026-06-15T09:30:00",
    activityLog: [
      { action: "Product added", timestamp: "2026-06-05T12:00:00" },
      { action: "NPD report submitted — Pass", timestamp: "2026-06-13T10:00:00" },
      { action: "CEO put on hold", timestamp: "2026-06-15T09:30:00" },
      { action: "Factory emailed", timestamp: "2026-06-15T09:30:00" },
      { action: "Dev team acknowledged", timestamp: "2026-06-15T11:05:00" },
      { action: "Factory reply logged", timestamp: "2026-06-19T16:40:00", note: "Stitching defect fixed, re-sampling now." },
    ],
    npdReport: { fileName: "nomad-npd.pdf", fileDataUrl: null, outcome: "Pass", notes: "Pass with minor concern on stitching.", submittedAt: "2026-06-13T10:00:00" },
    factoryComm: {
      decidedAction: "EMAIL_FACTORY",
      decidedAt: "2026-06-15T09:30:00",
      acknowledgedAt: "2026-06-15T11:05:00",
      replyAt: "2026-06-19T16:40:00",
      replyText: "Stitching defect fixed, re-sampling now.",
      tentativeReturnDate: "2026-07-08",
      editHistory: [],
    },
  },
  {
    id: 6, codeName: "Solace Silk Scarf", skuCode: "FAC-2329", priority: "Low",
    status: "Approved", deadline: "2026-08-10", statusChangedAt: "2026-06-18T08:45:00",
    goldenWorkflow: { purchaseNotifiedAt: null, orderConfirmedAt: null, purchaseLog: [], details: null, compliance: null, packaging: null, goldenSample: null },
    activityLog: [
      { action: "Product added", timestamp: "2026-06-07T09:00:00" },
      { action: "NPD report submitted — Pass", timestamp: "2026-06-15T14:00:00" },
      { action: "CEO approved", timestamp: "2026-06-18T08:45:00" },
    ],
    npdReport: { fileName: "solace-npd.pdf", fileDataUrl: null, outcome: "Pass", notes: "Premium finish, all checks clear.", submittedAt: "2026-06-15T14:00:00" },
  },
  {
    id: 7, codeName: "Ember Suede Boot", skuCode: "FAC-2334", priority: "High",
    status: "Rejected", deadline: "2026-07-05", statusChangedAt: "2026-06-08T16:20:00",
    activityLog: [
      { action: "Product added", timestamp: "2026-06-02T11:00:00" },
      { action: "NPD report submitted — Not Pass", timestamp: "2026-06-08T16:20:00", note: "Sole adhesion failure." },
      { action: "Archived — failed NPD", timestamp: "2026-06-08T16:20:00" },
    ],
    npdReport: { fileName: "ember-npd.pdf", fileDataUrl: null, outcome: "Not Pass", notes: "Sole adhesion failure.", submittedAt: "2026-06-08T16:20:00" },
  },
  {
    id: 8, codeName: "Lune Knit Dress", skuCode: "FAC-2341", priority: "High",
    status: "Pending Decision", deadline: "2026-08-15", statusChangedAt: "2026-06-21T09:00:00",
    activityLog: [
      { action: "Product added", timestamp: "2026-06-10T09:00:00" },
      { action: "NPD report submitted — Pass", timestamp: "2026-06-21T09:00:00", note: "All criteria met, ready for CEO review." },
    ],
    npdReport: { fileName: "lune-npd.pdf", fileDataUrl: null, outcome: "Pass", notes: "All criteria met, ready for CEO review.", submittedAt: "2026-06-21T09:00:00" },
  },
  {
    id: 9, codeName: "Dusk Linen Trouser", skuCode: "FAC-2349", priority: "Medium",
    status: "Pending NPD", deadline: "2026-09-01", statusChangedAt: "2026-06-22T10:00:00",
    activityLog: [
      { action: "Product added", timestamp: "2026-06-22T10:00:00" },
    ],
  },
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
}

interface ProductsContextValue {
  products: ProductRow[];
  setProducts: Dispatch<SetStateAction<ProductRow[]>>;
  addProduct: (input: NewProductInput) => void;
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, "id" | "createdAt">) => void;
  dismissNotification: (id: string) => void;
  search: string;
  setSearch: (q: string) => void;
}

const ProductsContext = createContext<ProductsContextValue | null>(null);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([
    { id: "seed-8", targetRoles: ["CEO", "Dev"], productId: 8, productName: "Lune Knit Dress", message: "NPD report passed — awaiting CEO decision.", createdAt: "2026-06-21T09:00:00" },
  ]);

  function addNotification(n: Omit<AppNotification, "id" | "createdAt">) {
    setNotifications((prev) => [{ ...n, id: `${n.productId}-${Date.now()}`, createdAt: new Date().toISOString() }, ...prev]);
  }

  function dismissNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
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
          activityLog: [{ action: "Product added", timestamp: now }],
        },
      ];
    });
  }

  return (
    <ProductsContext.Provider value={{ products, setProducts, addProduct, notifications, addNotification, dismissNotification, search, setSearch }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error("useProducts must be used within a ProductsProvider");
  return ctx;
}
