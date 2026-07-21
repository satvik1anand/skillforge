"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  createSupabaseBrowserClient,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/client";
import { pendingConfirmationEmailStorageKey } from "@/lib/auth/confirmation";

import styles from "./confirmation-pending.module.css";

type ResendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "problem"; message: string };

export function ConfirmationPending() {
  const [email, setEmail] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [resendState, setResendState] = useState<ResendState>({ kind: "idle" });

  useEffect(() => {
    try {
      setEmail(window.sessionStorage.getItem(pendingConfirmationEmailStorageKey));
    } catch {
      setEmail(null);
    }
    setOrigin(window.location.origin);
  }, []);

  async function resendConfirmation() {
    if (!email || !isSupabaseAuthConfigured()) {
      setResendState({
        kind: "problem",
        message:
          "Return to create an account to request another confirmation email.",
      });
      return;
    }

    setResendState({ kind: "sending" });

    try {
      const { error } = await createSupabaseBrowserClient().auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: new URL(
            "/auth/callback",
            window.location.origin,
          ).toString(),
        },
      });

      if (error) {
        throw error;
      }

      setResendState({ kind: "sent" });
    } catch {
      setResendState({
        kind: "problem",
        message:
          "We could not send another confirmation email just now. Please wait a moment and try again.",
      });
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="confirmation-title">
        <Link className="brand" href="/" aria-label="SkillForge home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>SkillForge</span>
        </Link>

        <p className="eyebrow">Confirmation pending</p>
        <h1 id="confirmation-title">Check your inbox to continue.</h1>
        <p className={styles.lede}>
          {email ? (
            <>
              We sent a confirmation link to <strong>{email}</strong>. Open it to
              activate your workspace.
            </>
          ) : (
            "We sent a confirmation link to the email address you used to create your account. Open it to activate your workspace."
          )}
        </p>

        <ol className={styles.steps}>
          <li>Find the message from SkillForge or Supabase, including spam or junk.</li>
          <li>Open its confirmation link in this same browser and local address.</li>
          <li>SkillForge will complete sign-in and open your workspace.</li>
        </ol>

        <p className={styles.hint}>
          {origin ? (
            <>
              This sign-up uses a browser-bound security check. Keep using <code>{origin}</code>{" "}
              for the confirmation step; switching between <code>localhost</code> and{" "}
              <code>127.0.0.1</code> counts as a different address.
            </>
          ) : (
            "This sign-up uses a browser-bound security check, so finish confirmation in the same browser and local address you used to sign up."
          )}
        </p>

        {resendState.kind === "sent" ? (
          <p className={styles.success} role="status">
            Another confirmation email has been requested. Check the newest message.
          </p>
        ) : null}
        {resendState.kind === "problem" ? (
          <p className={styles.error} role="alert">
            {resendState.message}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            className="button button-primary"
            disabled={resendState.kind === "sending" || !email}
            onClick={() => void resendConfirmation()}
            type="button"
          >
            {resendState.kind === "sending"
              ? "Sending..."
              : "Resend confirmation email"}
          </button>
          <Link className={styles.secondaryAction} href="/login">
            I&apos;ve confirmed — sign in
          </Link>
          <Link className={styles.backLink} href="/signup">
            Use a different email address
          </Link>
        </div>
      </section>
    </main>
  );
}
