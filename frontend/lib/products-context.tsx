"use client";

import { createContext, useContext, useState, useEffect, ReactNode, Dispatch, SetStateAction, useCallback } from "react";
import type { Role } from "./auth";
import { api } from "./api";

export type Status = "Pending NPD" | "Pending Decision" | "Approved" | "On hold" | "Rejected" | "Archived" | "Removed";

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
  remarks?: string;
  orderArchived?: boolean;
}

export interface ActivityEntry {
  action: string;
  timestamp: string;
  note?: string;
  stages?: string[];
}

export type HoldStatus =
  | "Feedback Shared"
  | "Factory Replied (Product on hold)"
  | "Factory Replied (Awaiting Sample)"
  | "Factory Replied (Product Rejected)"
  | "Factory Replied (Pending Points)";

export type FactoryReplySummary = "Fully Accepted" | "Decision Pending" | "Partially Rejected";
export type InternalDecision = "Approved" | "Rejected" | "Order Placed";

export interface HoldCaseEntry {
  stage: string;
  note?: string;
  timestamp: string;
}

export interface FactoryComm {
  decidedAction: FactoryAction;
  decidedAt: string | null;
  acknowledgedAt: string | null;
  replyAt: string | null;
  replyText: string | null;
  tentativeReturnDate: string | null;
  editHistory: { editedAt: string; previousReply: string | null; previousDate: string | null }[];
  sentObservations?: string;
  holdStatusLog?: { status: HoldStatus; timestamp: string }[];
  factorySampleReceived?: boolean;
  factorySampleDate?: string | null;
  expectedReplyDate?: string | null;
  replyReceivedAt?: string | null;
  replySummary?: FactoryReplySummary | null;
  replyNotes?: string | null;
  partialResolvedAt?: string | null;
  internalDecision?: InternalDecision | null;
  internalDecisionAt?: string | null;
  internalDecisionBy?: string | null;
  internalDecisionNotes?: string | null;
  caseLog?: HoldCaseEntry[];
  reminderSentForDate?: string | null;
  improvementSampleExpected?: boolean;
  improvementSampleReceivedAt?: string | null;
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

export type ComplianceCertName = "BIS" | "WPC" | "MFI (Apple)" | "QI";

export interface ComplianceTrack {
  name: ComplianceCertName;
  initiatedAt: string;
  sampleDispatchedAt: string | null;
  expectedDeliveryDate: string;
  status: string;
  certReceivedAt?: string | null;
  confirmedAt: string | null;
  log: ActivityEntry[];
}

export interface GoldenWorkflow {
  purchaseNotifiedAt: string | null;
  orderConfirmedAt: string | null;
  purchaseLog: ActivityEntry[];

  details: {
    productName: string;
    skuCode: string;
    colourConfirmedAt: string | null;
    logoMarkingConfirmedAt: string | null;
    ratingLabelConfirmedAt: string | null;
    bomConfirmedAt: string | null;
    savedAt: string;
  } | null;

  compliance: {
    tracks: ComplianceTrack[];
  } | null;

  complianceArchived?: boolean;

  packaging: {
    vendorName: string;
    vendorSetAt: string | null;
    sampleVersion: number;
    sampleDispatchedAt: string | null;
    sampleStatus: "Awaiting" | "Received" | null;
    sampleReceivedAt?: string | null;
    expectedDeliveryDate: string;
    decision: "Approved" | "Improvement Required" | null;
    decisionAt: string | null;
    improvementNotes: string | null;
    kldAcknowledgedAt: string | null;
    kldEmailedToDesignerAt: string | null;
    log: ActivityEntry[];
  } | null;

