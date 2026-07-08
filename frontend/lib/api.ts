const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ConflictError extends Error {
  constructor() {
    super("Someone else just updated this product. Showing the latest state.");
    this.name = "ConflictError";
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const refresh = localStorage.getItem("urbn_refresh_token");
  if (!refresh) return null;
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem("urbn_access_token", data.access_token);
      return data.access_token;
    }
  } catch {
    // network error — can't refresh
  }
  return null;
}

async function apiFetch(path: string, method = "GET", body?: unknown, v?: number) {
  const token = typeof window !== "undefined" ? localStorage.getItem("urbn_access_token") : null;
  const url = v !== undefined ? `${API}${path}?v=${v}` : `${API}${path}`;
  const makeOpts = (tok: string | null): RequestInit => ({
    method,
    headers: {
      "Content-Type": "application/json",
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let res = await fetch(url, makeOpts(token));

  // Token expired — try to refresh once and retry
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(url, makeOpts(newToken));
    } else {
      // Refresh also failed — clear session and redirect to login (only if not already there)
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        localStorage.removeItem("urbn_access_token");
        localStorage.removeItem("urbn_refresh_token");
        localStorage.removeItem("urbn_session");
        window.location.href = "/login";
      }
      throw new Error("Session expired. Please log in again.");
    }
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 409) throw new ConflictError();
  if (!res.ok) throw new Error(data.detail ?? `Request failed (${res.status})`);
  return data;
}

/**
 * Call in every catch block. Returns a user-facing message string.
 * Callers should also call refreshProducts() when this returns a conflict message.
 */
export function apiErrorMessage(e: unknown): { message: string; isConflict: boolean } {
  if (e instanceof ConflictError) return { message: e.message, isConflict: true };
  return { message: e instanceof Error ? e.message : "Something went wrong", isConflict: false };
}

