import { siteConfig } from "@/lib/site";

const RESEND_API_BASE = "https://api.resend.com";

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type ResendResult =
  | { ok: true }
  | { ok: false; status: number; detail: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getResendFromEmail(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    `${siteConfig.name} <onboarding@resend.dev>`
  );
}

export function getContactToEmail(): string {
  return process.env.CONTACT_TO_EMAIL?.trim() || siteConfig.email;
}

export async function sendResendEmail(
  apiKey: string,
  options: SendEmailOptions,
): Promise<ResendResult> {
  const response = await fetch(`${RESEND_API_BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getResendFromEmail(),
      to: Array.isArray(options.to) ? options.to : [options.to],
      ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { ok: false, status: response.status, detail };
  }

  return { ok: true };
}

export async function upsertResendAudienceContact(
  apiKey: string,
  audienceId: string,
  email: string,
): Promise<ResendResult> {
  const response = await fetch(
    `${RESEND_API_BASE}/audiences/${encodeURIComponent(audienceId)}/contacts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        unsubscribed: false,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    // Treat duplicate / already-existing contact responses gracefully as success
    if (
      response.status === 409 ||
      detail.toLowerCase().includes("already exists")
    ) {
      return { ok: true };
    }
    return { ok: false, status: response.status, detail };
  }

  return { ok: true };
}

