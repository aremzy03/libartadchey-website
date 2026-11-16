"use client";

import { useActionState, useId } from "react";
import {
  subscribeNewsletter,
  type NewsletterActionState,
} from "@/app/actions/newsletter";

const initialNewsletterState: NewsletterActionState = { status: "idle" };

type NewsletterSignupProps = {
  className?: string;
  variant?: "sidebar" | "inline" | "footer";
};

export function NewsletterSignup({
  className = "",
  variant = "sidebar",
}: NewsletterSignupProps) {
  const formId = useId();
  const [state, formAction, isPending] = useActionState<
    NewsletterActionState,
    FormData
  >(subscribeNewsletter, initialNewsletterState);

  if (variant === "footer") {
    return (
      <div className={className}>
        <h2 className="font-display mb-2 text-xl font-semibold text-on-surface">
          The Executive Briefing
        </h2>
        <p className="font-sans text-sm leading-relaxed text-on-surface-variant">
          Occasional notes from Uche on governance, process audits, and catching
          risk early.
        </p>

        {state.status === "success" ? (
          <p
            className="mt-4 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3.5 py-2.5 font-sans text-sm font-medium text-primary"
            role="status"
            aria-live="polite"
          >
            {state.message}
          </p>
        ) : (
          <form
            action={formAction}
            className="mt-4 flex flex-col gap-2.5 sm:flex-row"
            noValidate
          >
            {/* Honeypot — visually hidden */}
            <div
              className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
              aria-hidden="true"
            >
              <label htmlFor={`${formId}-companyWebsite`}>
                Company website
              </label>
              <input
                id={`${formId}-companyWebsite`}
                name="companyWebsite"
                type="text"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div className="flex-1">
              <label className="sr-only" htmlFor={`${formId}-email`}>
                Work email
              </label>
              <input
                id={`${formId}-email`}
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="Work email"
                aria-invalid={state.status === "error" ? true : undefined}
                aria-describedby={
                  state.status === "error" ? `${formId}-error` : undefined
                }
                className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3.5 py-2.5 font-sans text-sm text-on-surface outline-none transition-[border-color,box-shadow] placeholder:text-outline focus:border-primary focus:shadow-[0_0_0_3px_rgba(184,150,12,0.25)] aria-[invalid=true]:border-error"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary-container px-5 py-2.5 font-sans text-sm font-semibold tracking-[0.05em] text-on-primary transition-[filter,opacity] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPending ? "Joining…" : "Subscribe"}
            </button>
          </form>
        )}

        {state.status === "error" && state.message ? (
          <p
            id={`${formId}-error`}
            className="mt-2 font-sans text-xs text-error"
            role="alert"
          >
            {state.message}
          </p>
        ) : null}
      </div>
    );
  }

  const isSidebar = variant === "sidebar";

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${
        isSidebar
          ? "bg-inverse-surface p-6 text-inverse-on-surface shadow-[0_12px_40px_rgba(25,28,29,0.18)] md:p-8"
          : "border border-outline-variant bg-surface-container-lowest p-6 md:p-8"
      } ${className}`}
    >
      {isSidebar ? (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 h-32 w-32 rounded-bl-full bg-secondary opacity-20 blur-xl"
        />
      ) : null}

      <p
        className={`font-sans text-xs font-semibold uppercase tracking-[0.05em] ${
          isSidebar ? "text-secondary-fixed" : "text-primary"
        }`}
      >
        Newsletter
      </p>
      <h3
        className={`relative z-10 mt-2 font-display text-xl font-semibold md:text-2xl ${
          isSidebar ? "text-inverse-on-surface" : "text-on-surface"
        }`}
      >
        The Executive Briefing
      </h3>
      <p
        className={`relative z-10 mt-3 font-sans text-base leading-relaxed ${
          isSidebar ? "text-surface-variant" : "text-on-surface-variant"
        }`}
      >
        Occasional notes from Uche on governance, process audits, and catching
        operational risk before it reaches the financials.
      </p>

      {state.status === "success" ? (
        <p
          className={`relative z-10 mt-6 font-sans text-sm font-semibold leading-relaxed ${
            isSidebar ? "text-secondary-fixed" : "text-primary"
          }`}
          role="status"
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : (
        <form
          action={formAction}
          className="relative z-10 mt-6 flex flex-col gap-3"
          noValidate
        >
          {/* Honeypot — visually hidden */}
          <div
            className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
            aria-hidden="true"
          >
            <label htmlFor={`${formId}-companyWebsite`}>Company website</label>
            <input
              id={`${formId}-companyWebsite`}
              name="companyWebsite"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <label className="sr-only" htmlFor={`${formId}-email`}>
            Work email
          </label>
          <input
            id={`${formId}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Work email"
            aria-invalid={state.status === "error" ? true : undefined}
            aria-describedby={
              state.status === "error" ? `${formId}-error` : undefined
            }
            className={`w-full rounded-md px-4 py-3 font-sans text-base text-on-surface outline-none ring-0 placeholder:text-outline focus:border-primary focus:shadow-[0_0_0_3px_rgba(184,150,12,0.25)] ${
              isSidebar
                ? "border border-transparent bg-surface"
                : "border border-outline-variant bg-surface-container-lowest"
            }`}
          />

          {state.status === "error" && state.message ? (
            <p
              id={`${formId}-error`}
              className={`font-sans text-xs ${
                isSidebar ? "text-error-container" : "text-error"
              }`}
              role="alert"
            >
              {state.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isPending}
            className={`w-full rounded-md px-6 py-3 font-sans text-sm font-semibold tracking-[0.05em] transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
              isSidebar
                ? "bg-secondary text-on-secondary-fixed-variant hover:bg-secondary-fixed"
                : "bg-primary-container text-on-primary hover:brightness-110"
            }`}
          >
            {isPending ? "Subscribing…" : "Subscribe"}
          </button>
        </form>
      )}

      <p
        className={`relative z-10 mt-4 text-center font-sans text-xs ${
          isSidebar ? "text-surface-variant/70" : "text-on-surface-variant"
        }`}
      >
        No spam. Unsubscribe anytime.
      </p>
    </div>
  );
}
