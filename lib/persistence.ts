import crypto from "node:crypto";
import type {
  ConfirmedBookingSummary,
  ConsultationBookingMetadata,
} from "@/lib/consultation";

export type PersistedBookingRow = ConfirmedBookingSummary & {
  paymentStatus?: "PENDING" | "PAID" | "FAILED" | "ABANDONED";
  bookingStatus?: "PENDING" | "PROCESSING" | "CONFIRMED" | "MANUAL_FOLLOWUP";
  emailSentAt?: string | null;
};

export type AuditLogInput = {
  reference: string;
  eventType:
    | "PAYMENT_INITIATED"
    | "PAYSTACK_VERIFIED"
    | "PAYSTACK_VERIFY_FAILED"
    | "WEBHOOK_RECEIVED"
    | "BOOKING_CONFIRMED"
    | "BOOKING_MANUAL_FOLLOWUP"
    | "EMAIL_SENT"
    | "EMAIL_FAILED";
  source?: "server_action" | "paystack_webhook" | "contact_page";
  amountKobo?: number;
  currency?: string;
  status: string;
  message?: string;
  payload?: unknown;
};

// Local in-memory L1 cache & fallback when CPANEL_DB_API_URL is not configured yet
const localProcessedBookings = new Map<string, ConfirmedBookingSummary>();

function getBridgeConfig(): {
  url: string;
  secret: string;
  configured: boolean;
} {
  const url = process.env.CPANEL_DB_API_URL?.trim() || "";
  const secret = process.env.CPANEL_DB_API_SECRET?.trim() || "";
  return {
    url,
    secret,
    configured: Boolean(url && secret),
  };
}

export function isPersistenceConfigured(): boolean {
  return getBridgeConfig().configured;
}

async function callCpanelBridge<T extends Record<string, unknown>>(
  payload: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { url, secret, configured } = getBridgeConfig();
  if (!configured) {
    return {
      ok: false,
      error: "CPANEL_DB_API_URL or CPANEL_DB_API_SECRET is not configured.",
    };
  }

  const rawBody = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Bridge-Signature": signature,
        "Content-Type": "application/json",
      },
      body: rawBody,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    const json = (await response.json().catch(() => null)) as
      | (T & { ok?: boolean; error?: string })
      | null;

    if (!response.ok || !json || json.ok === false) {
      const errorMsg =
        json?.error || `cPanel DB bridge returned HTTP ${response.status}`;
      console.error(
        `[persistence] Bridge call (${String(payload.action)}) failed:`,
        errorMsg,
      );
      return { ok: false, error: errorMsg };
    }

    return { ok: true, data: json };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown network error";
    console.error(
      `[persistence] Network error calling cPanel DB bridge (${String(payload.action)}):`,
      message,
    );
    return { ok: false, error: message };
  }
}

function toConfirmedSummary(row: PersistedBookingRow): ConfirmedBookingSummary {
  return {
    reference: row.reference,
    bookingUid: row.bookingUid,
    slotStart: row.slotStart,
    durationMinutes: row.durationMinutes,
    timeZone: row.timeZone,
    name: row.name,
    email: row.email,
    organisation: row.organisation,
    notes: row.notes,
    formattedAmount: row.formattedAmount,
    meetingUrl: row.meetingUrl || undefined,
    isPreview: Boolean(row.isPreview),
  };
}

/**
 * 1. Record PENDING consultation booking when Paystack payment is initialized.
 * Best-effort (never blocks checkout if cPanel is momentarily unreachable).
 */
export async function persistConsultationInitiated(params: {
  reference: string;
  booking: ConsultationBookingMetadata;
  formattedAmount: string;
  isPreview: boolean;
}): Promise<boolean> {
  if (!isPersistenceConfigured()) {
    return false;
  }

  const res = await callCpanelBridge({
    action: "record_consultation_initiated",
    reference: params.reference,
    booking: params.booking,
    formattedAmount: params.formattedAmount,
    isPreview: params.isPreview,
    source: "server_action",
  });

  return res.ok;
}

/**
 * 2. Check if a consultation booking has already been fulfilled (in-memory or on cPanel).
 */
