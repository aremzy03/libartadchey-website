"use server";

import { headers } from "next/headers";
import {
  type AvailableSlotsResult,
  type ConfirmedBookingSummary,
  type ConsultationBookingMetadata,
  createCalcomBooking,
  fetchCalcomAvailableSlots,
  formatConsultationFee,
  formatSlotDateTime,
  getConsultationConfig,
  getProcessedBooking,
  initializePaystackPayment,
  saveProcessedBooking,
  verifyPaystackAndGetBooking,
} from "@/lib/consultation";
import {
  buildConsultationConfirmationEmail,
  buildConsultationNotificationEmail,
  getContactToEmail,
  sendResendEmail,
} from "@/lib/email";
import {
  claimConsultationForFulfilment,
  getPersistedConsultationBooking,
  persistConsultationCompleted,
  persistConsultationInitiated,
  persistPaymentAuditLog,
} from "@/lib/persistence";

export type ConsultationFieldErrors = Partial<
  Record<"slotStart" | "name" | "email" | "organisation" | "notes" | "form", string>
>;

export type InitiateConsultationState = {
  status: "idle" | "redirect" | "error";
  message?: string;
  fieldErrors?: ConsultationFieldErrors;
  authorizationUrl?: string;
  reference?: string;
  isPreview?: boolean;
};

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function fetchConsultationSlotsAction(params: {
  startDate: string;
  endDate: string;
  timeZone: string;
}): Promise<AvailableSlotsResult> {
  return fetchCalcomAvailableSlots(params);
}

export async function initiateConsultationPaymentAction(
  _prev: InitiateConsultationState,
  formData: FormData,
): Promise<InitiateConsultationState> {
  const slotStart = readString(formData, "slotStart");
  const timeZone = readString(formData, "timeZone") || "Africa/Lagos";
  const name = readString(formData, "name");
  const email = readString(formData, "email");
  const organisation = readString(formData, "organisation");
  const notes = readString(formData, "notes");

  const fieldErrors: ConsultationFieldErrors = {};

  if (!slotStart || Number.isNaN(new Date(slotStart).getTime())) {
    fieldErrors.slotStart = "Please choose an available date and time slot first.";
  } else if (new Date(slotStart).getTime() <= Date.now()) {
    fieldErrors.slotStart =
      "That time slot has already passed. Please choose an upcoming time.";
  }

  if (!name) {
    fieldErrors.name = "Please enter your full name.";
  }
  if (!email) {
    fieldErrors.email = "Please enter your work email.";
  } else if (!isValidEmail(email)) {
    fieldErrors.email =
      "Email needs to include an @ and a domain. Example: name@company.com";
  }
  if (!organisation) {
    fieldErrors.organisation = "Please enter your organisation.";
  }
  if (!notes) {
    fieldErrors.notes =
      "Please share a short agenda so Uche can prepare for your session.";
  } else if (notes.length < 10) {
    fieldErrors.notes =
      "Please add at least a sentence on what you want to cover.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Please review the highlighted fields before continuing to payment.",
      fieldErrors,
    };
  }

  const config = getConsultationConfig();

  // Re-verify slot availability if Cal.com is configured
  if (config.calcomConfigured) {
    const slotDay = new Date(slotStart);
    const dayStart = new Date(
      Date.UTC(
        slotDay.getUTCFullYear(),
        slotDay.getUTCMonth(),
        slotDay.getUTCDate(),
        0,
        0,
        0,
      ),
    ).toISOString();
    const dayEnd = new Date(
      Date.UTC(
        slotDay.getUTCFullYear(),
        slotDay.getUTCMonth(),
        slotDay.getUTCDate(),
        23,
        59,
        59,
      ),
    ).toISOString();

    const check = await fetchCalcomAvailableSlots({
      startDate: dayStart,
      endDate: dayEnd,
      timeZone,
    });

    if (!check.error && check.source === "calcom") {
      const allTimes = Object.values(check.slotsByDate).flat();
      const targetMs = new Date(slotStart).getTime();
      const stillAvailable = allTimes.some(
        (iso) => Math.abs(new Date(iso).getTime() - targetMs) < 60_000,
      );
      if (!stillAvailable) {
        return {
          status: "error",
          message:
            "That time slot was just taken. Please pick another available time before paying.",
          fieldErrors: {
            slotStart: "This time slot is no longer available.",
          },
        };
      }
    }
  }

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "localhost:3000";
  const proto =
    hdrs.get("x-forwarded-proto") ||
    (host.startsWith("localhost") ? "http" : "https");
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "") ||
    `${proto}://${host}`;
  const callbackUrl = `${baseUrl}/contact`;

  const booking: ConsultationBookingMetadata = {
    slotStart,
    timeZone,
    name,
    email,
    organisation,
    notes,
    durationMinutes: config.durationMinutes,
    feeKobo: config.feeKobo,
    currency: config.currency,
  };

  const initResult = await initializePaystackPayment({
    booking,
    callbackUrl,
  });

  if (!initResult.ok) {
    return {
      status: "error",
      message: initResult.error,
      fieldErrors: { form: initResult.error },
    };
  }

  // Persist PENDING booking & audit event to cPanel (best-effort so checkout never blocks)
  await persistConsultationInitiated({
    reference: initResult.reference,
    booking,
    formattedAmount: config.formattedFee,
    isPreview: initResult.isPreview,
  });

  return {
    status: "redirect",
    authorizationUrl: initResult.authorizationUrl,
    reference: initResult.reference,
    isPreview: initResult.isPreview,
  };
}

