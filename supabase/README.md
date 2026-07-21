# Supabase migrations

`supabase/migrations/` is the database source of truth for SkillForge. Apply migrations through the Supabase CLI or the platform's migration workflow; do not paste a one-shot schema into the SQL editor and then apply the same migration.

The current foundation migrations are deliberately designed for a new SkillForge database. Apply them in timestamp order. The existing `schema.sql` is a legacy, one-shot draft and is not compatible with this migration history: it has overlapping table and type names, a different authorization model, and permissive policies. Do not run both against the same database. Reconcile a populated legacy database with a dedicated, tested data migration before adopting this foundation.

## Applying migrations

For a local Supabase project, use the CLI migration workflow, for example:

```powershell
supabase db reset
```

For a linked remote project, review the SQL and target first, then use the platform's normal migration deployment command, for example:

```powershell
supabase db push
```

These commands are examples only; this repository has not applied the migration to any database.

For the local hosted-project, JWKS, environment, and OAuth configuration sequence, see [the hosted Supabase setup guide](../docs/SUPABASE_HOSTED_SETUP.md).

## Authorization model

SkillForge is BFF-only for application data:

- The browser uses Supabase only for authentication and sends its JWT to the Express backend.
- The backend verifies the JWT, checks ownership, and uses a server-only Supabase secret key with service-role access for application data.
- Every application table has RLS enabled and intentionally has **no** `anon` or `authenticated` policy.
- The migration revokes `anon` and `authenticated` access to the application tables and `public` schema, then grants the service role access.

Do not add a broad `USING (true)` policy or give the browser direct table access to make a screen work. If the authorization boundary changes in the future, add narrowly scoped policies plus cross-tenant tests in a separate reviewed migration.

## Data model boundaries

The foundation normalizes ownership through `(id, user_id, build_id)` foreign keys wherever a record belongs to a build. This prevents a server bug from linking one user's artifact, evidence, proof, or share item to another user's build at the database level. It deliberately stores provider metadata and hashes for AI runs instead of raw prompts, raw model output, credentials, or authorization headers.

Skill levels and proof status are separate:

- `skill_profiles` holds the current evidence-derived level and proof status.
- `skill_assessments` plus `skill_assessment_evidence` preserve the versioned, explainable inputs to each calculated level.
- `external_proofs`, `proof_skill_links`, and `proof_checks` distinguish a user-linked source from later source validation or independent verification.

The database does not let a client make this distinction by itself; the backend is responsible for state transitions and deterministic rubric calculation.

## Public share routes

There is intentionally no public RPC or RLS policy for share pages. A server route should:

1. Receive an opaque, high-entropy link token over HTTPS.
2. Hash it and look up only `share_links.token_digest`; never persist the raw token.
3. Require an active, unexpired link and a published, non-revoked page.
4. Return only the pre-reviewed `share_pages` fields and `share_page_items.public_*` / `publication_snapshot` data.
5. Return the same generic `404` for unknown, expired, rotated, or revoked links, with `noindex` and `noarchive` response metadata.

Never read private evidence cards, artifacts, chats, or internal notes directly into the public response. The migration removes selected share items when an evidence card or external proof is marked revoked; the backend must still make source deletion, skill recalculation, and public-route cache invalidation part of the same deletion/revocation workflow.

## Operational caveats

- The migration assumes standard Supabase roles, including `anon`, `authenticated`, and `service_role`, and uses `pgcrypto` for UUID generation.
- It creates the `auth.users` profile trigger. The migration role must be allowed to create a security-definer function and trigger in the relevant schemas.
- The profile trigger applies to future sign-ups only. If `auth.users` already contains users, backfill `user_profiles` in a separate reviewed migration.
- It creates no capability seed rows and no storage bucket. Seed the controlled capability taxonomy and configure private storage in separate migrations so those changes can be reviewed independently.
- Optional idempotency keys use partial unique indexes, so ordinary records without an idempotency key do not conflict with each other.
- RLS with no client policies is intentional. Backend service-role access is powerful, so server-side ownership checks, input validation, audit logging, and secret handling remain required.
