const { neon } = require('@neondatabase/serverless');

const AUTH_ERROR_MESSAGE = 'You are not authorised.';
const COMPANY_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();
const INITIAL_OWNER_EMAILS = new Set(
  (process.env.INITIAL_OWNER_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);
const AUTH_BASE_URL = (process.env.NEON_AUTH_BASE_URL || '').replace(/\/$/, '');
const JWKS_URL = process.env.NEON_AUTH_JWKS_URL || `${AUTH_BASE_URL}/.well-known/jwks.json`;
const EXPECTED_ISSUER = process.env.NEON_AUTH_ISSUER || AUTH_BASE_URL;
const EXPECTED_AUDIENCE = process.env.NEON_AUTH_AUDIENCE || AUTH_BASE_URL;

function normalizeDatabaseUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const hasMatchingQuotes = (trimmed.startsWith("'") && trimmed.endsWith("'"))
    || (trimmed.startsWith('"') && trimmed.endsWith('"'));
  return hasMatchingQuotes ? trimmed.slice(1, -1).trim() : trimmed;
}

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
const sql = databaseUrl ? neon(databaseUrl) : null;

let remoteJwks;
const loggedAuthFailures = new Set();

function buildAuthClaimValues(...configuredValues) {
  const values = new Set();
  const add = value => {
    if (typeof value !== 'string' || !value.trim()) return;
    const normalized = value.trim().replace(/\/$/, '');
    values.add(normalized);
    values.add(`${normalized}/`);
  };

  configuredValues.forEach(add);
  try {
    const authUrl = new URL(AUTH_BASE_URL);
    add(authUrl.origin);
    add(`${authUrl.origin}${authUrl.pathname.replace(/\/auth\/?$/, '')}`);
  } catch {
    // Configuration validation below reports malformed URLs.
  }
  return [...values];
}

const EXPECTED_ISSUERS = buildAuthClaimValues(EXPECTED_ISSUER, AUTH_BASE_URL);
const EXPECTED_AUDIENCES = buildAuthClaimValues(EXPECTED_AUDIENCE, AUTH_BASE_URL);

class DatabaseUnavailableError extends Error {
  constructor() {
    super('The access database is not configured.');
    this.statusCode = 503;
  }
}

function requireDatabase() {
  if (!sql) throw new DatabaseUnavailableError();
  return sql;
}

function hasExactCompanyDomain(email) {
  if (!COMPANY_DOMAIN || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  const separatorIndex = normalized.lastIndexOf('@');
  return separatorIndex > 0 && normalized.slice(separatorIndex + 1) === COMPANY_DOMAIN;
}

function identityFromUser(user) {
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  const emailVerified = user?.emailVerified === true || user?.email_verified === true;
  const userId = typeof user?.id === 'string'
    ? user.id
    : typeof user?.sub === 'string'
      ? user.sub
      : '';
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  const roles = typeof user?.role === 'string'
    ? user.role.split(',').map(role => role.trim().toLowerCase())
    : [];
  const neonRole = roles.includes('admin') ? 'admin' : 'member';

  if (!userId || !email || !emailVerified || !hasExactCompanyDomain(email)) {
    const error = new Error(AUTH_ERROR_MESSAGE);
    error.statusCode = 403;
    throw error;
  }

  return { userId, email, name, neonRole };
}

async function verifySessionToken(token) {
  const response = await fetch(`${AUTH_BASE_URL}/get-session`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) throw new Error('Neon Auth rejected the session.');
  const session = await response.json();
  if (!session?.user) throw new Error('Neon Auth session not found.');
  return identityFromUser(session.user);
}

async function verifyToken(token) {
  if (!AUTH_BASE_URL || !JWKS_URL || !EXPECTED_ISSUER || !EXPECTED_AUDIENCE) {
    throw new Error('Neon Auth is not configured.');
  }

  if (token.split('.').length !== 3) return verifySessionToken(token);

  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  if (!remoteJwks) remoteJwks = createRemoteJWKSet(new URL(JWKS_URL));

  const { payload } = await jwtVerify(token, remoteJwks, {
    issuer: EXPECTED_ISSUERS,
    audience: EXPECTED_AUDIENCES,
    clockTolerance: 5
  });

  return identityFromUser(payload);
}

async function authenticateRequest(req, res) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 4096) {
    res.status(401).json({ error: 'Please log in.' });
    return null;
  }

  try {
    return await verifyToken(match[1]);
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 401;
    const code = typeof error.code === 'string' ? error.code : 'AUTH_TOKEN_REJECTED';
    const claim = typeof error.claim === 'string' ? error.claim : undefined;
    const failureKey = `${statusCode}:${code}:${claim || ''}`;
    if (!loggedAuthFailures.has(failureKey)) {
      loggedAuthFailures.add(failureKey);
      console.error('Authentication token rejected.', {
        code,
        claim,
        reason: statusCode === 403 ? 'company_identity_rejected' : 'session_validation_failed'
      });
    }
    res.status(statusCode).json({ error: statusCode === 403 ? AUTH_ERROR_MESSAGE : 'Please log in.' });
    return null;
  }
}

