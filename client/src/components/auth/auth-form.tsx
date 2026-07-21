"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  createSupabaseBrowserClient,
  getConfiguredOAuthProviders,
  isSupabaseAuthConfigured,
  type SupportedOAuthProvider,
} from "@/lib/supabase/client";
import { pendingConfirmationEmailStorageKey } from "@/lib/auth/confirmation";

import styles from "./auth-form.module.css";

type AuthMode = "sign-in" | "sign-up";

type AuthFormProps = {
  mode: AuthMode;
};

function getFriendlyAuthError(message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invalid login credentials")) {
    return "That email and password combination was not accepted.";
  }

  if (normalizedMessage.includes("email not confirmed")) {
    return "Confirm your email address before signing in.";
  }

  if (normalizedMessage.includes("user already registered")) {
    return "An account already exists for this email. Try signing in instead.";
  }

  return message;
}

const oauthProviderLabels: Record<SupportedOAuthProvider, string> = {
  google: "Google",
  github: "GitHub",
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const authConfigured = isSupabaseAuthConfigured();
  const oauthProviders = getConfiguredOAuthProviders();
  const isSignUp = mode === "sign-up";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setErrorMessage(null);
    setNeedsEmailConfirmation(false);

    if (!authConfigured) {
      setErrorMessage(
        "Supabase Auth is not configured yet. Add the public Supabase URL and key to client/.env.local.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: new URL(
              "/auth/callback",
              window.location.origin,
            ).toString(),
          },
        });

        if (error) {
          setErrorMessage(getFriendlyAuthError(error.message));
          return;
        }

        if (data.session) {
          setNotice("Your account is ready. Opening the workspace.");
          router.replace("/workspace");
          router.refresh();
          return;
        }

        // Keep the address out of the URL while making it available to the
        // dedicated, same-browser confirmation screen.
        try {
          window.sessionStorage.setItem(pendingConfirmationEmailStorageKey, email);
        } catch {
          // The confirmation screen still works without showing the address
          // if browser storage is unavailable.
        }
        router.replace("/signup/confirmation-pending");
        router.refresh();
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setNeedsEmailConfirmation(
          !isSignUp && error.message.toLowerCase().includes("email not confirmed"),
        );
        setErrorMessage(getFriendlyAuthError(error.message));
        return;
      }

      router.replace("/workspace");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Authentication could not be completed. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOAuthSignIn(provider: SupportedOAuthProvider) {
    if (isSubmitting) {
      return;
    }

    setNotice(null);
    setErrorMessage(null);
    setNeedsEmailConfirmation(false);

    if (!authConfigured) {
      setErrorMessage(
        "Supabase Auth is not configured yet. Add the public Supabase URL and key to client/.env.local.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider,
        options: {
          // The callback is fixed rather than accepting arbitrary return URLs,
          // so the first OAuth flow cannot become an open redirect.
          redirectTo: new URL("/auth/callback", window.location.origin).toString(),
        },
      });

      if (error) {
        setErrorMessage(
          "This sign-in option could not be started. Use email and password or try again later.",
        );
      }
    } catch {
      setErrorMessage(
        "This sign-in option could not be started. Use email and password or try again later.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function openConfirmationRecovery() {
    try {
      window.sessionStorage.setItem(pendingConfirmationEmailStorageKey, email);
    } catch {
      // The confirmation screen can still explain the next step, but it cannot
      // safely resend without an address stored in this browser session.
    }

    router.push("/signup/confirmation-pending");
  }

  return (
    <main className={styles.shell}>
      <nav className={styles.nav} aria-label="Account navigation">
        <Link className="brand" href="/" aria-label="SkillForge home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>SkillForge</span>
        </Link>
        <Link className={styles.homeLink} href="/">
          Back to overview
        </Link>
      </nav>

      <section className={styles.content} aria-labelledby="auth-title">
        <div className={styles.intro}>
          <p className="eyebrow">Workspace access</p>
          <h1 id="auth-title">
            {isSignUp ? "Start with the work in front of you." : "Return to your workspace."}
          </h1>
          <p>
            {isSignUp
              ? "SkillForge helps turn the work you capture into a Skill Portfolio you can review and share on your terms."
              : "Sign in to continue working with your projects and approved evidence."}
          </p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeading}>
            <p>{isSignUp ? "Create account" : "Sign in"}</p>
            <span className={authConfigured ? styles.configured : styles.needsSetup}>
              {authConfigured ? "Auth configured" : "Setup required"}
            </span>
          </div>

          {!authConfigured ? (
            <p className={styles.configurationNotice} role="status">
              Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and a public Supabase
              key in <code>client/.env.local</code> before account actions can
              be used.
            </p>
          ) : null}

          {authConfigured && oauthProviders.length > 0 ? (
            <>
              <div className={styles.oauthActions}>
                {oauthProviders.map((provider) => (
                  <button
                    className={styles.oauthButton}
                    disabled={isSubmitting}
                    key={provider}
                    onClick={() => void handleOAuthSignIn(provider)}
                    type="button"
                  >
                    Continue with {oauthProviderLabels[provider]}
                  </button>
                ))}
              </div>
              <p className={styles.oauthDisclosure}>
                This signs in to SkillForge only. It does not import or verify
                your work.
              </p>
              <div className={styles.divider} aria-hidden="true">
                <span />
                <span>or use email</span>
                <span />
              </div>
            </>
          ) : null}

          <form className={styles.form} onSubmit={handleSubmit}>
            <label>
              Email
              <input
                autoComplete="email"
                disabled={!authConfigured || isSubmitting}
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              Password
              <input
                autoComplete={isSignUp ? "new-password" : "current-password"}
                disabled={!authConfigured || isSubmitting}
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>

            {isSignUp ? (
              <p className={styles.disclosure}>
                Depending on this Supabase project&apos;s email-confirmation
                setting, account creation may send a confirmation email rather
                than start a session immediately.
              </p>
            ) : null}

            {errorMessage ? (
              <p className={styles.error} role="alert">
                {errorMessage}
              </p>
            ) : null}
            {needsEmailConfirmation ? (
              <button
                className={styles.confirmationRecovery}
                onClick={openConfirmationRecovery}
                type="button"
              >
                Get a new confirmation email
              </button>
            ) : null}
            {notice ? (
              <p className={styles.notice} role="status">
                {notice}
              </p>
            ) : null}

            <button
              className="button button-primary"
              disabled={!authConfigured || isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? "Working..."
                : isSignUp
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <p className={styles.switchMode}>
            {isSignUp ? "Already have an account?" : "New to SkillForge?"}{" "}
            <Link href={isSignUp ? "/login" : "/signup"}>
              {isSignUp ? "Sign in" : "Create one"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
