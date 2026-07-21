# Hosted Supabase setup for local integration testing

This guide connects a **fresh, designated** hosted Supabase project to the local SkillForge app. It does not create a project or enable an OAuth provider on your behalf: those actions require the project owner's Supabase and provider accounts.

The repository currently has no linked project, deployed migration, or stored credential. Until these steps are complete, its authentication and Build Brief persistence intentionally remain configuration-gated.

## 1. Create or select the test project

Create a fresh Supabase project in an organization you control, or explicitly designate an existing empty test project. Record its project reference and URL locally. Do not use a production project for the first migration run.

Use current key types from the project API Keys page:

- the browser receives only the publishable key (`sb_publishable_...`);
- the Express server receives only the server secret key (`sb_secret_...`), which has service-role access;
- legacy `anon` and `service_role` values are accepted by the source only to ease migration from older projects.

Never paste a server secret, database password, OAuth client secret, or OpenAI key into chat, source control, browser variables, or a `NEXT_PUBLIC_` value.

## 2. Configure local environment files

Copy the committed templates if the local files do not already exist:

```powershell
Copy-Item client/.env.example client/.env.local
Copy-Item server/.env.example server/.env
```

Set these values in the local files only:

```dotenv
# client/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-project-publishable-key
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SUPABASE_OAUTH_PROVIDERS=google,github
```

```dotenv
# server/.env
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your-server-secret-key
```

`SUPABASE_JWKS_URL` normally stays unset; the API derives it from `SUPABASE_URL`. Do not set both `SUPABASE_SECRET_KEY` and the legacy `SUPABASE_SERVICE_ROLE_KEY`.

Restart `npm run dev` after changing either local environment file. The server health response should then report `authentication` and `supabase` as `configured`, without exposing any values.

## 3. Configure Supabase Auth before testing

In Supabase Authentication URL Configuration, use these exact local values:

| Setting | Local value |
|---|---|
| Site URL | `http://localhost:3000` |
| Redirect URL allow list | `http://localhost:3000/auth/callback` |

For a deployed preview or production app, add its exact HTTPS callback URL separately. Avoid broad wildcard redirects while testing.

In the JWT signing-key settings, activate an asymmetric **ES256** or **RS256** key and confirm the project's JWKS endpoint has a signing key. SkillForge deliberately accepts only those asymmetric algorithms; it does not accept a copied shared `SUPABASE_JWT_SECRET`.

Choose the email-confirmation policy you want to test. The sign-up form handles both an immediate session and a confirmation-email flow; confirmation redirects also return through `/auth/callback`.

## 4. Apply the migration source once, in order

The only migration source for this test project is:

1. `supabase/migrations/202607190001_initial_foundation.sql`
2. `supabase/migrations/202607190002_build_brief_constraints.sql`

Do **not** apply `supabase/schema.sql`; it is a legacy one-shot draft with overlapping schema and a different authorization model.

The recommended route is the Supabase CLI. This repository has migrations but no `supabase/config.toml` yet, so initialize that non-secret CLI configuration first. After installing/authenticating the CLI in your own account and confirming the target project reference, review the pending change before applying it:

```powershell
supabase init
supabase login
supabase link --project-ref your-project-ref
supabase db push --dry-run
supabase db push
```

`supabase init` creates `supabase/config.toml`; it is safe to commit only while it contains no secrets. The final `db push` command is a real remote database write. Run it only after the dry run names the intended fresh project and the SQL has been reviewed. If the project already contains data, stop and create a dedicated migration plan rather than mixing this foundation with existing tables.

## 5. Enable Google and GitHub sign-in (optional, recommended)

SkillForge supports a small, deliberate OAuth MVP: **Google** and **GitHub** are sign-in conveniences only. They do not request repository access, import work, create proof, or change a user's proof status.

### Google

1. In Google Cloud, configure the consent screen and create a Web application OAuth client.
2. Add `http://localhost:3000` as an authorized JavaScript origin for local testing.
3. Set the OAuth client's redirect URI to the **Supabase callback**, not the SkillForge callback: `https://your-project-ref.supabase.co/auth/v1/callback`.
4. In Supabase Authentication Providers, enable Google and enter the Google client ID and client secret.
5. Keep `http://localhost:3000/auth/callback` in Supabase's redirect allow list from step 3.

### GitHub

1. Create a GitHub OAuth App with a local homepage URL.
2. Set its Authorization callback URL to the **Supabase callback**: `https://your-project-ref.supabase.co/auth/v1/callback`.
3. In Supabase Authentication Providers, enable GitHub and enter the GitHub client ID and client secret.
4. Keep `http://localhost:3000/auth/callback` in Supabase's redirect allow list from step 3.

Only add `NEXT_PUBLIC_SUPABASE_OAUTH_PROVIDERS=google,github` after the corresponding provider is enabled. That public variable controls which buttons SkillForge shows; Supabase still enforces the actual provider configuration.

## 6. Deeper-test checklist

With `npm run dev` running:

1. Open `http://localhost:3000`, create an email account or sign in, and confirm the callback returns to `/workspace`.
2. Run `Invoke-WebRequest http://127.0.0.1:4000/health` and confirm the non-sensitive readiness flags report Supabase and authentication as configured.
3. Create a Build Brief, refresh the workspace, and confirm it persists.
4. Create a second account in a private browser window. Verify it cannot retrieve, change, or infer the first account's Build Brief ID.
5. Test Google and GitHub separately: successful sign-in, provider cancellation, a repeat sign-in, and a provider disabled in the dashboard while its button is hidden from the app.
6. Inspect browser network/configuration: neither a server secret nor an OAuth client secret should appear in frontend code, API responses, or logs.

## Troubleshooting boundary

| Symptom | Likely next check |
|---|---|
| OAuth button is absent | Set the public provider list only after enabling that provider in Supabase. |
| OAuth callback shows a generic error | Recheck the Supabase redirect allow list and the provider's callback URI; they are different URLs. |
| API returns `AUTHENTICATION_UNAVAILABLE` | Check the project URL, active asymmetric signing key, and JWKS reachability. |
| API returns `PERSISTENCE_UNAVAILABLE` | Check that `SUPABASE_URL` and the server-only `SUPABASE_SECRET_KEY` are present in `server/.env`, then restart the server. |
| A migration is about to touch unexpected tables | Stop before `db push`; this guide assumes a fresh designated project. |

## Official references

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Google social login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [GitHub social login](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
