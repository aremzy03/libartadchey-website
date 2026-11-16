import { NextResponse } from "next/server";
import { completeConsultationBookingAction } from "@/app/actions/consultation";
import { verifyPaystackWebhookSignature } from "@/lib/consultation";
import {
  isPersistenceConfigured,
  persistPaymentAuditLog,
} from "@/lib/persistence";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackWebhookSignature(rawBody, signature)) {
    return NextResponse.json(
      { ok: false, error: "Invalid signature" },
      { status: 401 },
    );
  }

  let event: {
    event?: string;
    data?: {
      reference?: string;
      amount?: number;
      currency?: string;
      status?: string;
      metadata?: {
        consultationBooking?: unknown;
      };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const reference =
    typeof event.data?.reference === "string"
      ? event.data.reference.trim()
      : "";

  if (reference) {
    await persistPaymentAuditLog({
      reference,
      eventType: "WEBHOOK_RECEIVED",
      source: "paystack_webhook",
      amountKobo:
        typeof event.data?.amount === "number" ? event.data.amount : undefined,
      currency:
        typeof event.data?.currency === "string"
          ? event.data.currency
          : undefined,
      status: String(event.event || "unknown"),
      message: `Paystack webhook event: ${String(event.event || "unknown")}`,
      payload: event,
    });
  }

  if (
    event.event === "charge.success" &&
    reference &&
    event.data?.metadata?.consultationBooking
  ) {
    const result = await completeConsultationBookingAction(
      reference,
      undefined,
      { source: "paystack_webhook" },
    );

    if (!result.ok) {
      console.error(
        "[paystack-webhook] Failed to complete consultation booking:",
        result.error,
      );
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    // If cPanel persistence is configured in production and the DB write failed,
    // return 500 so Paystack automatically retries the webhook to backfill the DB.
    if (isPersistenceConfigured() && !result.persistedRemotely) {
      console.error(
        "[paystack-webhook] Booking fulfilled, but cPanel database write failed. Requesting Paystack webhook retry.",
      );
      return NextResponse.json(
        {
          ok: false,
          error: "Database persistence temporarily unavailable; retry requested.",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