export const api = {
  products: {
    list: () => apiFetch("/products"),
    get: (id: number) => apiFetch(`/products/${id}`),
    create: (data: unknown) => apiFetch("/products", "POST", data),
    update: (id: number, data: unknown, v?: number) => apiFetch(`/products/${id}`, "PATCH", data, v),
    submitNpd: (id: number, data: { outcome: string; notes?: string; file_name?: string; file_url?: string }, v?: number) =>
      apiFetch(`/products/${id}/npd-report`, "POST", data, v),
    submitDecision: (id: number, decision: string, remarks?: string, v?: number) =>
      apiFetch(`/products/${id}/decision`, "POST", { decision, remarks: remarks || undefined }, v),
    createOrderDecision: (id: number, data: unknown, v?: number) =>
      apiFetch(`/products/${id}/order-decision`, "POST", data, v),
    patchOrderDecision: (id: number, data: unknown, v?: number) =>
      apiFetch(`/products/${id}/order-decision`, "PATCH", data, v),
    archiveOrder: (id: number, v?: number) =>
      apiFetch(`/products/${id}/order-decision/archive`, "POST", undefined, v),
    restore: (id: number, v?: number) =>
      apiFetch(`/products/${id}/restore`, "POST", undefined, v),
    archive: (id: number, remarks?: string, v?: number) =>
      apiFetch(`/products/${id}/archive`, "POST", { remarks: remarks || undefined }, v),
    restoreArchived: (id: number, v?: number) =>
      apiFetch(`/products/${id}/restore-archived`, "POST", undefined, v),
    moveToHold: (id: number, remarks?: string, v?: number) =>
      apiFetch(`/products/${id}/move-to-hold`, "POST", { remarks: remarks || undefined }, v),
    rejectFromHold: (id: number, remarks?: string, v?: number) =>
      apiFetch(`/products/${id}/reject-from-hold`, "POST", { remarks: remarks || undefined }, v),
    placeOrderFromHold: (id: number, data: { colors: { color: string; quantity: number }[]; improvement_notes: string; remarks?: string }, v?: number) =>
      apiFetch(`/products/${id}/place-order-from-hold`, "POST", data, v),
    factoryAction: (id: number, action: string, v?: number) =>
      apiFetch(`/products/${id}/factory-comm/action`, "POST", { action }, v),
    factoryExpectedDate: (id: number, expected_reply_date: string, v?: number) =>
      apiFetch(`/products/${id}/factory-comm/expected-date`, "POST", { expected_reply_date }, v),
    factoryLogReply: (id: number, reply_summary: string, reply_notes?: string, v?: number) =>
      apiFetch(`/products/${id}/factory-comm/log-reply`, "POST", { reply_summary, reply_notes: reply_notes || undefined }, v),
    factoryPartialResolved: (id: number, notes?: string, v?: number) =>
      apiFetch(`/products/${id}/factory-comm/partial-resolved`, "POST", { notes: notes || undefined }, v),
    factoryImprovementSample: (id: number, expected_date?: string, v?: number) =>
      apiFetch(`/products/${id}/factory-comm/improvement-sample`, "POST", { expected_date: expected_date || undefined }, v),
    factoryImprovementSampleReceived: (id: number, received_date?: string, v?: number) =>
      apiFetch(`/products/${id}/factory-comm/improvement-sample-received`, "POST", { received_date: received_date || undefined }, v),
    factoryInternalDecision: (id: number, data: { decision: string; notes?: string; improvement_needed?: boolean; improvement_remarks?: string; colors?: { color: string; quantity: number }[] }, v?: number) =>
      apiFetch(`/products/${id}/factory-comm/internal-decision`, "POST", data, v),
    factoryCaseLog: (id: number, stage: string, note: string) =>
      apiFetch(`/products/${id}/factory-comm/case-log`, "POST", { stage, note }),
    factorySendBack: (id: number, expected_reply_date: string, note?: string, v?: number) =>
      apiFetch(`/products/${id}/factory-comm/send-back`, "POST", { expected_reply_date, note: note || undefined }, v),
    factorySendBackNpd: (id: number, note?: string, v?: number) =>
      apiFetch(`/products/${id}/factory-comm/send-back-npd`, "POST", { note: note || undefined }, v),
  },
  golden: {
    get: (productId: number) => apiFetch(`/golden/${productId}`),
    notifyPurchase: (productId: number, v?: number) =>
      apiFetch(`/golden/${productId}/notify-purchase`, "POST", undefined, v),
    confirmOrder: (productId: number, v?: number) =>
      apiFetch(`/golden/${productId}/confirm-order`, "POST", undefined, v),
    saveDetails: (productId: number, data: unknown, v?: number) =>
      apiFetch(`/golden/${productId}/details`, "POST", data, v),
    setComplianceNotNeeded: (productId: number, v?: number) =>
      apiFetch(`/golden/${productId}/compliance-not-needed`, "POST", undefined, v),
    setComplianceNeeded: (productId: number, v?: number) =>
      apiFetch(`/golden/${productId}/compliance-needed`, "POST", undefined, v),
    initiateCompliance: (productId: number, name: string, v?: number) =>
      apiFetch(`/golden/${productId}/compliance/initiate`, "POST", { name }, v),
    dispatchComplianceSample: (productId: number, name: string, expected_delivery_date?: string, v?: number) =>
      apiFetch(`/golden/${productId}/compliance/dispatch`, "POST", { name, expected_delivery_date }, v),
    updateComplianceExpectedDate: (productId: number, name: string, expected_delivery_date: string, v?: number) =>
      apiFetch(`/golden/${productId}/compliance/expected-date`, "PUT", { name, expected_delivery_date }, v),
    markCertReceived: (productId: number, name: string, v?: number) =>
      apiFetch(`/golden/${productId}/compliance/cert-received`, "POST", { name }, v),
    confirmCompliance: (productId: number, name: string, v?: number) =>
      apiFetch(`/golden/${productId}/compliance/confirm`, "POST", { name }, v),
    setPackagingVendor: (productId: number, vendor_name: string, v?: number) =>
      apiFetch(`/golden/${productId}/packaging/vendor`, "POST", { vendor_name }, v),
    dispatchPackagingSample: (productId: number, expected_delivery_date?: string, v?: number) =>
      apiFetch(`/golden/${productId}/packaging/dispatch`, "POST", { expected_delivery_date }, v),
    updatePackagingExpectedDate: (productId: number, expected_delivery_date: string, v?: number) =>
      apiFetch(`/golden/${productId}/packaging/expected-date`, "PUT", { expected_delivery_date }, v),
    setPackagingStatus: (productId: number, sample_status: string, v?: number) =>
      apiFetch(`/golden/${productId}/packaging/status`, "POST", { sample_status }, v),
    decidePackaging: (productId: number, decision: string, improvement_notes?: string, v?: number) =>
      apiFetch(`/golden/${productId}/packaging/decide`, "POST", { decision, improvement_notes }, v),
    kldAcknowledge: (productId: number, v?: number) =>
      apiFetch(`/golden/${productId}/packaging/kld-acknowledged`, "POST", undefined, v),
    kldEmail: (productId: number, v?: number) =>
      apiFetch(`/golden/${productId}/packaging/kld-emailed`, "POST", undefined, v),
    requestGoldenSample: (productId: number, expected_date?: string, v?: number) =>
      apiFetch(`/golden/${productId}/golden-sample/request`, "POST", { expected_date }, v),
    updateGoldenSampleExpectedDate: (productId: number, expected_date: string, v?: number) =>
      apiFetch(`/golden/${productId}/golden-sample/expected-date`, "PUT", { expected_date }, v),
    markGoldenSampleReceived: (productId: number, v?: number) =>
      apiFetch(`/golden/${productId}/golden-sample/received`, "POST", undefined, v),
    archiveGoldenSample: (productId: number, v?: number) =>
      apiFetch(`/golden/${productId}/archive/golden-sample`, "POST", undefined, v),
    archiveCompliance: (productId: number, v?: number) =>
      apiFetch(`/golden/${productId}/archive/compliance`, "POST", undefined, v),
    archivePackaging: (productId: number, v?: number) =>
      apiFetch(`/golden/${productId}/archive/packaging`, "POST", undefined, v),
  },
  orders: {
    archiveOrder: (productId: number, v?: number) =>
      apiFetch(`/products/${productId}/order-decision/archive`, "POST", undefined, v),
  },
  notifications: {
    list: () => apiFetch("/notifications"),
    dismiss: (id: number) => apiFetch(`/notifications/${id}/dismiss`, "POST"),
  },
};
