import { createSupabaseBrowserClient, isSupabaseAuthConfigured } from "./supabase/client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export class ApiConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ApiConfigurationError";
  }
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!isSupabaseAuthConfigured()) {
    throw new ApiConfigurationError(
      "Supabase Auth is not configured, so an authenticated API request cannot be made.",
    );
  }

  const {
    data: { session },
  } = await createSupabaseBrowserClient().auth.getSession();

  if (!session?.access_token) {
    throw new ApiConfigurationError(
      "Sign in before making an authenticated API request.",
    );
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);

  return fetch(`${apiUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });
}
