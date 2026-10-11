import nodemailer, { type Transporter } from "nodemailer"

// Mail goes out over SMTP. Set RHENKO_SMTP_URL (for example smtps://user:password@smtp.example.com:465) and
// RHENKO_MAIL_FROM for the sender. Outside production, without SMTP, the message is printed to the server log
// so the flow can be tried locally. In production without SMTP, email features say they are not set up.

export type MailResult = { ok: true } | { ok: false; error: string }

type Globals = { __rhenkoMailer?: { url: string; transport: Transporter } }
const globals = globalThis as unknown as Globals

export function mailConfigured(): boolean {
  return Boolean(process.env.RHENKO_SMTP_URL)
}

function transportFor(url: string): Transporter {
  if (!globals.__rhenkoMailer || globals.__rhenkoMailer.url !== url) {
    globals.__rhenkoMailer = { url, transport: nodemailer.createTransport(url) }
  }
  return globals.__rhenkoMailer.transport
}

export async function sendMail(input: { to: string; subject: string; text: string }): Promise<MailResult> {
  const url = process.env.RHENKO_SMTP_URL
  if (!url) {
    if (process.env.NODE_ENV === "production") return { ok: false, error: "Email isn't set up on this server yet." }
    console.info(`[mail] to ${input.to}: ${input.subject}\n${input.text}`)
    return { ok: true }
  }
  try {
    await transportFor(url).sendMail({
      from: process.env.RHENKO_MAIL_FROM || "Rhenko <no-reply@localhost>",
      to: input.to,
      subject: input.subject,
      text: input.text,
    })
    return { ok: true }
  } catch (error) {
    console.error("[mail] send failed", error)
    return { ok: false, error: "We couldn't send that email. Try again in a moment." }
  }
}