  goldenSample: {
    status: GoldenSampleStatus;
    requestedAt?: string | null;
    expectedDate: string;
    receivedAt: string | null;
    approvedAt: string | null;
    improvementFixed: boolean | null;
    improvementFixedAt: string | null;
    improvementFixedNotes: string | null;
    log: ActivityEntry[];
  } | null;
  improvedGoldenSampleExpected?: boolean;
  goldenSampleArchived?: boolean;
  complianceNotNeeded?: boolean;
  packagingArchived?: boolean;
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
  version: number;
  codeName: string;
  skuCode: string;
  urbnModelNo?: string;
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
  sampleVersion?: number;
  verdictRemarks?: string;
  rejectedBy?: string;
  archiveRemarks?: string;
  rejectionComments?: RejectionComment[];
  npdReport?: NpdReport;
  npdReports?: Array<{ version: number } & NpdReport>;
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

function mapPriority(label: string): Priority {
  if (label === "Urgent") return "Urgent";
  if (label === "High" || label.startsWith("P1")) return "High";
  if (label === "Medium" || label.startsWith("P2")) return "Medium";
  if (label === "Low" || label.startsWith("P3")) return "Low";
  return "Medium";
}

export function mapProductFromApi(raw: Record<string, unknown>): ProductRow {
  const od = raw.order_decision as Record<string, unknown> | null;
  const gw = raw.golden_workflow as Record<string, unknown> | null;
  const npd = raw.npd_report as Record<string, unknown> | null;
  const fc = raw.factory_comm as Record<string, unknown> | null;
  const colorsRaw = raw.colors;
  const colorsStr = Array.isArray(colorsRaw) ? colorsRaw.join(", ") : typeof colorsRaw === "string" ? colorsRaw : undefined;

  return {
    id: raw.id as number,
    version: (raw.version as number) ?? 1,
    codeName: raw.code_name as string,
    skuCode: raw.sku_code as string,
    urbnModelNo: raw.urbn_model_no as string | undefined,
    colors: colorsStr,
    priority: (raw.priority as Priority) ?? "Medium",
    status: (raw.status as Status) ?? "Pending NPD",
    deadline: raw.deadline as string,
    factory: raw.factory as string | undefined,
    specifications: raw.specifications as string | undefined,
    sampleReceived: (raw.sample_received as boolean) ?? false,
    sampleGivenDate: raw.sample_given_date as string | undefined,
    imageDataUrl: (raw.image_url as string | null) ?? null,
    statusChangedAt: raw.status_changed_at as string | undefined,
    sampleVersion: (raw.sample_version as number | undefined) ?? 1,
    verdictRemarks: raw.verdict_remarks as string | undefined,
    rejectedBy: raw.rejected_by as string | undefined,
    archiveRemarks: raw.archive_remarks as string | undefined,
    factoryComm: fc ? {
      decidedAction: fc.decided_action as FactoryAction,
      decidedAt: fc.decided_at as string | null,
      acknowledgedAt: fc.acknowledged_at as string | null,
      replyAt: fc.reply_at as string | null,
      replyText: fc.reply_text as string | null,
      tentativeReturnDate: fc.tentative_return_date as string | null,
      editHistory: [],
      expectedReplyDate: fc.expected_reply_date as string | null,
      replyReceivedAt: fc.reply_received_at as string | null,
      replySummary: fc.reply_summary as FactoryReplySummary | null,
      replyNotes: fc.reply_notes as string | null,
      partialResolvedAt: fc.partial_resolved_at as string | null,
      internalDecision: fc.internal_decision as InternalDecision | null,
      internalDecisionAt: fc.internal_decision_at as string | null,
      internalDecisionBy: fc.internal_decision_by as string | null,
      internalDecisionNotes: fc.internal_decision_notes as string | null,
      improvementSampleExpected: (fc.improvement_sample_expected as boolean) ?? false,
      improvementSampleReceivedAt: fc.improvement_sample_received_at as string | null,
      caseLog: (fc.case_log as HoldCaseEntry[]) ?? [],
    } : undefined,
    npdReport: npd ? {
      fileName: (npd.file_name as string | null) ?? null,
      fileDataUrl: (npd.file_url as string | null) ?? null,
      outcome: npd.outcome as "Pass" | "Not Pass",
      notes: (npd.notes as string) ?? "",
      submittedAt: npd.submitted_at as string,
    } : undefined,
    orderDecision: od ? {
      state: od.state as "pending" | "held" | "dropped" | "placed",
      internalCode: (od.internal_code as string) ?? "",
      decidedAt: od.decided_at as string | null,
      decidedBy: od.decided_by_name as string | null,
      colors: Array.isArray(od.colors) ? (od.colors as ColorOrder[]) : [],
      improvementNotes: od.improvement_notes as string | undefined,
      remarks: od.remarks as string | undefined,
      orderArchived: (od.order_archived as boolean) ?? false,
    } : undefined,
    goldenWorkflow: gw ? {
      purchaseNotifiedAt: gw.purchase_notified_at as string | null,
      orderConfirmedAt: gw.order_confirmed_at as string | null,
      purchaseLog: [],
      complianceNotNeeded: (gw.compliance_not_needed as boolean) ?? false,
      goldenSampleArchived: (gw.golden_sample_archived as boolean) ?? false,
      complianceArchived: (gw.compliance_archived as boolean) ?? false,
      packagingArchived: (gw.packaging_archived as boolean) ?? false,
      details: gw.details_saved ? {
        productName: "",
        skuCode: "",
        colourConfirmedAt: gw.colour_confirmed ? (gw.details_saved_at as string ?? "yes") : null,
        logoMarkingConfirmedAt: gw.logo_marking_confirmed ? (gw.details_saved_at as string ?? "yes") : null,
        ratingLabelConfirmedAt: gw.rating_label_confirmed ? (gw.details_saved_at as string ?? "yes") : null,
        bomConfirmedAt: gw.bom_confirmed ? (gw.details_saved_at as string ?? "yes") : null,
        savedAt: (gw.details_saved_at as string) ?? "",
      } : null,
      compliance: Array.isArray(gw.compliance_tracks) && (gw.compliance_tracks as unknown[]).length > 0 ? {
        tracks: (gw.compliance_tracks as { confirmed_at: string | null }[]).map((t) => ({
          name: "" as ComplianceCertName,
          initiatedAt: "",
          sampleDispatchedAt: null,
          expectedDeliveryDate: "",
          certReceivedAt: null,
          confirmedAt: t.confirmed_at,
          status: "",
          log: [],
        })),
      } : null,
      packaging: gw.packaging_initiated ? {
        vendorName: "",
        vendorSetAt: null,
        sampleVersion: (gw.packaging_sample_version as number) ?? 1,
        sampleDispatchedAt: null,
        sampleReceivedAt: (gw.packaging_sample_received_at as string | null) ?? null,
        sampleStatus: null,
        expectedDeliveryDate: "",
        decision: (gw.packaging_decision as "Approved" | "Improvement Required" | null) ?? null,
        decisionAt: (gw.packaging_decision_at as string | null) ?? null,
        improvementNotes: null,
        kldAcknowledgedAt: (gw.packaging_kld_acknowledged_at as string | null) ?? null,
        kldEmailedToDesignerAt: (gw.packaging_kld_emailed_at as string | null) ?? null,
        log: [],
      } : null,
      goldenSample: gw.golden_sample_status ? {
        status: gw.golden_sample_status as GoldenSampleStatus,
        requestedAt: (gw.golden_sample_requested_at as string | null) ?? null,
        expectedDate: (gw.golden_sample_expected_date as string) ?? "",
        receivedAt: (gw.golden_sample_received_at as string | null) ?? null,
        approvedAt: null,
        improvementFixed: null,
        improvementFixedAt: null,
        improvementFixedNotes: null,
        log: [],
      } : null,
    } : undefined,
    activityLog: [],
  };
}

export function mapGoldenFromApi(data: Record<string, unknown>): GoldenWorkflow {
  const workflow = data.workflow as Record<string, unknown>;
  const details = data.details as Record<string, unknown> | null;
  const compliance = data.compliance as Record<string, unknown>[];
  const packaging = data.packaging as Record<string, unknown> | null;
  const golden_sample = data.golden_sample as Record<string, unknown> | null;

  return {
    purchaseNotifiedAt: workflow.purchase_notified_at as string | null,
    orderConfirmedAt: workflow.order_confirmed_at as string | null,
    purchaseLog: [],
    complianceNotNeeded: (workflow.compliance_not_needed as boolean) ?? false,
    goldenSampleArchived: (workflow.golden_sample_archived as boolean) ?? false,
    complianceArchived: (workflow.compliance_archived as boolean) ?? false,
    details: details ? {
      productName: (details.product_name as string) ?? "",
      skuCode: (details.sku_code as string) ?? "",
      colourConfirmedAt: details.colour_confirmed ? (details.saved_at as string) : null,
      logoMarkingConfirmedAt: details.logo_marking_confirmed ? (details.saved_at as string) : null,
      ratingLabelConfirmedAt: details.rating_label_confirmed ? (details.saved_at as string) : null,
      bomConfirmedAt: details.bom_confirmed ? (details.saved_at as string) : null,
      savedAt: details.saved_at as string,
    } : null,
    compliance: compliance && compliance.length > 0 ? {
      tracks: compliance.map((t) => ({
        name: t.name as ComplianceCertName,
        initiatedAt: t.initiated_at as string,
        sampleDispatchedAt: (t.sample_dispatched_at as string | null) ?? null,
        expectedDeliveryDate: (t.expected_delivery_date as string) ?? "",
        status: t.confirmed_at ? "Confirmed" : t.cert_received_at ? "Received" : t.sample_dispatched_at ? "Dispatched" : "Initiated",
        certReceivedAt: (t.cert_received_at as string | null) ?? null,
        confirmedAt: (t.confirmed_at as string | null) ?? null,
        log: [],
      })),
    } : null,
    packaging: packaging ? {
      vendorName: (packaging.vendor_name as string) ?? "",
      vendorSetAt: (packaging.vendor_set_at as string | null) ?? null,
      sampleVersion: (packaging.sample_version as number) ?? 1,
      sampleDispatchedAt: (packaging.sample_dispatched_at as string | null) ?? null,
      sampleReceivedAt: (packaging.sample_received_at as string | null) ?? null,
      sampleStatus: (packaging.sample_status as "Awaiting" | "Received" | null) ?? null,
      expectedDeliveryDate: (packaging.expected_delivery_date as string) ?? "",
      decision: (packaging.decision as "Approved" | "Improvement Required" | null) ?? null,
      decisionAt: (packaging.decision_at as string | null) ?? null,
      improvementNotes: (packaging.improvement_notes as string | null) ?? null,
      kldAcknowledgedAt: (packaging.kld_acknowledged_at as string | null) ?? null,
      kldEmailedToDesignerAt: (packaging.kld_emailed_to_designer_at as string | null) ?? null,
      log: [],
    } : null,
    goldenSample: golden_sample ? {
      status: (golden_sample.status as GoldenSampleStatus) ?? "Not started",
      requestedAt: (golden_sample.requested_at as string | null) ?? null,
      expectedDate: (golden_sample.expected_date as string) ?? "",
      receivedAt: (golden_sample.received_at as string | null) ?? null,
      approvedAt: null,
      improvementFixed: null,
      improvementFixedAt: null,
      improvementFixedNotes: null,
      log: [],
    } : null,
  };
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
  addProduct: (input: NewProductInput) => Promise<void>;
  deleteProduct: (id: number) => void;
  refreshProducts: () => Promise<void>;
  refreshGolden: (productId: number) => Promise<void>;
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, "id" | "createdAt" | "read">) => void;
  dismissNotification: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (role: Role) => void;
  refreshNotifications: () => Promise<void>;
  search: string;
  setSearch: (q: string) => void;
}

const ProductsContext = createContext<ProductsContextValue | null>(null);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refreshProducts = useCallback(async () => {
    try {
      const data = await api.products.list();
      setProducts((prev) => {
        const fresh = (data as Record<string, unknown>[]).map(mapProductFromApi);
        // Preserve golden workflow sub-data (details/compliance/packaging) fetched via refreshGolden
        // /products now includes goldenSample status directly, so don't need to preserve that
        return fresh.map((np) => {
          const existing = prev.find((ep) => ep.id === np.id);
          if (existing?.goldenWorkflow && np.goldenWorkflow) {
            return {
              ...np,
              goldenWorkflow: {
                ...np.goldenWorkflow,
                // Prefer full cached data (from refreshGolden) over minimal /products data
                details: existing.goldenWorkflow.details ?? np.goldenWorkflow.details,
                compliance: existing.goldenWorkflow.compliance ?? np.goldenWorkflow.compliance,
                packaging: existing.goldenWorkflow.packaging ?? np.goldenWorkflow.packaging,
                // Use fresh goldenSample from /products if available, else keep cached
                goldenSample: np.goldenWorkflow.goldenSample ?? existing.goldenWorkflow.goldenSample,
              },
            };
          }
          return np;
        });
      });
    } catch {
      // silently fail — user might not be logged in yet
    }
  }, []);