export async function completeConsultationBookingAction(
  reference: string,
  previewToken?: string,
  options?: {
    source?: "server_action" | "paystack_webhook";
  },
): Promise<
  | { ok: true; summary: ConfirmedBookingSummary; persistedRemotely: boolean }
  | { ok: false; error: string }
> {
  const cleanRef = reference.trim();
  if (!cleanRef) {
    return { ok: false, error: "Missing payment reference." };
  }

  const source = options?.source ?? "server_action";

  // 1. Check in-memory and cPanel DB for an already-fulfilled booking
  const existingInMemory = getProcessedBooking(cleanRef);
  if (existingInMemory) {
    return { ok: true, summary: existingInMemory, persistedRemotely: true };
  }

  const existingPersisted = await getPersistedConsultationBooking(cleanRef);
  if (existingPersisted) {
    saveProcessedBooking(cleanRef, existingPersisted);
    return { ok: true, summary: existingPersisted, persistedRemotely: true };
  }

  // 2. Verify transaction with Paystack
  const verified = await verifyPaystackAndGetBooking(cleanRef, previewToken);
  if (!verified.ok) {
    await persistPaymentAuditLog({
      reference: cleanRef,
      eventType: "PAYSTACK_VERIFY_FAILED",
      source,
      status: "FAILED",
      message: verified.error,
    });
    return { ok: false, error: verified.error };
  }

  const { booking } = verified;
  const formattedAmount = formatConsultationFee(
    booking.feeKobo,
    booking.currency,
  );

  // 3. Atomically upsert PAID status & claim fulfilment lock in cPanel DB
  const claim = await claimConsultationForFulfilment({
    reference: cleanRef,
    booking,
    formattedAmount,
    isPreview: verified.isPreview,
    source,
    paystackTransactionId: verified.paystackTransactionId,
    paystackCustomerCode: verified.paystackCustomerCode,
    paymentChannel: verified.paymentChannel,
    paidAt: verified.paidAt,
    paystackRawResponse: verified.paystackRawResponse,
  });

  if (claim.alreadyFulfilled && claim.existingSummary) {
    saveProcessedBooking(cleanRef, claim.existingSummary);
    return {
      ok: true,
      summary: claim.existingSummary,
      persistedRemotely: claim.persistedRemotely,
    };
  }

  // 4. Create Cal.com booking
  const calResult = await createCalcomBooking(booking, cleanRef);

  const bookingUid = calResult.ok
    ? calResult.bookingUid
    : `manual_followup_${cleanRef.slice(-8)}`;
  const meetingUrl = calResult.ok ? calResult.meetingUrl : undefined;
  const isPreview = verified.isPreview || (calResult.ok && calResult.isPreview);
  const bookingStatus = calResult.ok ? "CONFIRMED" : "MANUAL_FOLLOWUP";

  const summary: ConfirmedBookingSummary = {
    reference: cleanRef,
    bookingUid,
    slotStart: booking.slotStart,
    durationMinutes: booking.durationMinutes,
    timeZone: booking.timeZone,
    name: booking.name,
    email: booking.email,
    organisation: booking.organisation,
    notes: booking.notes,
    formattedAmount,
    meetingUrl,
    isPreview,
  };

  saveProcessedBooking(cleanRef, summary);

  // 5. Send confirmation and founder notification emails via Resend
  const apiKey = process.env.RESEND_API_KEY?.trim();
  let emailSent = false;
  if (apiKey) {
    const slotFormatted = formatSlotDateTime(booking.slotStart, booking.timeZone);
    const founderTo = getContactToEmail();

    try {
      const founderEmail = buildConsultationNotificationEmail({
        name: booking.name,
        email: booking.email,
        organisation: booking.organisation,
        notes: booking.notes,
        slotDateLabel: slotFormatted.dateLabel,
        slotTimeLabel: slotFormatted.timeLabel,
        timeZoneLabel: slotFormatted.timeZoneLabel,
        durationMinutes: booking.durationMinutes,
        formattedAmount,
        reference: cleanRef,
        bookingUid,
        meetingUrl,
      });

      await sendResendEmail(apiKey, {
        to: founderTo,
        replyTo: booking.email,
        subject: founderEmail.subject,
        html: founderEmail.html,
        text: founderEmail.text,
      });

      const clientEmail = buildConsultationConfirmationEmail({
        name: booking.name,
        organisation: booking.organisation,
        slotDateLabel: slotFormatted.dateLabel,
        slotTimeLabel: slotFormatted.timeLabel,
        timeZoneLabel: slotFormatted.timeZoneLabel,
        durationMinutes: booking.durationMinutes,
        formattedAmount,
        reference: cleanRef,
        meetingUrl,
      });

      const clientEmailRes = await sendResendEmail(apiKey, {
        to: booking.email,
        replyTo: founderTo,
        subject: clientEmail.subject,
        html: clientEmail.html,
        text: clientEmail.text,
      });
      emailSent = clientEmailRes.ok;
    } catch (emailError) {
      console.warn(
        "[consultation] Booking confirmed, but confirmation email failed:",
        emailError,
      );
    }
  } else {
    console.info(
      "[consultation] Booking confirmed (RESEND_API_KEY not set; skipping email):",
      summary,
    );
  }

  // 6. Finalize fulfilment status & audit trail in cPanel DB
  const completedRemotely = await persistConsultationCompleted({
    reference: cleanRef,
    summary,
    bookingStatus,
    amountKobo: booking.feeKobo,
    currency: booking.currency,
    emailSent,
    source,
    message: calResult.ok
      ? "Cal.com consultation scheduled and confirmation processed."
      : calResult.error,
  });

  return {
    ok: true,
    summary,
    persistedRemotely: claim.persistedRemotely && completedRemotely,
  };
}
