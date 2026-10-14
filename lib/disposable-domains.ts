// Mail domains that hand out throwaway inboxes. An account that gives one of these as its email cannot get its codes back
// in any way that proves who owns it, so it is refused as an email. This is a starting list of well-known providers; a
// domain is matched with its subdomains too.
const DISPOSABLE = new Set([
  "10minutemail.com",
  "20minutemail.com",
  "dispostable.com",
  "dropmail.me",
  "emailfake.com",
  "emailondeck.com",
  "fakeinbox.com",
  "fakemail.net",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.biz",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "harakirimail.com",
  "incognitomail.org",
  "maildrop.cc",
  "mailcatch.com",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "mytrashmail.com",
  "sharklasers.com",
  "spamgourmet.com",
  "spambox.us",
  "temp-mail.org",
  "tempmail.com",
  "tempmail.net",
  "tempmailo.com",
  "throwawaymail.com",
  "tmpmail.net",
  "tmpmail.org",
  "trashmail.com",
  "trashmail.net",
  "yopmail.com",
  "yopmail.net",
])

// True when the address is at one of the listed providers, or at a subdomain of one. Expects a trimmed, lower-case address.
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@")
  if (at < 0) return false
  const domain = email.slice(at + 1)
  const labels = domain.split(".")
  for (let index = 0; index < labels.length - 1; index++) {
    if (DISPOSABLE.has(labels.slice(index).join("."))) return true
  }
  return false
}
