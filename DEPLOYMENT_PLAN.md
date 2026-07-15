# Zero-cost pilot deployment plan

## Target architecture

- Frontend: Render Static Site.
- Backend: Render Free Node Web Service.
- Database and authentication: existing Neon project and Neon Auth.
- Source and automatic deployments: GitHub repository connected to Render.

This is suitable for an internal pilot, not a production guarantee. Render states that Free web services are for preview/testing, sleep after 15 idle minutes, can take about one minute to wake, and use an ephemeral filesystem. An in-progress workbook job or undownloaded ZIP can therefore be lost if the service restarts or sleeps.

## 1. Security gate

- Rotate the database password that was previously shared in chat.
- Store the replacement only as the backend `DATABASE_URL` secret.
- Confirm `.env` files are ignored and no connection string exists in Git history.
- Keep `DATABASE_URL`, AI keys, and future webhook secrets out of every `VITE_` variable.
- Make the GitHub repository private because this processes company data.

Success check: repository secret scan returns no database URL, password, or API key.

## 2. Neon preparation

- Enable Email and Password authentication.
- Keep one-time email verification codes enabled.
- Keep the password minimum at 8 characters to match Neon Auth.
- Enable password-reset emails.
- Add the final Render frontend URL to Neon Auth Trusted Origins and redirect URLs.
- Run `npm run migrate` from `Reserves/backend` using the rotated server-only `DATABASE_URL`.
- Sign in once with the permanent-owner email and confirm its `app_users` record is `approved / owner`.

Success check: owner receives a verification code, logs in, and `/api/auth/me` reports `approved / owner`.

## 3. Backend service on Render

- Service type: Web Service, Free instance.
- Root directory: `Reserves/backend`.
- Build command: `npm ci`.
- Start command: `npm start`.
- Health check: `/api/health`.
- Required environment variables:
  - `NODE_ENV=production`
  - `DATABASE_URL` (secret)
  - `NEON_AUTH_BASE_URL`
  - `NEON_AUTH_JWKS_URL`
  - `NEON_AUTH_ISSUER`
  - `NEON_AUTH_AUDIENCE`
  - `ALLOWED_EMAIL_DOMAIN=axamansard.com`
  - `INITIAL_OWNER_EMAILS=timilehin.olowolafe@axamansard.com`
  - `APP_ORIGINS` set to the exact HTTPS frontend URL
  - `AI_GATEWAY_API_KEY` only if the Help Desk chatbot will be enabled

Do not set `PORT`; Render supplies it. Free Render services do not support one-off jobs, so run the database migration locally before deployment.

Success check: the public health endpoint returns `200`, while protected endpoints without a token return `401`.

## 4. Frontend static site on Render

- Service type: Static Site.
- Root directory: `Reserves/frontend`.
- Build command: `npm ci && npm run build`.
- Publish directory: `dist`.
- Add a rewrite from `/*` to `/index.html` with status `200` for React routing.
- Build-time environment variables:
  - `VITE_NEON_AUTH_URL` set to the public Neon Auth URL
  - `VITE_API_BASE_URL` set to the HTTPS Render backend URL

Success check: refreshing `/login`, `/admin`, and a portfolio route does not return a Render 404.

## 5. Connect the final URLs

- Update backend `APP_ORIGINS` with the final frontend URL and redeploy.
- Add the same frontend URL to Neon Auth Trusted Origins.
- Confirm password-reset links return to `https://<frontend>/login`.
- Never use wildcard CORS or wildcard Auth origins in production.

Success check: the frontend can call the backend, while an unrelated Origin receives `403`.

## 6. End-to-end release checks

1. Landing page opens without login.
2. Opening a portfolio while signed out redirects to login.
3. A new company user creates an account, enters the emailed verification code, and gains Member access automatically.
4. The permanent owner opens the Admin Portal without requesting access.
5. The owner promotes another user to Admin or Owner.
6. A revoked user is blocked on their next authenticated request.
7. A non-company email receives only the generic unauthorised message.
8. Logout clears the session; password login works without another verification code.
9. Password reset completes from email link to the login page.
10. A small workbook processes and downloads successfully after a cold start.

## 7. Pilot operating limits

- Expect up to about one minute of delay after 15 idle minutes.
- Download generated ZIPs immediately; they are temporary and not durable.
- Do not depend on in-memory job history across backend restarts.
- Watch Render bandwidth, build-minute, and 750-hour limits.
- Before broad company rollout, move the processing backend to a service with no idle sleep and enough memory for the largest approved workbook test.

Release decision: deploy to a small internal pilot first. Promote to broader use only after the largest-file test, access-control test, secret scan, and restart-recovery test pass.
