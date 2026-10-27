import nodemailer, { type Transporter } from "nodemailer"

// Mail goes out over SMTP. Set RHENKO_SMTP_URL (for example smtps://user:password@smtp.example.com:465) and
// RHENKO_MAIL_FROM for the sender. Outside production, without SMTP, the message is printed to the server log
// so the flow can be tried locally. In production without SMTP, email features say they are not set up. A message may also
// carry an HTML part and extra headers (the daily digest sets both, for its List-Unsubscribe link).

export type MailResult = { ok: true } | { ok: false; error: string }

type Globals = { __rhenkoMailer?: { url: string; transport: Transporter } }
const globals = globalThis as unknown as Globals

export function mailConfigured(): boolean {
  return Boolean(process.env.RHENKO_SMTP_URL)
}

function transportFor(url: string): Transporter {
  if (!globals.__rhenkoMailer || globals.__rhenkoMailer.url !== url) {
    // A mail server that stops answering must not hold a send for the library's default of minutes: the digest sends a batch.
    globals.__rhenkoMailer = {
      url,
      transport: nodemailer.createTransport({ url, connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 60_000 }),
    }
  }
  return globals.__rhenkoMailer.transport
}

export type MailInput = { to: string; subject: string; text: string; html?: string; headers?: Record<string, string> }

export async function sendMail(input: MailInput): Promise<MailResult> {
  const url = process.env.RHENKO_SMTP_URL
  if (!url) {
    if (process.env.NODE_ENV === "production") return { ok: false, error: "Email isn't set up on this server yet." }
    const extra = Object.entries(input.headers ?? {}).map(([name, value]) => `${name}: ${value}\n`).join("")
    console.info(`[mail] to ${input.to}: ${input.subject}\n${extra}${input.text}`)
    return { ok: true }
  }
  try {
    await transportFor(url).sendMail({
      from: process.env.RHENKO_MAIL_FROM || "Rhenko <no-reply@localhost>",
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
    })
    return { ok: true }
  } catch (error) {
    console.error("[mail] send failed", error)
    return { ok: false, error: "We couldn't send that email. Try again in a moment." }
  }
}
