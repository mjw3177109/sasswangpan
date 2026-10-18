# SassWangpan V3 deployment checkpoint

## Supabase (verified 2026-10-18)
- Project: `sasswangpan`
- Project ref: `muwgyscatnkflydqqvro`
- Region: `ap-southeast-1`
- Database version: PostgreSQL 17
- Alembic head: `d7b3a42e9c10`
- Public tables: 19, all have RLS enabled.
- Storage expansion plans: 4 seeded, all inactive with price 0.
- New user storage quota: `20971520` bytes (20 MiB).
- User records at checkpoint: 0.

Do not apply first-run DDL or `Base.metadata.create_all()` again. Future changes should use versioned migrations.

## Remaining release blockers
1. Git branch `supabase-vercel-free-stack` does not yet contain the complete source tree; run `PUBLISH_GITHUB_V3.bat` from the full release archive and verify `backend/`, `frontend/` and `vercel.json` appear on GitHub.
2. Vercel connection can read the account, but the required team access remains unavailable. Re-authorize the team/project scope; do not substitute another existing team.
3. Provide production environment secrets only in the provider dashboard: PostgreSQL transaction pooler URL, Redis, SMTP, R2, and session signing secret.
4. Run a preview build, endpoint health checks, login/upload and admin access tests before enabling public release.
5. Payments remain disabled for this test release; Vercel Hobby is not suitable for commercial paid storage plans.

No secrets are stored in this document.
