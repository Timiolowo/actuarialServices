# Zero-cost pilot deployment plan

## Target architecture

- Frontend: Render Static Site.
- Backend: Render Free Node Web Service for the Help Desk only.
- Workbook processing: browser Web Workers with temporary Origin Private File System storage.
- Source and automatic deployments: GitHub repository connected to Render.

The application has no login, user, role, session, or access-control layer. Anyone who can reach the deployed URL can use it, so restrict access at the network or hosting layer if the site must remain internal.

## 1. Security gate

- Keep the GitHub repository private because the application processes company data.
- Keep AI keys and future service secrets out of every `VITE_` variable.
- Confirm `.env` files are ignored and repository secret scanning is clean.
- Configure `APP_ORIGINS` to the exact frontend URL; do not use wildcard CORS in production.

Success check: repository secret scanning finds no password, connection string, or API key.

## 2. Backend service on Render

- Service type: Web Service, Free instance.
- Root directory: `Reserves/backend`.
- Build command: `npm ci`.
- Start command: `npm start`.
- Health check: `/api/health`.
- Environment variables:
  - `NODE_ENV=production`
  - `APP_ORIGINS` set to the exact HTTPS frontend URL
  - `AI_GATEWAY_API_KEY` only if the Help Desk chatbot is enabled

Do not set `PORT`; Render supplies it.

Success check: the public health endpoint returns `200` and the configured frontend can call the API.

## 3. Frontend static site on Render

- Service type: Static Site.
- Root directory: `Reserves/frontend`.
- Build command: `npm ci && npm run build`.
- Publish directory: `dist`.
- Add a rewrite from `/*` to `/index.html` with status `200` for React routing.
- Set `VITE_API_BASE_URL` to the HTTPS Render backend URL.

Success check: refreshing a portfolio route does not return a Render 404.

## 4. End-to-end release checks

1. The landing page opens directly with no login or redirect.
2. Each portfolio opens and all navigation routes load.
3. Combine Sheet processes XLSX and XLSB workbooks locally and downloads a ZIP without workbook-upload network requests.
4. Data Processing updates XLSX, XLSM, and XLSB workbooks locally and downloads its ZIP without workbook-upload network requests.
5. The Help Desk responds when its AI key is configured and shows a clear unavailable message otherwise.
6. An unrelated web origin cannot call the backend.

## 5. Pilot operating limits

- Expect a cold-start delay after the free backend has been idle.
- Workbook-processing limits are determined mainly by the employee's browser and computer.
- Before broad rollout, test the largest approved workbook set on the browsers and computers employees actually use.

Release decision: deploy to a small internal pilot first and expand only after the largest-file, browser-compatibility, secret-scan, and restart-recovery checks pass.
