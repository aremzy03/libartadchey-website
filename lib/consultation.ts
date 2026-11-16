import crypto from "node:crypto";

const CALCOM_API_BASE = "https://api.cal.com/v2";
const PAYSTACK_API_BASE = "https://api.paystack.co";

export type ConsultationConfig = {
  feeKobo: number;
  currency: string;
  formattedFee: string;
  durationMinutes: number;
  defaultTimeZone: string;
  calcomConfigured: boolean;
  paystackConfigured: boolean;
  paystackPublicKey: string;
};

export type ConsultationBookingMetadata = {
  slotStart: string;
  timeZone: string;
  name: string;
  email: string;
  organisation: string;
  notes: string;
  durationMinutes: number;
  feeKobo: number;
  currency: string;
};

export type AvailableSlotsResult = {
  slotsByDate: Record<string, string[]>;
  source: "calcom" | "preview";
  error?: string;
};

export type ConfirmedBookingSummary = {
  reference: string;
  bookingUid: string;
  slotStart: string;
  durationMinutes: number;
  timeZone: string;
  name: string;
  email: string;
  organisation: string;
  notes: string;
  formattedAmount: string;
  meetingUrl?: string;
  isPreview: boolean;
};

// In-memory store to make booking completion idempotent within the server process
// and to support local preview transactions when PAYSTACK_SECRET_KEY is not yet set.
const processedReferences = new Map<string, ConfirmedBookingSummary>();
const previewPendingTransactions = new Map<
  string,
  ConsultationBookingMetadata
>();
let cachedDiscoveredEventTypeId: string | null = null;

async function resolveCalcomEventTypeId(): Promise<string> {
  const configuredId =
    process.env.CALCOM_EVENT_TYPE_ID?.trim() ||
    process.env.NEXT_PUBLIC_CALCOM_EVENT_TYPE_ID?.trim() ||
    "";
  if (configuredId) {
    return configuredId;
  }

  if (cachedDiscoveredEventTypeId) {
    return cachedDiscoveredEventTypeId;
  }

  const apiKey = process.env.CALCOM_API_KEY?.trim() || "";
  if (!apiKey) {
    return "";
  }

  try {
    const response = await fetch(`${CALCOM_API_BASE}/event-types`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "cal-api-version": "2024-06-14",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return "";
    }

    const json = (await response.json()) as {
      data?:
        | Array<{ id?: number; slug?: string; title?: string; hidden?: boolean }>
        | {
            eventTypeGroups?: Array<{
              eventTypes?: Array<{
                id?: number;
                slug?: string;
                title?: string;
                hidden?: boolean;
              }>;
            }>;
          };
    };

    const raw = json.data;
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.eventTypeGroups)
        ? raw.eventTypeGroups.flatMap((g) => g.eventTypes ?? [])
        : [];

    const visible = list.filter((item) => item && !item.hidden && item.id);
    const preferred =
      visible.find(
        (item) =>
          item.slug?.toLowerCase().includes("consult") ||
          item.title?.toLowerCase().includes("consult"),
      ) ?? visible[0];

    if (preferred?.id) {
      cachedDiscoveredEventTypeId = String(preferred.id);
      return cachedDiscoveredEventTypeId;
    }
  } catch {
    // Ignore auto-discovery failure and fall back gracefully
  }

  return "";
}

export function formatConsultationFee(
  feeKobo: number,
  currency: string,
): string {
  const majorUnits = feeKobo / 100;
  try {
    return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: majorUnits % 1 === 0 ? 0 : 2,
    }).format(majorUnits);
  } catch {
    return `${currency} ${majorUnits.toLocaleString()}`;
  }
}

export function getConsultationConfig(): ConsultationConfig {
  const rawFee = Number(process.env.CONSULTATION_FEE_KOBO);
  const feeKobo = Number.isFinite(rawFee) && rawFee > 0 ? rawFee : 5_000_000; // Default: ₦50,000 (5,000,000 kobo)
  const currency = (process.env.CONSULTATION_CURRENCY?.trim() || "NGN").toUpperCase();
  const rawDuration = Number(process.env.CONSULTATION_DURATION_MINUTES);
  const durationMinutes =
    Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 45;

  const calcomEventTypeId =
    process.env.CALCOM_EVENT_TYPE_ID?.trim() ||
    process.env.NEXT_PUBLIC_CALCOM_EVENT_TYPE_ID?.trim() ||
    "";
  const calcomUsername = process.env.CALCOM_USERNAME?.trim() || "";
  const calcomEventSlug = process.env.CALCOM_EVENT_SLUG?.trim() || "";
  const calcomApiKey = process.env.CALCOM_API_KEY?.trim() || "";

  const calcomConfigured = Boolean(
    calcomEventTypeId || (calcomUsername && calcomEventSlug) || calcomApiKey,
  );
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || "";
  const paystackPublicKey =
    process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim() || "";

  return {
    feeKobo,
    currency,
    formattedFee: formatConsultationFee(feeKobo, currency),
    durationMinutes,
    defaultTimeZone: "Africa/Lagos",
    calcomConfigured,
    paystackConfigured: Boolean(paystackSecretKey),
    paystackPublicKey,
  };
}

