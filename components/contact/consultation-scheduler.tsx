"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchConsultationSlotsAction,
  type InitiateConsultationState,
  initiateConsultationPaymentAction,
} from "@/app/actions/consultation";
import type { ConfirmedBookingSummary } from "@/lib/consultation";
import { buildDayWindow, type DayItem } from "@/lib/consultation-dates";

type ConsultationSchedulerProps = {
  formattedFee: string;
  durationMinutes: number;
  defaultTimeZone: string;
  calcomConfigured: boolean;
  paystackConfigured: boolean;
  initialSlotsByDate: Record<string, string[]>;
  initialSlotsSource: "calcom" | "preview";
  initialSlotsError?: string;
  initialConfirmedSummary?: ConfirmedBookingSummary | null;
  initialVerificationError?: string | null;
  initialReference?: string;
};

const initialPaymentState: InitiateConsultationState = { status: "idle" };

const inputClass =
  "w-full rounded-md border border-outline-variant bg-surface-container-low px-4 py-3 font-sans text-base text-on-surface transition-[border-color,box-shadow] placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest aria-[invalid=true]:border-error aria-[invalid=true]:focus-visible:ring-error/40";

const labelClass =
  "font-sans text-sm font-semibold tracking-wide text-on-surface-variant";

function formatTimeOnly(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

function formatFullSlotSummary(
  iso: string,
  timeZone: string,
): { dateText: string; timeText: string; tzShort: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { dateText: iso, timeText: "", tzShort: timeZone };
  }
  try {
    const dateText = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    }).format(d);
    const timeText = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }).format(d);
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short",
      timeZone,
    }).formatToParts(d);
    const tzShort =
      tzParts.find((part) => part.type === "timeZoneName")?.value || timeZone;
    return { dateText, timeText, tzShort };
  } catch {
    return {
      dateText: d.toUTCString(),
      timeText: d.toISOString().slice(11, 16),
      tzShort: "UTC",
    };
  }
}

function pickInitialDateKey(
  days: DayItem[],
  slotsByDate: Record<string, string[]>,
): string {
  const firstWithSlots = days.find(
    (d) => (slotsByDate[d.dateKey]?.length ?? 0) > 0,
  );
  return firstWithSlots?.dateKey || days[0]?.dateKey || "";
}