  const refreshGolden = useCallback(async (productId: number) => {
    try {
      const data = await api.golden.get(productId);
      const gw = mapGoldenFromApi(data as Record<string, unknown>);
      setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, goldenWorkflow: gw } : p));
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    refreshProducts();
  }, [refreshProducts]);

  // Keep all open windows in sync — silent background poll every 20s (only when logged in)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const { getSession } = require("@/lib/auth");
    if (!getSession()) return;
    const id = setInterval(() => { refreshProducts(); refreshNotifications(); }, 20_000);
    return () => clearInterval(id);
  }, [refreshProducts]);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await api.notifications.list();
      setNotifications((data as Record<string, unknown>[]).map((n) => ({
        id: String(n.id),
        targetRoles: (n.target_roles as Role[]),
        productId: n.product_id as number,
        productName: n.product_name as string,
        message: n.message as string,
        createdAt: n.created_at as string,
        read: false, // read state managed in NotificationBell via localStorage
      })));
    } catch {
      // not logged in yet
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  function addNotification(_n: Omit<AppNotification, "id" | "createdAt" | "read">) {
    // Backend handles persistence — just refresh from DB
    refreshNotifications();
  }

  function dismissNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    api.notifications.dismiss(Number(id)).catch(() => {});
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

  async function addProduct(input: NewProductInput) {
    const colors = input.colors ? input.colors.split(",").map((c) => c.trim()).filter(Boolean) : [];
    await api.products.create({
      code_name: input.productName,
      sku_code: input.factorySku,
      factory: input.factory,
      priority: mapPriority(input.priorityLabel),
      deadline: input.deadline || undefined,
      specifications: input.specifications || undefined,
      sample_received: input.sampleReceived,
      sample_given_date: input.sampleGivenDate || undefined,
      colors: colors.length > 0 ? colors : undefined,
      image_url: input.imageDataUrl || undefined,
    });
    await refreshProducts();
  }

  return (
    <ProductsContext.Provider value={{
      products, setProducts, addProduct, deleteProduct,
      refreshProducts, refreshGolden,
      notifications, addNotification, dismissNotification, markNotificationRead, markAllNotificationsRead, refreshNotifications,
      search, setSearch,
    }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error("useProducts must be used within a ProductsProvider");
  return ctx;
}
