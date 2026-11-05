# Private team tracking

Teams are private accountability groups of up to 20 onboarded app users. Each
member explicitly joins through an invitation and shares all recorded accepted
submissions, including imports. Every re-solve counts. Leaving or removal removes
that person's activity from subsequent team reads without deleting personal data.

## Deployment

For the **New problems only** filter, apply
`supabase/migrations/202611050001_team_new_problems.sql` after the original teams
migration. This replaces only `team_read`; it changes no tables, columns, or data.
Apply it before deploying the filter UI (the older UI remains compatible).

Under Filters → Solves, choose **New problems only**, then **Apply filters**.
This shows each member's earliest recorded accepted submission per problem across
their entire stored history, not just the selected year. Same-timestamp submissions
are ordered by submission ID to count exactly one event. Both graphs and feed use
this rule before pagination. Earlier imported history can move the first recorded
solve to an earlier date. Without complete imports this is not necessarily the
member's first-ever LeetCode solve. Clear filters restores all solves.

1. Apply `supabase/migrations/202611020001_teams.sql` in the existing project's
   Supabase SQL editor **before deploying this application version**. For a new
   database, `supabase/schema.sql` already includes the migration. Both are safe
   to reapply. No existing submissions or personal RLS policies are changed.
2. Deploy the application with the existing Supabase environment variables.
   The scheduler and LeetCode integration require no changes.
3. Smoke-test with two onboarded accounts and an outsider: create, join, view
   imported history, remove a member, and verify the removed user and outsider
   cannot read the team. Also verify a signup confirmation returns to its invite.
4. Monitor server messages `Team operation failed` and `Team read failed`.
   These contain operation/error codes, never invite tokens or submitted names.

If the UI must be rolled back, leave the additive tables/functions in place and
redeploy the preceding application version. Do not delete personal data.

## Access model

`teams` holds the name, owner, hashed invitation, and timestamps. `team_members`
holds membership and join timestamps. Both use RLS with no direct client table
access. An owner must also be a member (deferred composite foreign key).

Authenticated RPCs are the only team interface:

- `team_list()` returns the caller's team summaries.
- `team_preview(p_hash)` returns only the name for a valid invitation hash.
- `team_manage(p_action, p_team, p_name, p_hash, p_target)` performs creation,
  joining, renaming, invite reset, removal, leave, transfer, and deletion.
- `team_read(p_team, p_filters)` returns member handles, calendar-year options,
  tags, five member daily-count graphs, and up to 26 feed entries (25 displayed
  plus a next-page sentinel). Filters include year, member IDs, difficulty, tag,
  member-page number, optional selected day/member, and an activity cursor.

Every read checks `auth.uid()` membership. Every management action validates the
actor and locks the team row before modifying its members or owner. This makes
capacity enforcement and ownership transfer atomic. Functions have fixed search
paths and explicit grants; existing personal profile/submission RLS remains intact.
Only narrow activity fields cross the team boundary, never auth emails or private
profile, polling, or import-job fields.

The feed uses descending `(submitted_at, user_id, id)` cursors. Counts are computed
in PostgreSQL, so PostgREST's normal row limit cannot truncate history. UTC calendar
years and shared intensity thresholds make member graphs directly comparable.
Filters persist in the URL; selected-day filters affect only the feed. Membership
is evaluated on each request. Already rendered content cannot be remotely erased.

Invite tokens contain 32 random bytes; only SHA-256 hashes are stored. The owner
sees the raw link immediately after creation/reset in the current page's state.
Returning owners reset the link to generate another. Invite acceptance is explicit
and idempotent. Removing a user does not ban them: reset the link as well to prevent
rejoining through that old link. Owners can transfer ownership or delete the team.

## Local validation

Use Node 22.18+ (or Node 24) for the built-in TypeScript stripping in unit tests.

```sh
npm ci
npm test
npm run lint
npm run build
npm run test:e2e
```

`npm test` runs the actual schema and RPCs in PGlite (embedded PostgreSQL), including
RLS/grant isolation, lifecycle transitions, capacity, >1,000-row aggregation,
duplicate imports, UTC/leap-day boundaries, filters, and stable cursor pagination.
PGlite serializes concurrent calls; the competing-join test checks the application
contract, but is not a substitute for a multi-connection production PostgreSQL
lock-contention test.

Browser tests run the application against a localhost-only Supabase protocol
adapter backed by the same SQL. Authentication is fake; no production credentials
or real LeetCode requests are used. The suite covers login return to invitations,
signup/confirmation/onboarding return, joining, outsider denial, graphs, filters, feed paging, mobile overflow, removal,
revoked links, and deletion. It uses installed Microsoft Edge on Windows or
Playwright Chromium elsewhere, in headless mode. The browser suite builds the app
with test-only environment values before starting its production server; Google
Fonts must be reachable during that build. LeetCode handle validation is stubbed
only in the test server process.
Screenshots/traces go to ignored `test-results/`. Real Supabase email delivery,
deployed RLS configuration, and multi-connection races still need a staging smoke
test before deployment.