function renderEmailShell({
  eyebrow,
  heading,
  bodyHtml,
}: {
  eyebrow: string;
  heading: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8f9fa;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#191c1d;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8f9fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border:1px solid #cfc2d3;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:#3e0064;padding:24px 32px;border-bottom:3px solid #B8960C;">
                <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#ffe082;">
                  ${escapeHtml(siteConfig.name)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#5b0f8c;">
                  ${escapeHtml(eyebrow)}
                </p>
                <h1 style="margin:0 0 20px 0;font-family:Georgia,'Playfair Display',serif;font-size:24px;font-weight:600;line-height:1.3;color:#191c1d;">
                  ${escapeHtml(heading)}
                </h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="background-color:#f3f4f5;padding:20px 32px;border-top:1px solid #e1e3e4;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#4d4451;">
                  <strong>${escapeHtml(siteConfig.name)}</strong><br />
                  ${escapeHtml(siteConfig.location)}<br />
                  <a href="mailto:${escapeHtml(siteConfig.email)}" style="color:#3e0064;text-decoration:none;">${escapeHtml(siteConfig.email)}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildEnquiryNotificationEmail(payload: {
  name: string;
  email: string;
  organisation: string;
  message: string;
  receivedAt: string;
}): { subject: string; html: string; text: string } {
  const { name, email, organisation, message, receivedAt } = payload;
  const subject = `Website enquiry from ${name} (${organisation})`;

  const messageParagraphs = escapeHtml(message).replace(/\r?\n/g, "<br />");

  const bodyHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;background-color:#f8f9fa;border:1px solid #e1e3e4;border-radius:8px;padding:16px;">
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;width:120px;"><strong>Name</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;">${escapeHtml(name)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Work email</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;"><a href="mailto:${escapeHtml(email)}" style="color:#3e0064;text-decoration:underline;">${escapeHtml(email)}</a></td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Organisation</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;">${escapeHtml(organisation)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Received</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;">${escapeHtml(receivedAt)}</td>
      </tr>
    </table>
    <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#4d4451;">
      Message
    </p>
    <div style="margin:0;padding:16px;background-color:#ffffff;border-left:3px solid #B8960C;font-size:15px;line-height:1.65;color:#191c1d;">
      ${messageParagraphs}
    </div>
  `;

  const html = renderEmailShell({
    eyebrow: "New Website Enquiry",
    heading: `${name} from ${organisation}`,
    bodyHtml,
  });

  const text = [
    `New website enquiry received`,
    ``,
    `Name: ${name}`,
    `Email: ${email}`,
    `Organisation: ${organisation}`,
    `Received: ${receivedAt}`,
    ``,
    `Message:`,
    message,
  ].join("\n");

  return { subject, html, text };
}

export function buildEnquiryConfirmationEmail(payload: {
  name: string;
  organisation: string;
}): { subject: string; html: string; text: string } {
  const { name, organisation } = payload;
  const subject = `We received your enquiry | ${siteConfig.name}`;

  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:#191c1d;">
      Hello ${escapeHtml(name)},
    </p>
    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:#4d4451;">
      Thank you for reaching out to ${escapeHtml(siteConfig.name)} regarding ${escapeHtml(organisation)}. I have received your note and will review it personally before getting back to you shortly.
    </p>
    <p style="margin:0 0 24px 0;font-size:16px;line-height:1.65;color:#4d4451;">
      If your matter is time-sensitive, you can reply directly to this email or reach us at <a href="mailto:${escapeHtml(siteConfig.email)}" style="color:#3e0064;text-decoration:underline;">${escapeHtml(siteConfig.email)}</a>.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#191c1d;">
      Warm regards,<br />
      <strong>Uche Maduka</strong><br />
      <span style="color:#4d4451;font-size:14px;">Founder, ${escapeHtml(siteConfig.name)}</span>
    </p>
  `;

  const html = renderEmailShell({
    eyebrow: "Enquiry Confirmation",
    heading: "Thank you for getting in touch",
    bodyHtml,
  });

  const text = [
    `Hello ${name},`,
    ``,
    `Thank you for reaching out to ${siteConfig.name} regarding ${organisation}. I have received your note and will review it personally before getting back to you shortly.`,
    ``,
    `If your matter is time-sensitive, you can reply directly to this email or reach us at ${siteConfig.email}.`,
    ``,
    `Warm regards,`,
    `Uche Maduka`,
    `Founder, ${siteConfig.name}`,
  ].join("\n");

  return { subject, html, text };
}

export function buildNewsletterWelcomeEmail(): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Welcome to The Executive Briefing | ${siteConfig.name}`;

  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:#191c1d;">
      Welcome to <strong>The Executive Briefing</strong>.
    </p>
    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:#4d4451;">
      Thank you for subscribing. I write occasional, practical notes for decision-makers on process audits, governance, internal controls, and catching operational risk before it reaches the financial statements.
    </p>
    <p style="margin:0 0 24px 0;font-size:16px;line-height:1.65;color:#4d4451;">
      Whenever a new briefing is published, it will arrive directly in your inbox. If there is a specific governance or process challenge on your mind in the meantime, feel free to reply directly to this email.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#191c1d;">
      Warm regards,<br />
      <strong>Uche Maduka</strong><br />
      <span style="color:#4d4451;font-size:14px;">Founder, ${escapeHtml(siteConfig.name)}</span>
    </p>
  `;

  const html = renderEmailShell({
    eyebrow: "The Executive Briefing",
    heading: "You are on the list",
    bodyHtml,
  });

  const text = [
    `Welcome to The Executive Briefing.`,
    ``,
    `Thank you for subscribing. I write occasional, practical notes for decision-makers on process audits, governance, internal controls, and catching operational risk before it reaches the financial statements.`,
    ``,
    `Whenever a new briefing is published, it will arrive directly in your inbox. If there is a specific governance or process challenge on your mind in the meantime, feel free to reply directly to this email.`,
    ``,
    `Warm regards,`,
    `Uche Maduka`,
    `Founder, ${siteConfig.name}`,
  ].join("\n");

  return { subject, html, text };
}

export function buildConsultationNotificationEmail(payload: {
  name: string;
  email: string;
  organisation: string;
  notes: string;
  slotDateLabel: string;
  slotTimeLabel: string;
  timeZoneLabel: string;
  durationMinutes: number;
  formattedAmount: string;
  reference: string;
  bookingUid: string;
  meetingUrl?: string;
}): { subject: string; html: string; text: string } {
  const {
    name,
    email,
    organisation,
    notes,
    slotDateLabel,
    slotTimeLabel,
    timeZoneLabel,
    durationMinutes,
    formattedAmount,
    reference,
    bookingUid,
    meetingUrl,
  } = payload;

  const subject = `Paid consultation booked: ${name} (${organisation}) — ${slotDateLabel}`;
  const notesParagraphs = escapeHtml(notes).replace(/\r?\n/g, "<br />");

  const bodyHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;background-color:#f8f9fa;border:1px solid #e1e3e4;border-radius:8px;padding:16px;">
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;width:140px;"><strong>Client</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;">${escapeHtml(name)} (${escapeHtml(organisation)})</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Work email</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;"><a href="mailto:${escapeHtml(email)}" style="color:#3e0064;text-decoration:underline;">${escapeHtml(email)}</a></td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Scheduled slot</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;"><strong>${escapeHtml(slotDateLabel)}</strong> at <strong>${escapeHtml(slotTimeLabel)} (${escapeHtml(timeZoneLabel)})</strong> · ${durationMinutes} mins</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Fee paid</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;">${escapeHtml(formattedAmount)} (Ref: <code>${escapeHtml(reference)}</code>)</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Booking UID</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;"><code>${escapeHtml(bookingUid)}</code></td>
      </tr>
      ${
        meetingUrl
          ? `<tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Meeting link</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;"><a href="${escapeHtml(meetingUrl)}" style="color:#3e0064;text-decoration:underline;">${escapeHtml(meetingUrl)}</a></td>
      </tr>`
          : ""
      }
    </table>
    <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#4d4451;">
      Consultation agenda &amp; notes
    </p>
    <div style="margin:0;padding:16px;background-color:#ffffff;border:1px solid #e1e3e4;border-radius:8px;font-size:15px;line-height:1.65;color:#191c1d;">
      ${notesParagraphs}
    </div>
  `;

  const html = renderEmailShell({
    eyebrow: "Paid Consultation Confirmed",
    heading: `${name} from ${organisation}`,
    bodyHtml,
  });

  const text = [
    `Paid consultation booked`,
    ``,
    `Client: ${name} (${organisation})`,
    `Email: ${email}`,
    `When: ${slotDateLabel} at ${slotTimeLabel} (${timeZoneLabel}) (${durationMinutes} mins)`,
    `Fee paid: ${formattedAmount} (Ref: ${reference})`,
    `Booking UID: ${bookingUid}`,
    ...(meetingUrl ? [`Meeting link: ${meetingUrl}`] : []),
    ``,
    `Agenda & notes:`,
    notes,
  ].join("\n");

  return { subject, html, text };
}

export function buildConsultationConfirmationEmail(payload: {
  name: string;
  organisation: string;
  slotDateLabel: string;
  slotTimeLabel: string;
  timeZoneLabel: string;
  durationMinutes: number;
  formattedAmount: string;
  reference: string;
  meetingUrl?: string;
}): { subject: string; html: string; text: string } {
  const {
    name,
    organisation,
    slotDateLabel,
    slotTimeLabel,
    timeZoneLabel,
    durationMinutes,
    formattedAmount,
    reference,
    meetingUrl,
  } = payload;

  const subject = `Consultation confirmed: ${slotDateLabel} at ${slotTimeLabel} | ${siteConfig.name}`;

  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:#191c1d;">
      Hello ${escapeHtml(name)},
    </p>
    <p style="margin:0 0 20px 0;font-size:16px;line-height:1.65;color:#4d4451;">
      Your payment has been received and your founder consultation with Uche Maduka regarding <strong>${escapeHtml(organisation)}</strong> is confirmed.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;background-color:#f8f9fa;border:1px solid #e1e3e4;border-radius:8px;padding:16px;">
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;width:130px;"><strong>Date</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;"><strong>${escapeHtml(slotDateLabel)}</strong></td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Time</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;"><strong>${escapeHtml(slotTimeLabel)} (${escapeHtml(timeZoneLabel)})</strong> · ${durationMinutes} minutes</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Amount paid</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;">${escapeHtml(formattedAmount)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Payment ref</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;"><code>${escapeHtml(reference)}</code></td>
      </tr>
      ${
        meetingUrl
          ? `<tr>
        <td style="padding:6px 0;font-size:14px;color:#4d4451;"><strong>Meeting link</strong></td>
        <td style="padding:6px 0;font-size:14px;color:#191c1d;"><a href="${escapeHtml(meetingUrl)}" style="color:#3e0064;text-decoration:underline;">Join video consultation</a></td>
      </tr>`
          : ""
      }
    </table>
    <p style="margin:0 0 24px 0;font-size:16px;line-height:1.65;color:#4d4451;">
      A calendar invitation has also been dispatched to your email address. If you need to share any background documents ahead of our conversation or adjust your slot, simply reply to this email.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#191c1d;">
      Warm regards,<br />
      <strong>Uche Maduka</strong><br />
      <span style="color:#4d4451;font-size:14px;">Founder, ${escapeHtml(siteConfig.name)}</span>
    </p>
  `;

  const html = renderEmailShell({
    eyebrow: "Consultation Confirmed",
    heading: "Your session is scheduled",
    bodyHtml,
  });

  const text = [
    `Hello ${name},`,
    ``,
    `Your payment has been received and your founder consultation with Uche Maduka regarding ${organisation} is confirmed.`,
    ``,
    `Date: ${slotDateLabel}`,
    `Time: ${slotTimeLabel} (${timeZoneLabel}) (${durationMinutes} minutes)`,
    `Amount paid: ${formattedAmount}`,
    `Payment reference: ${reference}`,
    ...(meetingUrl ? [`Meeting link: ${meetingUrl}`] : []),
    ``,
    `A calendar invitation has also been dispatched to your email address. If you need to share any background documents ahead of our conversation, simply reply to this email.`,
    ``,
    `Warm regards,`,
    `Uche Maduka`,
    `Founder, ${siteConfig.name}`,
  ].join("\n");

  return { subject, html, text };
}
