/**
 * Transactional email through Resend's REST API. Only the sign-in code is
 * sent; no profile data ever goes into an email.
 */

const RESEND_URL = "https://api.resend.com/emails";

export type SendResult = { ok: true; id: string | null } | { ok: false; retryable: boolean; error: string };

export function signInEmail(code: string): { subject: string; html: string; text: string } {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid code format");
  const subject = `${code} is your BSL Connect sign-in code`;
  const text = [
    "BSL Connect · MESA School of Business",
    "",
    `Your sign-in code is ${code}`,
    "",
    "Enter it in BSL Connect to continue. It expires in 10 minutes and works once.",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ed">
<div style="font-family:-apple-system,'Segoe UI',Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#15211c;background:#f6f4ed">
<p style="margin:0 0 24px;font-weight:600;color:#12372d">BSL Connect · MESA School of Business</p>
<h1 style="font-weight:500;font-size:24px;margin:0 0 12px;color:#0b241d">Your sign-in code</h1>
<p style="margin:0 0 20px;line-height:1.5">Enter this code in BSL Connect to continue. It expires in 10 minutes and works once.</p>
<p style="font-size:34px;letter-spacing:8px;font-weight:600;margin:0 0 28px;color:#12372d">${code}</p>
<p style="margin:0;font-size:13px;color:#56645d;line-height:1.5">If you didn't request this, you can ignore this email.</p>
</div></body></html>`;
  return { subject, html, text };
}

export async function sendSignInCode(
  to: string,
  code: string,
  opts: { apiKey?: string; from?: string; fetchImpl?: typeof fetch } = {},
): Promise<SendResult> {
  const apiKey = opts.apiKey ?? process.env.RESEND_API_KEY;
  const from = opts.from ?? process.env.EMAIL_FROM;
  const doFetch = opts.fetchImpl ?? fetch;

  if (!apiKey || !from) {
    // Local development only: print the code instead of emailing it.
    if (process.env.NODE_ENV !== "production" && process.env.EMAIL_DEV_LOG === "true") {
      console.info(`[dev email] sign-in code for ${to}: ${code}`);
      return { ok: true, id: null };
    }
    return { ok: false, retryable: false, error: "Email sending isn't configured." };
  }

  const { subject, html, text } = signInEmail(code);
  const body = JSON.stringify({ from, to: [to], subject, html, text });

  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await doFetch(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      return { ok: false, retryable: true, error: "The email service didn't respond." };
    }
    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, id: json.id ?? null };
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    const detail = (await res.json().catch(() => ({}))) as { message?: string; name?: string };
    console.error("[email] Resend rejected the message", res.status, detail.name ?? "", detail.message ?? "");
    return { ok: false, retryable: res.status === 429 || res.status >= 500, error: "We couldn't send the email." };
  }
  return { ok: false, retryable: true, error: "We couldn't send the email." };
}
