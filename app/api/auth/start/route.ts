import { codeFor, normalizeEmail, sendCode } from "@/lib/server/auth";
import { allow, clientIp } from "@/lib/server/limits";
import { errorText, json } from "@/lib/server/near";

// Step 1 of email sign-in: send a 6-digit code. Without RESEND_API_KEY (local demo), the code is
// returned as `devCode` and the UI shows it in a "demo mode" note.
export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email" }, 400);
    if (!allow(`code:${clientIp(request)}`, 10, 10 * 60 * 1000)) return json({ error: "Too many codes requested. Wait a few minutes." }, 429);
    const code = codeFor(normalizeEmail(email));
    const sent = await sendCode(email, code);
    return json(sent ? { sent: true } : { sent: false, devCode: code });
  } catch (e) {
    return json({ error: errorText(e) }, 500);
  }
}