export function formatSlotDateTime(
  slotIso: string,
  timeZone = "Africa/Lagos",
): {
  dateLabel: string;
  timeLabel: string;
  shortDateLabel: string;
  timeZoneLabel: string;
} {
  const date = new Date(slotIso);
  if (Number.isNaN(date.getTime())) {
    return {
      dateLabel: slotIso,
      timeLabel: "",
      shortDateLabel: slotIso,
      timeZoneLabel: timeZone,
    };
  }

  try {
    const dateLabel = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    }).format(date);

    const shortDateLabel = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }).format(date);

    const timeLabel = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }).format(date);

    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short",
      timeZone,
    }).formatToParts(date);
    const timeZoneLabel =
      tzParts.find((part) => part.type === "timeZoneName")?.value || timeZone;

    return { dateLabel, timeLabel, shortDateLabel, timeZoneLabel };
  } catch {
    return {
      dateLabel: date.toUTCString(),
      timeLabel: date.toISOString().slice(11, 16),
      shortDateLabel: date.toISOString().slice(0, 10),
      timeZoneLabel: "UTC",
    };
  }
}

function generatePreviewSlots(
  startDateIso: string,
  endDateIso: string,
): Record<string, string[]> {
  const slotsByDate: Record<string, string[]> = {};
  const start = new Date(startDateIso);
  const end = new Date(endDateIso);
  const now = new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return slotsByDate;
  }

  // Generate weekday slots in WAT (UTC+1): 09:00, 10:30, 13:00, 15:00 UTC -> 10:00, 11:30, 14:00, 16:00 WAT
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const endDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
  );

  const utcHours = [
    { hour: 9, minute: 0 },
    { hour: 10, minute: 30 },
    { hour: 13, minute: 0 },
    { hour: 15, minute: 0 },
  ];

  while (cursor <= endDay) {
    const dayOfWeek = cursor.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dateKey = cursor.toISOString().slice(0, 10);
      const daySlots: string[] = [];

      for (const { hour, minute } of utcHours) {
        const slotDate = new Date(
          Date.UTC(
            cursor.getUTCFullYear(),
            cursor.getUTCMonth(),
            cursor.getUTCDate(),
            hour,
            minute,
            0,
          ),
        );
        // Only include slots at least 2 hours in the future
        if (slotDate.getTime() > now.getTime() + 2 * 60 * 60 * 1000) {
          daySlots.push(slotDate.toISOString());
        }
      }

      if (daySlots.length > 0) {
        slotsByDate[dateKey] = daySlots;
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return slotsByDate;
}

export async function fetchCalcomAvailableSlots(params: {
  startDate: string;
  endDate: string;
  timeZone: string;
}): Promise<AvailableSlotsResult> {
  const eventTypeId = await resolveCalcomEventTypeId();
  const username = process.env.CALCOM_USERNAME?.trim() || "";
  const eventSlug = process.env.CALCOM_EVENT_SLUG?.trim() || "";
  const apiKey = process.env.CALCOM_API_KEY?.trim() || "";

  if (!eventTypeId && !(username && eventSlug)) {
    return {
      slotsByDate: generatePreviewSlots(params.startDate, params.endDate),
      source: "preview",
    };
  }

  const searchParams = new URLSearchParams({
    startTime: params.startDate,
    endTime: params.endDate,
    timeZone: params.timeZone || "Africa/Lagos",
  });

  if (eventTypeId) {
    searchParams.set("eventTypeId", eventTypeId);
  } else {
    searchParams.set("usernameList", username);
    searchParams.set("eventTypeSlug", eventSlug);
  }

  const headers: Record<string, string> = {
    "cal-api-version": "2024-08-13",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(
      `${CALCOM_API_BASE}/slots/available?${searchParams.toString()}`,
      {
        method: "GET",
        headers,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error("[consultation] Cal.com slots error:", response.status, detail);
      return {
        slotsByDate: {},
        source: "calcom",
        error: "Unable to load live availability right now. Please try again shortly.",
      };
    }

    const json = (await response.json()) as {
      status?: string;
      data?:
        | { slots?: Record<string, Array<{ time?: string; start?: string }>> }
        | Record<string, Array<{ time?: string; start?: string }>>;
    };

    const rawData = json.data ?? {};
    const rawSlots =
      "slots" in rawData && rawData.slots && typeof rawData.slots === "object"
        ? (rawData.slots as Record<string, Array<{ time?: string; start?: string }>>)
        : (rawData as Record<string, Array<{ time?: string; start?: string }>>);

    const slotsByDate: Record<string, string[]> = {};
    for (const [dateKey, list] of Object.entries(rawSlots)) {
      if (!Array.isArray(list)) continue;
      const times = list
        .map((item) => item.start || item.time || "")
        .filter(Boolean);
      if (times.length > 0) {
        slotsByDate[dateKey] = times;
      }
    }

    return {
      slotsByDate,
      source: "calcom",
    };
  } catch (error) {
    console.error("[consultation] Unexpected Cal.com slots error:", error);
    return {
      slotsByDate: {},
      source: "calcom",
      error: "Could not reach the scheduling service. Please check your connection or try again.",
    };
  }
}

export async function initializePaystackPayment(params: {
  booking: ConsultationBookingMetadata;
  callbackUrl: string;
}): Promise<
  | {
      ok: true;
      authorizationUrl: string;
      reference: string;
      isPreview: boolean;
    }
  | { ok: false; error: string }
> {
  const { booking, callbackUrl } = params;
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || "";
  const reference = `lc_consult_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  if (!secretKey) {
    // Local preview fallback when PAYSTACK_SECRET_KEY is not set yet
    previewPendingTransactions.set(reference, booking);
    const encoded = Buffer.from(JSON.stringify(booking), "utf8").toString(
      "base64url",
    );
    const separator = callbackUrl.includes("?") ? "&" : "?";
    return {
      ok: true,
      authorizationUrl: `${callbackUrl}${separator}reference=${encodeURIComponent(reference)}&preview_token=${encodeURIComponent(encoded)}`,
      reference,
      isPreview: true,
    };
  }

  const slotFormatted = formatSlotDateTime(booking.slotStart, booking.timeZone);

  try {
    const response = await fetch(`${PAYSTACK_API_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: booking.email,
        amount: booking.feeKobo,
        currency: booking.currency,
        reference,
        callback_url: callbackUrl,
        metadata: {
          consultationBooking: booking,
          custom_fields: [
            {
              display_name: "Client Name",
              variable_name: "client_name",
              value: booking.name,
            },
            {
              display_name: "Organisation",
              variable_name: "organisation",
              value: booking.organisation,
            },
            {
              display_name: "Preferred Slot",
              variable_name: "preferred_slot",
              value: `${slotFormatted.dateLabel} at ${slotFormatted.timeLabel} (${slotFormatted.timeZoneLabel})`,
            },
          ],
        },
      }),
    });

    const json = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        authorization_url?: string;
        access_code?: string;
        reference?: string;
      };
    };

    if (!response.ok || !json.status || !json.data?.authorization_url) {
      console.error("[consultation] Paystack initialize failed:", json);
      return {
        ok: false,
        error:
          json.message ||
          "Could not initialize payment with Paystack. Please try again.",
      };
    }

    return {
      ok: true,
      authorizationUrl: json.data.authorization_url,
      reference: json.data.reference || reference,
      isPreview: false,
    };
  } catch (error) {
    console.error("[consultation] Paystack initialize network error:", error);
    return {
      ok: false,
      error: "Payment service is temporarily unreachable. Please try again.",
    };
  }
}

