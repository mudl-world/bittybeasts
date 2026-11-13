import { checkCode } from "@/lib/server/auth";
import { errorText, json } from "@/lib/server/near";
import { provisionPlayer } from "@/lib/server/provision";

// Step 2 of email sign-in: check the code, then create the player's own account `p<hash>.ROOT`
// with the public key the browser generated. The private key never leaves the player's device;
// there is no seed phrase. Account creation is shared with the Google route (lib/server/provision).
export async function POST(request: Request) {
  try {
    const { email, code, publicKey } = (await request.json()) as { email?: string; code?: string; publicKey?: string };
    if (!email || !code || !publicKey?.startsWith("ed25519:")) return json({ error: "Missing fields" }, 400);
    if (!checkCode(email, code)) return json({ error: "That code didn't match. Try again." }, 401);
    return await provisionPlayer(request, email, publicKey);
  } catch (e) {
    return json({ error: errorText(e) }, 500);
  }
}