export function ConsultationScheduler({
  formattedFee,
  durationMinutes,
  defaultTimeZone,
  paystackConfigured,
  initialSlotsByDate,
  initialSlotsSource,
  initialSlotsError,
  initialConfirmedSummary = null,
  initialVerificationError = null,
  initialReference,
}: ConsultationSchedulerProps) {
  const formId = useId();
  const confirmationRef = useRef<HTMLDivElement>(null);

  const [windowOffset, setWindowOffset] = useState<number>(1);
  const dayWindow = useMemo(
    () => buildDayWindow(windowOffset, 10),
    [windowOffset],
  );

  const [slotsByDate, setSlotsByDate] =
    useState<Record<string, string[]>>(initialSlotsByDate);
  const [slotsSource, setSlotsSource] = useState<"calcom" | "preview">(
    initialSlotsSource,
  );
  const [slotsLoading, setSlotsLoading] = useState<boolean>(false);
  const [slotsError, setSlotsError] = useState<string | null>(
    initialSlotsError ?? null,
  );

  const [selectedDateKey, setSelectedDateKey] = useState<string>(() =>
    pickInitialDateKey(buildDayWindow(1, 10), initialSlotsByDate),
  );
  const [selectedSlotIso, setSelectedSlotIso] = useState<string>("");
  const [step, setStep] = useState<"slot" | "details" | "confirmed">(
    initialConfirmedSummary || initialVerificationError ? "confirmed" : "slot",
  );

  const [verificationError, setVerificationError] = useState<string | null>(
    initialVerificationError,
  );
  const [confirmedSummary, setConfirmedSummary] =
    useState<ConfirmedBookingSummary | null>(initialConfirmedSummary);

  const [paymentState, paymentAction, isPaymentPending] = useActionState<
    InitiateConsultationState,
    FormData
  >(initiateConsultationPaymentAction, initialPaymentState);

  const timeZone = defaultTimeZone;

  async function handleOffsetChange(nextOffset: number) {
    const clamped = Math.max(1, nextOffset);
    setWindowOffset(clamped);
    setSlotsLoading(true);
    setSlotsError(null);

    const nextDays = buildDayWindow(clamped, 10);
    const firstDay = nextDays[0].dateKey;
    const lastDay = nextDays[nextDays.length - 1].dateKey;

    try {
      const result = await fetchConsultationSlotsAction({
        startDate: `${firstDay}T00:00:00.000Z`,
        endDate: `${lastDay}T23:59:59.999Z`,
        timeZone,
      });

      setSlotsByDate(result.slotsByDate);
      setSlotsSource(result.source);

      if (result.error) {
        setSlotsError(result.error);
      } else {
        setSelectedDateKey(pickInitialDateKey(nextDays, result.slotsByDate));
        setSelectedSlotIso("");
      }
    } catch {
      setSlotsError(
        "Unable to load consultation times right now. Please try again.",
      );
    } finally {
      setSlotsLoading(false);
    }
  }

  // Redirect to Paystack checkout URL (or local preview callback) when initialized
  useEffect(() => {
    if (
      paymentState.status === "redirect" &&
      paymentState.authorizationUrl
    ) {
      window.location.assign(paymentState.authorizationUrl);
    }
  }, [paymentState]);

  // Clean up query parameters from the URL bar once confirmed or verified
  useEffect(() => {
    if (
      (confirmedSummary || verificationError) &&
      typeof window !== "undefined" &&
      window.location.search
    ) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (confirmedSummary) {
      confirmationRef.current?.focus();
    }
  }, [confirmedSummary, verificationError]);

  const slotsForSelectedDay = useMemo(() => {
    if (!selectedDateKey) return [];
    return slotsByDate[selectedDateKey] ?? [];
  }, [selectedDateKey, slotsByDate]);

  const selectedSlotSummary = useMemo(() => {
    if (!selectedSlotIso) return null;
    return formatFullSlotSummary(selectedSlotIso, timeZone);
  }, [selectedSlotIso, timeZone]);

  if (step === "confirmed") {
    if (verificationError) {
      return (
        <div
          role="alert"
          className="flex flex-col gap-5 rounded-lg bg-surface-container-low p-6"
        >
          <div className="flex flex-col gap-2">
            <h3 className="font-display text-2xl font-semibold text-on-surface">
              We could not complete your booking automatically
            </h3>
            <p className="font-sans text-base leading-relaxed text-on-surface-variant">
              {verificationError}
            </p>
          </div>
          {initialReference ? (
            <p className="font-sans text-sm text-on-surface-variant tabular-nums">
              Payment reference:{" "}
              <code className="rounded bg-surface-container px-2 py-0.5 font-mono text-on-surface">
                {initialReference}
              </code>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setVerificationError(null);
                setStep("slot");
              }}
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 font-sans text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              Choose a time slot
            </button>
          </div>
        </div>
      );
    }

    if (confirmedSummary) {
      const confirmedSlot = formatFullSlotSummary(
        confirmedSummary.slotStart,
        confirmedSummary.timeZone,
      );

      return (
        <div
          ref={confirmationRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="flex flex-col gap-6 rounded-lg bg-surface-container-low p-6 outline-none sm:p-8"
        >
          <div className="flex items-start gap-4">
            <span
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container"
              aria-hidden="true"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <div>
              <h3 className="font-display text-2xl font-semibold text-on-surface">
                Your consultation is confirmed
              </h3>
              <p className="mt-1 max-w-prose font-sans text-base leading-relaxed text-on-surface-variant">
                Thank you, {confirmedSummary.name}. Your payment has been
                verified and your session with Uche Maduka is locked in. A
                calendar invitation and receipt have been sent to{" "}
                <span className="font-semibold text-on-surface">
                  {confirmedSummary.email}
                </span>
                .
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-4 border-y border-outline-variant/40 py-5 sm:grid-cols-2">
            <div>
              <dt className="font-sans text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                Date &amp; time
              </dt>
              <dd className="mt-1 font-sans text-base font-semibold text-on-surface tabular-nums">
                {confirmedSlot.dateText}
                <span className="block font-normal text-on-surface-variant">
                  {confirmedSlot.timeText} ({confirmedSlot.tzShort}) ·{" "}
                  {confirmedSummary.durationMinutes} mins
                </span>
              </dd>
            </div>

            <div>
              <dt className="font-sans text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                Organisation
              </dt>
              <dd className="mt-1 font-sans text-base font-semibold text-on-surface">
                {confirmedSummary.organisation}
              </dd>
            </div>

            <div>
              <dt className="font-sans text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                Consultation fee paid
              </dt>
              <dd className="mt-1 font-sans text-base font-semibold text-on-surface tabular-nums">
                {confirmedSummary.formattedAmount}
              </dd>
            </div>

            <div>
              <dt className="font-sans text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                Payment reference
              </dt>
              <dd className="mt-1 font-mono text-sm text-on-surface-variant tabular-nums">
                {confirmedSummary.reference}
              </dd>
            </div>
          </dl>

          {confirmedSummary.meetingUrl ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-sans text-sm text-on-surface-variant">
                Your video consultation link is ready:
              </p>
              <a
                href={confirmedSummary.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-sans text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                Open meeting link
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          ) : null}

          {confirmedSummary.isPreview ? (
            <p className="rounded-md bg-secondary-container/40 px-4 py-3 font-sans text-sm text-on-secondary-fixed">
              Preview mode active: Add{" "}
              <code className="font-mono">PAYSTACK_SECRET_KEY</code> and{" "}
              <code className="font-mono">CALCOM_API_KEY</code> +{" "}
              <code className="font-mono">CALCOM_EVENT_TYPE_ID</code> in{" "}
              <code className="font-mono">.env.local</code> to process live
              Paystack payments and real Cal.com calendar invites.
            </p>
          ) : null}

          <div>
            <button
              type="button"
              onClick={() => {
                setConfirmedSummary(null);
                setSelectedSlotIso("");
                setStep("slot");
              }}
              className="font-sans text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              Book another session
            </button>
          </div>
        </div>
      );
    }
  }

  const fieldErrors = paymentState.fieldErrors ?? {};

  return (
    <div className="flex flex-col gap-6">
      {/* Session summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/40 pb-5">
        <div>
          <p className="font-sans text-base font-semibold text-on-surface">
            1-on-1 Founder Consultation with Uche Maduka
          </p>
          <p className="mt-0.5 font-sans text-sm text-on-surface-variant tabular-nums">
            {durationMinutes}-minute private advisory call · Video conference
          </p>
        </div>
        <div className="rounded-md bg-secondary-container/45 px-3.5 py-2 text-right">
          <span className="block font-sans text-xs font-semibold tracking-wider text-on-secondary-fixed-variant uppercase">
            Session fee
          </span>
          <span className="font-display text-xl font-bold text-on-secondary-fixed tabular-nums">
            {formattedFee}
          </span>
        </div>
      </div>

      {step === "slot" ? (
        <div className="flex flex-col gap-6">
          {/* Date selector header + week navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold text-on-surface">
                Choose a date and time
              </h3>
              <p className="font-sans text-sm text-on-surface-variant">
                Times shown in{" "}
                <span className="font-semibold text-on-surface">{timeZone}</span>{" "}
                (WAT)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={windowOffset <= 1 || slotsLoading}
                onClick={() => void handleOffsetChange(windowOffset - 7)}
                aria-label="Previous week"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-outline-variant/60 bg-surface-container-low text-on-surface transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                disabled={slotsLoading}
                onClick={() => void handleOffsetChange(windowOffset + 7)}
                aria-label="Next week"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-outline-variant/60 bg-surface-container-low text-on-surface transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>

          {/* 10-day calendar grid */}
          <div
            role="group"
            aria-label="Available dates"
            className="grid grid-cols-5 gap-2"
          >
            {dayWindow.map((day) => {
              const daySlots = slotsByDate[day.dateKey] ?? [];
              const hasSlots = daySlots.length > 0;
              const isSelected = selectedDateKey === day.dateKey;

              return (
                <button
                  key={day.dateKey}
                  type="button"
                  disabled={!slotsLoading && !hasSlots}
                  aria-pressed={isSelected}
                  aria-label={`${day.fullLabel}${hasSlots ? `, ${daySlots.length} available slots` : ", unavailable"}`}
                  onClick={() => {
                    setSelectedDateKey(day.dateKey);
                    setSelectedSlotIso("");
                  }}
                  className={`flex flex-col items-center justify-center rounded-md border px-2 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 ${
                    isSelected
                      ? "border-primary bg-primary text-on-primary"
                      : hasSlots
                        ? "border-outline-variant/60 bg-surface-container-low text-on-surface hover:border-primary/60"
                        : "cursor-not-allowed border-outline-variant/30 bg-surface-container-low/50 text-on-surface-variant/45"
                  }`}
                >
                  <span
                    className={`font-sans text-xs font-semibold uppercase ${
                      isSelected ? "text-on-primary" : "text-on-surface-variant"
                    }`}
                  >
                    {day.weekdayShort}
                  </span>
                  <span className="mt-0.5 font-display text-xl font-bold tabular-nums">
                    {day.dayNumber}
                  </span>
                  <span
                    className={`font-sans text-xs ${
                      isSelected ? "text-on-primary" : "text-on-surface-variant"
                    }`}
                  >
                    {day.monthShort}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Time slots section */}
          <div className="flex flex-col gap-3">
            <p className="font-sans text-sm font-semibold text-on-surface">
              Available times
            </p>

            {slotsLoading ? (
              <div
                role="status"
                aria-live="polite"
                className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
              >
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-11 animate-pulse rounded-md bg-surface-container-high"
                  />
                ))}
                <span className="sr-only">Loading available time slots…</span>
              </div>
            ) : slotsError ? (
              <div
                role="alert"
                className="flex flex-col items-start gap-3 rounded-md bg-error-container p-4 text-on-error-container"
              >
                <p className="font-sans text-sm">{slotsError}</p>
                <button
                  type="button"
                  onClick={() => void handleOffsetChange(windowOffset)}
                  className="rounded-md bg-on-error-container px-3 py-1.5 font-sans text-xs font-semibold text-error-container"
                >
                  Try again
                </button>
              </div>
            ) : slotsForSelectedDay.length === 0 ? (
              <p className="rounded-md bg-surface-container-low px-4 py-6 text-center font-sans text-sm text-on-surface-variant">
                No open slots on this date. Please select another highlighted
                weekday above.
              </p>
            ) : (
              <div
                role="group"
                aria-label="Available time slots"
                className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
              >
                {slotsForSelectedDay.map((slotIso) => {
                  const isChosen = selectedSlotIso === slotIso;
                  const label = formatTimeOnly(slotIso, timeZone);

                  return (
                    <button
                      key={slotIso}
                      type="button"
                      aria-pressed={isChosen}
                      onClick={() => setSelectedSlotIso(slotIso)}
                      className={`rounded-md border px-3 py-2.5 font-sans text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 ${
                        isChosen
                          ? "border-primary bg-primary text-on-primary"
                          : "border-outline-variant/60 bg-surface-container-low text-on-surface hover:border-primary"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {slotsSource === "preview" || !paystackConfigured ? (
            <p className="font-sans text-xs leading-relaxed text-on-surface-variant">
              {slotsSource === "preview"
                ? "Showing sample availability until CALCOM_EVENT_TYPE_ID is added to your environment."
                : null}{" "}
              {!paystackConfigured
                ? "Paystack is running in local preview mode until PAYSTACK_SECRET_KEY is configured."
                : null}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!selectedSlotIso}
            onClick={() => setStep("details")}
            className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md bg-secondary-container px-6 py-4 font-sans text-sm font-semibold tracking-wide text-on-secondary-container transition-[background-color,opacity] hover:bg-secondary-fixed-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {selectedSlotSummary
              ? `Continue with ${selectedSlotSummary.timeText} (${selectedSlotSummary.tzShort})`
              : "Select a time slot to continue"}
            <span aria-hidden="true" className="text-lg leading-none">
              →
            </span>
          </button>
        </div>
      ) : (
        /* Step 2: Attendee details + Paystack checkout trigger */
        <form
          action={paymentAction}
          className="flex flex-col gap-4"
          noValidate
        >
          <input type="hidden" name="slotStart" value={selectedSlotIso} />
          <input type="hidden" name="timeZone" value={timeZone} />

          {/* Chosen slot banner */}
          {selectedSlotSummary ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-container-low px-4 py-3">
              <div>
                <p className="font-sans text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                  Selected slot
                </p>
                <p className="font-sans text-sm font-semibold text-on-surface tabular-nums">
                  {selectedSlotSummary.dateText} at{" "}
                  {selectedSlotSummary.timeText} ({selectedSlotSummary.tzShort})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep("slot")}
                className="font-sans text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                Change time
              </button>
            </div>
          ) : null}

          {fieldErrors.slotStart ? (
            <p
              className="rounded-md bg-error-container px-3 py-2 font-sans text-sm text-on-error-container"
              role="alert"
            >
              {fieldErrors.slotStart}
            </p>
          ) : null}

          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor={`${formId}-name`}>
              Full name
            </label>
            <input
              id={`${formId}-name`}
              name="name"
              type="text"
              autoComplete="name"
              required
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={
                fieldErrors.name ? `${formId}-name-error` : undefined
              }
              className={inputClass}
              placeholder="Adaeze Okafor"
            />
            {fieldErrors.name ? (
              <p
                id={`${formId}-name-error`}
                className="font-sans text-sm text-error"
                role="alert"
              >
                {fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor={`${formId}-email`}>
                Work email
              </label>
              <input
                id={`${formId}-email`}
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={
                  fieldErrors.email ? `${formId}-email-error` : undefined
                }
                className={inputClass}
                placeholder="adaeze@company.com"
              />
              {fieldErrors.email ? (
                <p
                  id={`${formId}-email-error`}
                  className="font-sans text-sm text-error"
                  role="alert"
                >
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor={`${formId}-organisation`}>
                Organisation
              </label>
              <input
                id={`${formId}-organisation`}
                name="organisation"
                type="text"
                autoComplete="organization"
                required
                aria-invalid={fieldErrors.organisation ? true : undefined}
                aria-describedby={
                  fieldErrors.organisation
                    ? `${formId}-organisation-error`
                    : undefined
                }
                className={inputClass}
                placeholder="Organisation name"
              />
              {fieldErrors.organisation ? (
                <p
                  id={`${formId}-organisation-error`}
                  className="font-sans text-sm text-error"
                  role="alert"
                >
                  {fieldErrors.organisation}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor={`${formId}-notes`}>
              What should we focus on during our call?
            </label>
            <textarea
              id={`${formId}-notes`}
              name="notes"
              rows={3}
              required
              aria-invalid={fieldErrors.notes ? true : undefined}
              aria-describedby={
                fieldErrors.notes ? `${formId}-notes-error` : undefined
              }
              className={`${inputClass} min-h-[5.5rem] resize-y`}
              placeholder="Share the key risk, process, or audit priorities you would like Uche to review ahead of the call…"
            />
            {fieldErrors.notes ? (
              <p
                id={`${formId}-notes-error`}
                className="font-sans text-sm text-error"
                role="alert"
              >
                {fieldErrors.notes}
              </p>
            ) : null}
          </div>

          {paymentState.status === "error" && paymentState.message ? (
            <p
              className="rounded-md bg-error-container px-3 py-2 font-sans text-sm text-on-error-container"
              role="alert"
            >
              {paymentState.message}
            </p>
          ) : null}

          <div className="mt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={isPaymentPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-secondary-container px-6 py-4 font-sans text-sm font-semibold tracking-wide text-on-secondary-container tabular-nums transition-[background-color,opacity] hover:bg-secondary-fixed-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPaymentPending
                ? "Connecting to Paystack…"
                : `Pay ${formattedFee} & confirm booking`}
              {!isPaymentPending ? (
                <span aria-hidden="true" className="text-lg leading-none">
                  →
                </span>
              ) : null}
            </button>

            <p className="text-center font-sans text-xs text-on-surface-variant">
              Secured by Paystack (Card, Bank Transfer, or USSD). Your calendar
              invitation is dispatched immediately upon payment confirmation.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
