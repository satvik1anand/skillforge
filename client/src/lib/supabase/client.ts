import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export const supportedOAuthProviders = ["google", "github"] as const;

export type SupportedOAuthProvider = (typeof supportedOAuthProviders)[number];

type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

let browserClient: SupabaseClient | undefined;

function readPublicSupabaseConfig(): PublicSupabaseConfig | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !publishableKey) {
    return undefined;
  }

  return { url, publishableKey };
}

/**
 * Auth is the only direct Supabase capability in the browser. Application
 * records always travel through the Express API with the user's access token.
 */
export function isSupabaseAuthConfigured(): boolean {
  return readPublicSupabaseConfig() !== undefined;
}

/**
 * OAuth buttons are an opt-in display affordance, not an authorization
 * control. Supabase still independently rejects a provider that has not been
 * enabled in its dashboard. Keeping this allowlist public lets the app avoid
 * presenting a broken sign-in option before provider setup is complete.
 */
export function getConfiguredOAuthProviders(): readonly SupportedOAuthProvider[] {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_OAUTH_PROVIDERS
    ?.split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(
      (provider): provider is SupportedOAuthProvider =>
        supportedOAuthProviders.includes(provider as SupportedOAuthProvider),
    );

  return configured ? Array.from(new Set(configured)) : [];
}

export function createSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  const config = readPublicSupabaseConfig();

  if (!config) {
    throw new Error(
      "Supabase Auth is not configured. Add the public URL and publishable key to client/.env.local.",
    );
  }

  // The installed @supabase/ssr browser client owns the PKCE configuration
  // and can inspect callback URLs. The callback page therefore removes the
  // one-time code before constructing this client, then exchanges that
  // captured in-memory code explicitly.
  browserClient = createBrowserClient(config.url, config.publishableKey);
  return browserClient;
}
