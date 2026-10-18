# V3 Vercel preview deployment / go-live checklist

## Verified on 2026-10-18

- Repo: `mjw3177109/sasswangpan`; source branch: `supabase-vercel-free-stack`.
- GitHub Actions `V3 quality gate` passed on complete source commit `30db37097ef02ab30209d2171e3400cadcf647e1`.
- Supabase project: `muwgyscatnkflydqqvro`, Singapore. Alembic head `d7b3a42e9c10`, 19 tables, new user free quota 20 MiB, four expansion plans disabled.
- Vercel connected account: current request to create a project in team `bobos-projects-e9f8bfba` (ID `team_ST1NqwJsPhN0d9FW4igabIbA`) returns HTTP 403. Project and preview URL have NOT been created.
- Do not select a different team or turn on paid plans to evade permissions.

## Vercel authorization and preview creation

1. Verify the exact team under the Vercel Dashboard account/team switcher; confirm the current ChatGPT Vercel connection has access to `bobos-projects-e9f8bfba`. If not, reauthorize or ask a team owner to grant permission. Do not paste API tokens into chat.
2. Link the GitHub repository to a new Vercel project in that team, from the repo **root directory**.
3. Set the Vercel Framework Preset to **Services**, as the root `vercel.json` uses the `services` configuration for Vite `frontend/` and FastAPI `backend/`.
4. Build only from the branch `supabase-vercel-free-stack` as **Preview**; do not deploy `main` and do not promote to production until authenticated acceptance tests pass.
5. Use protected preview access where available.

## Vercel Preview environment variables

Set the following plain values in **Project → Settings → Environment Variables → Preview**:

```env
APP_ENV=production
PAYMENTS_ENABLED=false
DEFAULT_USER_STORAGE_QUOTA_BYTES=20971520
FREE_STORAGE_GLOBAL_CAP_BYTES=9000000000
EMAIL_CODE_TTL_SECONDS=600
```

Set these variables using real values/secrets **only in Vercel, never in GitHub or chat**:

| Variable | Where to obtain |
| --- | --- |
| `DATABASE_URL` | Supabase project → Connect → **Transaction pooler** URI on port 6543. Use the real database password, not Supabase's public API URL or publishable key. |
| `SESSION_SECRET` | Generate cryptographically random >= 32-byte secret. Keep stable across deploys. |
| `REDIS_URL` | TLS Redis URL from your Redis provider such as Upstash. |
| `FRONTEND_ORIGIN`, `FRONTEND_ORIGINS` | Actual preview origin after it is assigned. Same origin should be used for cookies and CORS. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_SSL`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | Verified sending domain and SMTP provider such as Resend. |
| `STORAGE_PROVIDER=r2`, `STORAGE_BUCKET`, `STORAGE_ENDPOINT_URL`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION=auto` | Cloudflare R2 bucket and S3 credentials. Configure bucket CORS for the preview origin's signed browser PUTs. |
| `SITE_ADMIN_EMAILS` | The real intended site-admin login email(s). |

**No mock/stub database URLs**, no real payment credentials and no local filesystem object storage in the deployed preview. If a dependency is unavailable, keep the preview unapproved until it is connected and tested.

## Acceptance

After the preview URL exists, open **Actions → V3 preview smoke test → Run workflow** and input the real `https://*.vercel.app` URL. The read-only test checks:
- `/`: SPA HTML loads
- `/admin/storage`: SPA deep-link works
- `/api/ping`: API returns pong
- `/api/health`: Postgres and Redis both healthy

Manual E2E checks remain mandatory: signup email, register/login/logout and cookie persistence; create/update/reload notes; 20 MiB quota enforcement; R2 signed upload/download; expansion request; admin 403 for regular users; and payments disabled.

Do not mark preview as **fully accepted** until E2E tests and runtime logs pass. GitHub CI alone only proves builds and static code checks.

## Important limits

Vercel Hobby is restricted to **personal non-commercial** use. Real paid storage expansion requires a commercial-appropriate plan or another compatible hosting provider.

The backend currently fails open when Redis-backed rate limiting is unavailable. This is one reason not to expose the app to uncontrolled public traffic without working Redis, monitoring, and abuse protection.
