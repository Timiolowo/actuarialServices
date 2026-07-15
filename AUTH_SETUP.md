# Secure authentication setup

The application code is configured for Neon email-and-password accounts, server-side JWT verification, company-domain enforcement, access requests, and multiple owners.

Before the first live login:

1. Rotate the database password in Neon because the previous connection string was shared in chat.
2. Put the replacement connection string only in `backend/.env` as `DATABASE_URL`. Never add it to the frontend, a `VITE_` variable, source control, or chat.
3. From `Reserves/backend`, run `npm run migrate` once.
4. In Neon Auth, enable Email and Password, require email verification, and add the application URLs to Trusted Origins. For local development, add `http://localhost:5173`. Add the final HTTPS frontend URL before deployment.
5. In Neon Auth, configure a before-user-creation validation webhook to reject email addresses outside the company domain. This prevents unwanted accounts at the identity-provider layer; the application server and database also enforce the same restriction independently.
6. Start the backend and frontend. Every verified session for an email listed in `INITIAL_OWNER_EMAILS` is automatically restored to approved Owner access.

Additional owners can be promoted in the Admin Portal. The configured permanent owner and the last active owner cannot be demoted or revoked.
