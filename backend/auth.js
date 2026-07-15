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
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

let remoteJwks;

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

async function verifyToken(token) {
  if (!AUTH_BASE_URL || !JWKS_URL || !EXPECTED_ISSUER || !EXPECTED_AUDIENCE) {
    throw new Error('Neon Auth is not configured.');
  }

  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  if (!remoteJwks) remoteJwks = createRemoteJWKSet(new URL(JWKS_URL));

  const { payload } = await jwtVerify(token, remoteJwks, {
    issuer: EXPECTED_ISSUER,
    audience: EXPECTED_AUDIENCE,
    clockTolerance: 5
  });

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const emailVerified = payload.emailVerified === true || payload.email_verified === true;
  const userId = typeof payload.sub === 'string' ? payload.sub : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';

  if (!userId || !email || !emailVerified || !hasExactCompanyDomain(email)) {
    const error = new Error(AUTH_ERROR_MESSAGE);
    error.statusCode = 403;
    throw error;
  }

  return { userId, email, name };
}

async function authenticateRequest(req, res) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  if (!match) {
    res.status(401).json({ error: 'Please log in.' });
    return null;
  }

  try {
    return await verifyToken(match[1]);
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 401;
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
  await database`
    INSERT INTO app_users (auth_user_id, email, first_name, last_name, status, role, requested_at, reviewed_at, updated_at)
    VALUES (${identity.userId}, ${identity.email}, ${firstName}, ${surname}, 'approved', 'member', NOW(), NOW(), NOW())
    ON CONFLICT (email) DO UPDATE SET
      auth_user_id = EXCLUDED.auth_user_id,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      status = CASE WHEN app_users.status = 'revoked' THEN 'revoked' ELSE 'approved' END,
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
  try {
    const identity = await authenticateRequest(req, res);
    if (!identity) return;
    const access = await getAccessRecord(identity);
    if (!access || access.status !== 'approved') {
      return res.status(403).json({ error: AUTH_ERROR_MESSAGE });
    }
    req.auth = { ...identity, role: access.role };
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireAdmin(req, res, next) {
  try {
    const identity = await authenticateRequest(req, res);
    if (!identity) return;
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
  const access = await getAccessRecord(identity);
  if (!access) return { ...identity, status: 'none', role: 'member' };
  return {
    userId: identity.userId,
    email: identity.email,
    firstName: access.first_name,
    lastName: access.last_name,
    status: access.status,
    role: access.role
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