export async function createCalcomBooking(
  booking: ConsultationBookingMetadata,
  reference: string,
): Promise<
  | { ok: true; bookingUid: string; meetingUrl?: string; isPreview: boolean }
  | { ok: false; error: string }
> {
  const apiKey = process.env.CALCOM_API_KEY?.trim() || "";
  const eventTypeId = await resolveCalcomEventTypeId();
  const username = process.env.CALCOM_USERNAME?.trim() || "";
  const eventSlug = process.env.CALCOM_EVENT_SLUG?.trim() || "";

  if (!apiKey || (!eventTypeId && !(username && eventSlug))) {
    const previewUid = `cal_preview_${reference.slice(-8)}`;
    console.info(
      "[consultation] Cal.com booking recorded in preview mode (CALCOM_API_KEY / CALCOM_EVENT_TYPE_ID not set):",
      { previewUid, reference, booking },
    );
    return {
      ok: true,
      bookingUid: previewUid,
      isPreview: true,
    };
  }

  const body: Record<string, unknown> = {
    start: booking.slotStart,
    attendee: {
      name: booking.name,
      email: booking.email,
      timeZone: booking.timeZone || "Africa/Lagos",
      language: "en",
    },
    metadata: {
      organisation: booking.organisation,
      notes: booking.notes,
      paystackReference: reference,
      amountPaid: formatConsultationFee(booking.feeKobo, booking.currency),
    },
  };

  if (eventTypeId && Number.isFinite(Number(eventTypeId))) {
    body.eventTypeId = Number(eventTypeId);
  } else {
    body.username = username;
    body.eventTypeSlug = eventSlug;
  }

  try {
    const response = await fetch(`${CALCOM_API_BASE}/bookings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "cal-api-version": "2024-08-13",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await response.json()) as {
      status?: string;
      error?: { message?: string };
      data?: {
        uid?: string;
        meetingUrl?: string;
        location?: string;
      };
    };

    if (!response.ok || json.status === "error" || !json.data?.uid) {
      console.error("[consultation] Cal.com booking creation failed:", json);
      return {
        ok: false,
        error:
          json.error?.message ||
          "Payment succeeded, but automatic calendar confirmation encountered an issue. Our team will confirm your slot manually.",
      };
    }

    const meetingUrl =
      json.data.meetingUrl ||
      (typeof json.data.location === "string" &&
      json.data.location.startsWith("http")
        ? json.data.location
        : undefined);

    return {
      ok: true,
      bookingUid: json.data.uid,
      meetingUrl,
      isPreview: false,
    };
  } catch (error) {
    console.error("[consultation] Cal.com booking error:", error);
    return {
      ok: false,
      error:
        "Payment was received, but we could not reach Cal.com to finalize the calendar invite automatically.",
    };
  }
}

export type VerifiedPaystackTransaction = {
  ok: true;
  booking: ConsultationBookingMetadata;
  isPreview: boolean;
  paystackTransactionId?: string;
  paystackCustomerCode?: string;
  paymentChannel?: string;
  paidAt?: string;
  paystackRawResponse?: unknown;
};

export async function verifyPaystackAndGetBooking(
  reference: string,
  previewToken?: string,
): Promise<VerifiedPaystackTransaction | { ok: false; error: string }> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || "";

  if (!secretKey && reference.startsWith("lc_consult_")) {
    const cached = previewPendingTransactions.get(reference);
    if (cached) {
      return { ok: true, booking: cached, isPreview: true };
    }
    if (previewToken) {
      try {
        const decoded = JSON.parse(
          Buffer.from(previewToken, "base64url").toString("utf8"),
        ) as ConsultationBookingMetadata;
        if (decoded && decoded.slotStart && decoded.email) {
          return { ok: true, booking: decoded, isPreview: true };
        }
      } catch {
        // Ignore malformed token
      }
    }
    return {
      ok: false,
      error: "Preview booking session expired. Please select a slot and try again.",
    };
  }

  if (!secretKey) {
    return {
      ok: false,
      error: "Paystack secret key is not configured on the server.",
    };
  }

  try {
    const response = await fetch(
      `${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
        cache: "no-store",
      },
    );

    const json = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        id?: number | string;
        status?: string;
        amount?: number;
        currency?: string;
        channel?: string;
        paid_at?: string;
        customer?: {
          customer_code?: string;
        };
        metadata?: {
          consultationBooking?: ConsultationBookingMetadata;
        };
      };
    };

    if (!response.ok || !json.status || !json.data) {
      return {
        ok: false,
        error: json.message || "Could not verify payment reference with Paystack.",
      };
    }

    if (json.data.status !== "success") {
      return {
        ok: false,
        error: `Payment was not completed (status: ${json.data.status || "incomplete"}). No booking was created.`,
      };
    }

    const booking = json.data.metadata?.consultationBooking;
    if (!booking || !booking.slotStart || !booking.email) {
      return {
        ok: false,
        error: "Payment succeeded, but consultation metadata was missing.",
      };
    }

    if (
      typeof json.data.amount === "number" &&
      json.data.amount < booking.feeKobo
    ) {
      return {
        ok: false,
        error: "Paid amount did not match the required consultation fee.",
      };
    }

    return {
      ok: true,
      booking,
      isPreview: false,
      paystackTransactionId:
        json.data.id !== undefined ? String(json.data.id) : undefined,
      paystackCustomerCode: json.data.customer?.customer_code,
      paymentChannel: json.data.channel,
      paidAt: json.data.paid_at,
      paystackRawResponse: json.data,
    };
  } catch (error) {
    console.error("[consultation] Paystack verify error:", error);
    return {
      ok: false,
      error: "Could not reach Paystack to verify your payment. Please refresh or contact us with your payment reference.",
    };
  }
}

export function getProcessedBooking(
  reference: string,
): ConfirmedBookingSummary | undefined {
  return processedReferences.get(reference);
}

export function saveProcessedBooking(
  reference: string,
  summary: ConfirmedBookingSummary,
): void {
  processedReferences.set(reference, summary);
}

export function verifyPaystackWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || "";
  if (!secretKey || !signatureHeader) {
    return false;
  }

  const expected = crypto
    .createHmac("sha512", secretKey)
    .update(rawBody)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
