import type { Metadata } from "next";
import { completeConsultationBookingAction } from "@/app/actions/consultation";
import { ConsultationScheduler } from "@/components/contact/consultation-scheduler";
import { DirectContact } from "@/components/contact/direct-contact";
import { EnquiryForm } from "@/components/contact/enquiry-form";
import { Container } from "@/components/container";
import {
  type ConfirmedBookingSummary,
  fetchCalcomAvailableSlots,
  getConsultationConfig,
} from "@/lib/consultation";
import { buildDayWindow } from "@/lib/consultation-dates";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Book a paid founder consultation or send an enquiry to Libertad Chey. Founder-led risk and audit advisory.",
};

type ContactPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim() || undefined;
  }
  return undefined;
}

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const resolvedParams = await searchParams;
  const initialReference =
    firstParam(resolvedParams.reference) || firstParam(resolvedParams.trxref);
  const initialPreviewToken = firstParam(resolvedParams.preview_token);

  const consultationConfig = getConsultationConfig();

  const initialDays = buildDayWindow(1, 10);
  const firstDay = initialDays[0].dateKey;
  const lastDay = initialDays[initialDays.length - 1].dateKey;

  const [slotsResult, verificationResult] = await Promise.all([
    fetchCalcomAvailableSlots({
      startDate: `${firstDay}T00:00:00.000Z`,
      endDate: `${lastDay}T23:59:59.999Z`,
      timeZone: consultationConfig.defaultTimeZone,
    }),
    initialReference
      ? completeConsultationBookingAction(initialReference, initialPreviewToken)
      : Promise.resolve(null),
  ]);

  let initialConfirmedSummary: ConfirmedBookingSummary | null = null;
  let initialVerificationError: string | null = null;

  if (verificationResult) {
    if (verificationResult.ok) {
      initialConfirmedSummary = verificationResult.summary;
    } else {
      initialVerificationError = verificationResult.error;
    }
  }

  return (
    <section className="relative overflow-hidden bg-background py-[var(--section-padding)]">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary-container/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-secondary/10 blur-3xl"
        aria-hidden="true"
      />

      <Container className="relative z-10">
        <header className="mb-8 text-center md:mb-10 md:text-left">
          <h1 className="font-display relative inline-block text-4xl font-bold tracking-tight text-on-background md:text-5xl">
            Let&apos;s talk strategy
            <span
              className="absolute -bottom-2 left-0 h-1 w-1/3 rounded-full bg-secondary"
              aria-hidden="true"
            />
          </h1>
          <p className="mt-5 max-w-2xl font-sans text-lg leading-relaxed text-on-surface-variant">
            Select a time for a private founder consultation to examine your
            risk, control, and audit priorities directly with Uche Maduka, or
            send a short enquiry and we will follow up personally.
          </p>
        </header>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-6">
          <div className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-8 shadow-[0_12px_40px_rgb(25_28_29/0.08)] lg:col-span-7">
            <div
              className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--primary),var(--secondary))]"
              aria-hidden="true"
            />
            <h2 className="font-display mb-6 flex items-center gap-2 text-2xl font-semibold text-on-surface">
              <span
                className="inline-flex h-8 w-8 items-center justify-center text-secondary"
                aria-hidden="true"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" />
                </svg>
              </span>
              Schedule a consultation
            </h2>
            <ConsultationScheduler
              formattedFee={consultationConfig.formattedFee}
              durationMinutes={consultationConfig.durationMinutes}
              defaultTimeZone={consultationConfig.defaultTimeZone}
              calcomConfigured={consultationConfig.calcomConfigured}
              paystackConfigured={consultationConfig.paystackConfigured}
              initialSlotsByDate={slotsResult.slotsByDate}
              initialSlotsSource={slotsResult.source}
              initialSlotsError={slotsResult.error}
              initialConfirmedSummary={initialConfirmedSummary}
              initialVerificationError={initialVerificationError}
              initialReference={initialReference}
            />
          </div>

          <div className="flex flex-col gap-6 lg:col-span-5">
            <div className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-8 shadow-[0_12px_40px_rgb(25_28_29/0.08)]">
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-bl-full bg-secondary/5"
                aria-hidden="true"
              />
              <h2 className="font-display relative mb-4 flex items-center gap-2 text-2xl font-semibold text-on-surface">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center text-primary"
                  aria-hidden="true"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 6h16v12H4z" />
                    <path d="M4 7l8 6 8-6" />
                  </svg>
                </span>
                Direct enquiry
              </h2>
              <EnquiryForm />
            </div>

            <DirectContact />
          </div>
        </div>
      </Container>
    </section>
  );
}
