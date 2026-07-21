"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { pendingConfirmationEmailStorageKey } from "@/lib/auth/confirmation";
import {
  createSupabaseBrowserClient,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/client";

import styles from "./callback.module.css";

type CallbackState =
  | { kind: "working" }
  | { kind: "problem"; message: string };

function getCallbackProblemMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("code verifier") || message.includes("pkce")) {
    return "This confirmation link must be opened in the same browser and local address used to create the account. Request a new link if that browser is no longer available.";
  }

  if (message.includes("expired") || message.includes("otp_expired")) {
    return "This confirmation link has expired. Request a new confirmation email and use its newest link.";
  }

  return "Sign-in could not be completed. Try again or use email and password.";
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [state, setState] = useState<CallbackState>({ kind: "working" });
  const hasStartedExchange = useRef(false);

  useEffect(() => {
    // React Strict Mode deliberately replays effects in local development.
    // The first run captures and removes the one-time code, so a second run
    // must not misclassify the scrubbed URL as a failed OAuth callback.
    if (hasStartedExchange.current) {
      return;
    }

    hasStartedExchange.current = true;

    async function completeAuthentication() {
      if (!isSupabaseAuthConfigured()) {
        setState({
          kind: "problem",
          message:
            "Supabase Auth is not configured in this environment, so sign-in could not be completed.",
        });
        return;
      }

      const callbackUrl = new URL(window.location.href);
      const code = callbackUrl.searchParams.get("code");
      const fragmentParameters = new URLSearchParams(
        callbackUrl.hash.startsWith("#")
          ? callbackUrl.hash.slice(1)
          : callbackUrl.hash,
      );
      const accessToken = fragmentParameters.get("access_token");
      const refreshToken = fragmentParameters.get("refresh_token");
      const tokenHash =
        callbackUrl.searchParams.get("token_hash") ||
        fragmentParameters.get("token_hash");
      const tokenType =
        callbackUrl.searchParams.get("type") || fragmentParameters.get("type");
      const providerReturnedError =
        callbackUrl.searchParams.has("error") ||
        callbackUrl.searchParams.has("error_code") ||
        callbackUrl.searchParams.has("error_description") ||
        fragmentParameters.has("error") ||
        fragmentParameters.has("error_code") ||
        fragmentParameters.has("error_description");
      const hasAuthorizationCode = Boolean(code);
      const hasImplicitSession = Boolean(accessToken && refreshToken);
      const hasDirectSignupToken = Boolean(tokenHash && tokenType === "signup");
      const usablePayloadCount = [
        hasAuthorizationCode,
        hasImplicitSession,
        hasDirectSignupToken,
      ].filter(Boolean).length;

      // Remove one-time codes, token hashes, and any implicit-flow session
      // values from visible browser history before creating the browser client.
      // Supabase receives only the in-memory values captured above.
      window.history.replaceState({}, "", callbackUrl.pathname);

      if (providerReturnedError || usablePayloadCount > 1) {
        setState({
          kind: "problem",
          message:
            "Sign-in was cancelled or could not be completed. You can try again or use email and password.",
        });
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        let accessTokenFromSession: string | undefined;

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          if (error || !data.session?.access_token) {
            throw error || new Error("No session was returned for this sign-in.");
          }

          accessTokenFromSession = data.session.access_token;
        } else if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error || !data.session?.access_token) {
            throw error || new Error("No session was returned for this sign-in.");
          }

          accessTokenFromSession = data.session.access_token;
        } else if (tokenHash && tokenType === "signup") {
          // This is reserved for a future, deliberate custom sign-up template.
          // Do not allow recovery, invite, or email-change links to silently
          // become a workspace session on this general callback route.
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: tokenType,
          });

          if (error || !data.session?.access_token) {
            throw error || new Error("No session was returned for this sign-in.");
          }

          accessTokenFromSession = data.session.access_token;
        } else {
          setState({
            kind: "problem",
            message:
              "No usable confirmation result was returned. Open the email link in the same browser and local address used to create your account, or request a new confirmation email.",
          });
          return;
        }

        if (!accessTokenFromSession) {
          throw new Error("No session was returned for this sign-in.");
        }

        try {
          window.sessionStorage.removeItem(pendingConfirmationEmailStorageKey);
        } catch {
          // Session creation must not depend on the optional pending-email UI.
        }
        router.replace("/workspace");
        router.refresh();
      } catch (error) {
        setState({
          kind: "problem",
          message: getCallbackProblemMessage(error),
        });
      }
    }

    void completeAuthentication();
  }, [router]);

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-live="polite">
        <Link className="brand" href="/" aria-label="SkillForge home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>SkillForge</span>
        </Link>

        {state.kind === "working" ? (
          <>
            <p className="eyebrow">Secure sign-in</p>
            <h1>Completing your sign-in</h1>
            <p>Checking your workspace session.</p>
          </>
        ) : (
          <>
            <p className="eyebrow">Sign-in needs another try</p>
            <h1>We could not complete that sign-in.</h1>
            <p>{state.message}</p>
            <Link className="button button-primary" href="/login">
              Return to sign in
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
