"use server";

import {
  buildNewsletterWelcomeEmail,
   getContactToEmail,
  sendResendEmail,
  upsertResendAudienceContact,
} from "@/lib/email";

/**
 * Newsletter subscription (Resend Audiences + Welcome Email).
 *
 * Env:
 * - RESEND_API_KEY — required to add contacts and send welcome email
 * - RESEND_AUDIENCE_ID — Resend Audience ID for "The Executive Briefing"
 * - RESEND_FROM_EMAIL — verified Resend sender
 * - CONTACT_TO_EMAIL — reply-to address for welcome emails (defaults to siteConfig.email)
 */

export type NewsletterActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function subscribeNewsletter(
  _prev: NewsletterActionState,
  formData: FormData,
): Promise<NewsletterActionState> {
  const email = readString(formData, "email").toLowerCase();

  // Honeypot: bots fill this; humans leave it empty
  const companyWebsite = readString(formData, "companyWebsite");
  if (companyWebsite) {
    return {
      status: "success",
      message: "You are subscribed to The Executive Briefing.",
    };
  }

  if (!email) {
    return {
      status: "error",
      message: "Please enter your work email.",
    };
  }

  if (!isValidEmail(email)) {
    return {
      status: "error",
      message: "Please enter a valid email address (for example, name@company.com).",
    };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const audienceId = process.env.RESEND_AUDIENCE_ID?.trim();

  if (!apiKey || !audienceId) {
    console.info(
      "[newsletter] Subscription received (RESEND_API_KEY or RESEND_AUDIENCE_ID not set):",
      { email, receivedAt: new Date().toISOString() },
    );
    return {
      status: "success",
      message: "You are subscribed to The Executive Briefing.",
    };
  }

  try {
    const contactResult = await upsertResendAudienceContact(
      apiKey,
      audienceId,
      email,
    );

    if (!contactResult.ok) {
      console.error(
        "[newsletter] Resend Audience error:",
        contactResult.status,
        contactResult.detail,
      );
      return {
        status: "error",
        message:
          "We could not complete your subscription just now. Please try again in a moment.",
      };
    }

    // Best-effort welcome email from Uche Maduka
    const welcome = buildNewsletterWelcomeEmail();
    const welcomeResult = await sendResendEmail(apiKey, {
      to: email,
      replyTo: getContactToEmail(),
      subject: welcome.subject,
      html: welcome.html,
      text: welcome.text,
    });

    if (!welcomeResult.ok) {
      console.warn(
        "[newsletter] Contact added to Audience, but welcome email failed:",
        welcomeResult.status,
        welcomeResult.detail,
      );
    }

    return {
      status: "success",
      message:
        "You are subscribed to The Executive Briefing. Check your inbox for a welcome note from Uche.",
    };
  } catch (error) {
    console.error("[newsletter] Unexpected subscribe failure:", error);
    return {
      status: "error",
      message:
        "Something went wrong on our end. Please try again in a moment.",
    };
  }
}