async function getAccessRecord(identity) {
  const nameParts = identity.name.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0]?.length >= 2 ? nameParts[0] : 'Team';
  const surname = nameParts.slice(1).join(' ').length >= 2 ? nameParts.slice(1).join(' ') : 'Member';

  if (INITIAL_OWNER_EMAILS.has(identity.email)) {
    if (sql) {
      try {
        await sql`
          INSERT INTO app_users (auth_user_id, email, first_name, last_name, status, role, requested_at, reviewed_at, updated_at)
          VALUES (${identity.userId}, ${identity.email}, ${firstName}, ${surname}, 'approved', 'owner', NOW(), NOW(), NOW())
          ON CONFLICT (email) DO UPDATE SET
            auth_user_id = EXCLUDED.auth_user_id,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            status = 'approved',
            role = 'owner',
            updated_at = NOW()
        `;
      } catch (error) {
        console.error('Could not synchronise the permanent owner record.');
      }
    }

    return {
      auth_user_id: identity.userId,
      email: identity.email,
      first_name: firstName,
      last_name: surname,
      status: 'approved',
      role: 'owner'
    };
  }

  const database = requireDatabase();
  const assignedRole = identity.neonRole === 'admin' ? 'admin' : 'member';
  await database`
    INSERT INTO app_users (auth_user_id, email, first_name, last_name, status, role, requested_at, reviewed_at, updated_at)
    VALUES (${identity.userId}, ${identity.email}, ${firstName}, ${surname}, 'approved', ${assignedRole}, NOW(), NOW(), NOW())
    ON CONFLICT (email) DO UPDATE SET
      auth_user_id = EXCLUDED.auth_user_id,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      status = 'approved',
      role = CASE WHEN EXCLUDED.role = 'admin' THEN 'admin' ELSE app_users.role END,
      updated_at = NOW()
  `;

  const rows = await database`
    SELECT auth_user_id, email, first_name, last_name, status, role, requested_at, reviewed_at, updated_at
    FROM app_users
    WHERE auth_user_id = ${identity.userId}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function requireCompanyIdentity(req, res, next) {
  try {
    const identity = await authenticateRequest(req, res);
    if (!identity) return;
    req.auth = identity;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireApprovedUser(req, res, next) {
  return requireCompanyIdentity(req, res, next);
}

async function requireAdmin(req, res, next) {
  try {
    const identity = await authenticateRequest(req, res);
    if (!identity) return;
    if (INITIAL_OWNER_EMAILS.has(identity.email) || identity.neonRole === 'admin') {
      req.auth = {
        ...identity,
        role: INITIAL_OWNER_EMAILS.has(identity.email) ? 'owner' : 'admin'
      };
      return next();
    }
    const access = await getAccessRecord(identity);
    if (!access || access.status !== 'approved' || !['owner', 'admin'].includes(access.role)) {
      return res.status(403).json({ error: AUTH_ERROR_MESSAGE });
    }
    req.auth = { ...identity, role: access.role };
    return next();
  } catch (error) {
    return next(error);
  }
}

async function getCurrentAccess(identity) {
  let access = null;
  if (INITIAL_OWNER_EMAILS.has(identity.email) || sql) {
    try {
      access = await getAccessRecord(identity);
    } catch (error) {
      console.error('Could not synchronise the signed-in user record.');
    }
  }

  const nameParts = identity.name.split(/\s+/).filter(Boolean);
  return {
    userId: identity.userId,
    email: identity.email,
    firstName: access?.first_name || nameParts[0] || 'Team',
    lastName: access?.last_name || nameParts.slice(1).join(' ') || 'Member',
    status: 'approved',
    role: INITIAL_OWNER_EMAILS.has(identity.email)
      ? 'owner'
      : identity.neonRole === 'admin'
        ? 'admin'
        : access?.role || 'member'
  };
}

async function listAccessUsers() {
  const database = requireDatabase();
  return database`
    SELECT auth_user_id, email, first_name, last_name, status, role, requested_at, reviewed_at, reviewed_by, updated_at
    FROM app_users
    ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      requested_at DESC
  `;
}

async function listAccessAudit() {
  const database = requireDatabase();
  return database`
    SELECT id, actor_email, target_email, action, created_at
    FROM access_audit
    ORDER BY created_at DESC
    LIMIT 100
  `;
}

async function updateAccessUser(actor, targetUserId, status, role) {
  const database = requireDatabase();
  const allowedStatuses = new Set(['approved', 'rejected', 'revoked']);
  const allowedRoles = new Set(['member', 'admin', 'owner']);
  if (!allowedStatuses.has(status) || !allowedRoles.has(role)) {
    const error = new Error('Invalid access update.');
    error.statusCode = 400;
    throw error;
  }

  const currentRows = await database`
    SELECT auth_user_id, email, first_name, last_name, status, role
    FROM app_users
    WHERE auth_user_id = ${targetUserId}
    LIMIT 1
  `;
  const current = currentRows[0];
  if (!current) {
    const error = new Error('Access request not found.');
    error.statusCode = 404;
    throw error;
  }

  if (current.auth_user_id === actor.userId) {
    const error = new Error('You cannot change your own access from this screen.');
    error.statusCode = 400;
    throw error;
  }


  if (INITIAL_OWNER_EMAILS.has(current.email)) {
    const error = new Error('This permanent owner cannot be changed.');
    error.statusCode = 400;
    throw error;
  }


  if ((role === 'owner' || current.role === 'owner') && actor.role !== 'owner') {
    const error = new Error(AUTH_ERROR_MESSAGE);
    error.statusCode = 403;
    throw error;
  }

  if (current.role === 'owner' && (role !== 'owner' || status !== 'approved')) {
    const ownerCountRows = await database`
      SELECT COUNT(*)::integer AS count
      FROM app_users
      WHERE status = 'approved' AND role = 'owner'
    `;
    if (ownerCountRows[0].count <= 1) {
      const error = new Error('Add another owner before removing this owner.');
      error.statusCode = 400;
      throw error;
    }
  }

  const rows = await database`
    UPDATE app_users
    SET status = ${status}, role = ${role}, reviewed_at = NOW(),
        reviewed_by = ${actor.userId}, updated_at = NOW()
    WHERE auth_user_id = ${targetUserId}
    RETURNING auth_user_id, email, first_name, last_name, status, role, requested_at, reviewed_at, reviewed_by, updated_at
  `;

  const action = current.role !== role
    ? 'role_changed'
    : status === 'approved' && ['rejected', 'revoked'].includes(current.status)
      ? 'restored'
      : status;
  await database`
    INSERT INTO access_audit (actor_user_id, actor_email, target_user_id, target_email, action)
    VALUES (${actor.userId}, ${actor.email}, ${current.auth_user_id}, ${current.email}, ${action})
  `;
  return rows[0];
}

module.exports = {
  AUTH_ERROR_MESSAGE,
  DatabaseUnavailableError,
  getCurrentAccess,
  listAccessAudit,
  listAccessUsers,
  requireAdmin,
  requireApprovedUser,
  requireCompanyIdentity,
  updateAccessUser
};
