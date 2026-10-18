// Send the "verify your email" link. We ask Firebase to bring the user back
// to this site afterwards — but Firebase only allows that for domains on its
// Authorized domains list. On any other domain (a new preview URL, say) it
// refuses with auth/unauthorized-continue-uri and NO email goes out, so we
// retry without the return link: the email still arrives, and the link opens
// Firebase's own "email verified" page instead of the app.
import { sendEmailVerification, type User } from "firebase/auth";

export async function sendVerifyEmail(user: User) {
  try {
    await sendEmailVerification(user, { url: `${window.location.origin}/` });
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (code.includes("unauthorized-continue-uri") || code.includes("invalid-continue-uri"))
      await sendEmailVerification(user);
    else throw e;
  }
}
