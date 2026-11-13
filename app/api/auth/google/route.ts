import { verifyGoogleToken } from "@/lib/server/auth";
import { errorText, json } from "@/lib/server/near";
import { provisionPlayer } from "@/lib/server/provision";

// Google sign-in: the browser sends the ID token it got from Google, the server verifies it
// (signature, issuer, audience, expiry, email_verified) and provisions the same player account
// the email code flow would have created for that address. No email is sent or trusted.
export async function POST(request: Request) {
  try {
    const { idToken, publicKey } = (await request.json()) as { idToken?: string; publicKey?: string };
    if (!idToken || !publicKey?.startsWith("ed25519:")) return json({ error: "Missing fields" }, 400);

    let email: string;
    try {
      ({ email } = await verifyGoogleToken(idToken));
    } catch (e) {
      return json({ error: errorText(e) }, 401);
    }

    return await provisionPlayer(request, email, publicKey);
  } catch (e) {
    return json({ error: errorText(e) }, 500);
  }
}
