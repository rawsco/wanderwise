import { signOut } from "next-auth/react";

/**
 * Signs the user out of both NextAuth (local session cookie) and the Cognito
 * hosted UI session. Without the second step, clicking "Sign in" again
 * silently logs the user back in via the still-valid Cognito SSO cookie.
 *
 * Requires `NEXT_PUBLIC_COGNITO_DOMAIN` and `NEXT_PUBLIC_COGNITO_CLIENT_ID`
 * env vars to be exposed to the client. The `logout_uri` we redirect back
 * to (the app origin) must be in the User Pool Client's `logoutUrls`.
 */
export async function signOutFully(): Promise<void> {
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

  if (!domain || !clientId) {
    await signOut({ callbackUrl: "/" });
    return;
  }

  await signOut({ redirect: false });

  const logoutUri = encodeURIComponent(window.location.origin);
  window.location.href = `https://${domain}/logout?client_id=${clientId}&logout_uri=${logoutUri}`;
}