export async function getPersistedConsultationBooking(
  reference: string,
): Promise<ConfirmedBookingSummary | undefined> {
  const cached = localProcessedBookings.get(reference);
  if (cached) {
    return cached;
  }

  if (!isPersistenceConfigured()) {
    return undefined;
  }

  const res = await callCpanelBridge<{ booking?: PersistedBookingRow | null }>({
    action: "get_consultation_booking",
    reference,
  });

  if (!res.ok || !res.data.booking) {
    return undefined;
  }

  const row = res.data.booking;
  const isFulfilled =
    (row.bookingStatus === "CONFIRMED" ||
      row.bookingStatus === "MANUAL_FOLLOWUP") &&
    Boolean(row.bookingUid);

  if (!isFulfilled) {
    return undefined;
  }

  const summary = toConfirmedSummary(row);
  localProcessedBookings.set(reference, summary);
  return summary;
}

/**
 * 3. Atomically upsert verified Paystack payment details & claim fulfilment lock
 * so concurrent browser redirect + Paystack webhook do not double-book Cal.com.
 */
export async function claimConsultationForFulfilment(params: {
  reference: string;
  booking: ConsultationBookingMetadata;
  formattedAmount: string;
  isPreview: boolean;
  source: "server_action" | "paystack_webhook";
  paystackTransactionId?: string;
  paystackCustomerCode?: string;
  paymentChannel?: string;
  paidAt?: string;
  paystackRawResponse?: unknown;
}): Promise<{
  persistedRemotely: boolean;
  alreadyFulfilled: boolean;
  existingSummary?: ConfirmedBookingSummary;
}> {
  const localExisting = localProcessedBookings.get(params.reference);
  if (localExisting) {
    return {
      persistedRemotely: true,
      alreadyFulfilled: true,
      existingSummary: localExisting,
    };
  }

  if (!isPersistenceConfigured()) {
    return {
      persistedRemotely: false,
      alreadyFulfilled: false,
    };
  }

  const res = await callCpanelBridge<{
    alreadyFulfilled?: boolean;
    booking?: PersistedBookingRow;
  }>({
    action: "claim_consultation_for_fulfilment",
    reference: params.reference,
    booking: params.booking,
    formattedAmount: params.formattedAmount,
    isPreview: params.isPreview,
    source: params.source,
    paystackTransactionId: params.paystackTransactionId,
    paystackCustomerCode: params.paystackCustomerCode,
    paymentChannel: params.paymentChannel,
    paidAt: params.paidAt,
    paystackRawResponse: params.paystackRawResponse,
  });

  if (!res.ok) {
    return {
      persistedRemotely: false,
      alreadyFulfilled: false,
    };
  }

  if (res.data.alreadyFulfilled && res.data.booking) {
    const summary = toConfirmedSummary(res.data.booking);
    localProcessedBookings.set(params.reference, summary);
    return {
      persistedRemotely: true,
      alreadyFulfilled: true,
      existingSummary: summary,
    };
  }

  return {
    persistedRemotely: true,
    alreadyFulfilled: false,
  };
}

/**
 * 4. Finalize the consultation booking record after Cal.com + Resend emails.
 */
export async function persistConsultationCompleted(params: {
  reference: string;
  summary: ConfirmedBookingSummary;
  bookingStatus: "CONFIRMED" | "MANUAL_FOLLOWUP";
  amountKobo: number;
  currency: string;
  emailSent: boolean;
  source: "server_action" | "paystack_webhook";
  message?: string;
}): Promise<boolean> {
  localProcessedBookings.set(params.reference, params.summary);

  if (!isPersistenceConfigured()) {
    return false;
  }

  const res = await callCpanelBridge({
    action: "record_consultation_completed",
    reference: params.reference,
    bookingUid: params.summary.bookingUid,
    meetingUrl: params.summary.meetingUrl,
    bookingStatus: params.bookingStatus,
    amountKobo: params.amountKobo,
    currency: params.currency,
    emailSent: params.emailSent,
    source: params.source,
    message: params.message,
  });

  return res.ok;
}

/**
 * 5. Append an audit event to `payment_audit_logs` on cPanel.
 */
export async function persistPaymentAuditLog(
  entry: AuditLogInput,
): Promise<boolean> {
  if (!isPersistenceConfigured()) {
    return false;
  }

  const res = await callCpanelBridge({
    action: "record_audit_log",
    ...entry,
  });

  return res.ok;
}

/**
 * 6. Persist general contact enquiry from `/contact` form.
 */
export async function persistContactEnquiry(params: {
  name: string;
  email: string;
  organisation: string;
  message: string;
  receivedAt: string;
  emailDeliveryStatus: "SENT" | "SKIPPED_DEV" | "FAILED";
  emailErrorDetail?: string;
}): Promise<boolean> {
  if (!isPersistenceConfigured()) {
    return false;
  }

  const res = await callCpanelBridge({
    action: "record_contact_enquiry",
    ...params,
  });

  return res.ok;
}
