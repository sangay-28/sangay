const crypto = require('node:crypto');
const { readJson, sendJson } = require('../utils/http');
const { consumeOtp, isOtpTestModeEnabled, issueOtp } = require('../utils/otp');
const { CLUB_NAME_SET } = require('../utils/clubs');
const { all, get, run } = require('../utils/database-query');

const SESSION_MS = 8 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const otpRequestTimes = new Map();
const otpVerificationWindows = new Map();
const OTP_REQUEST_COOLDOWN_MS = 60_000;
const OTP_VERIFY_WINDOW_MS = 60_000;
const OTP_VERIFY_REQUEST_LIMIT = 10;

function isOtpVerificationRateLimited(key) {
  const now = Date.now();
  for (const [entryKey, entry] of otpVerificationWindows) {
    if (entry.resetAt <= now) otpVerificationWindows.delete(entryKey);
  }
  let entry = otpVerificationWindows.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + OTP_VERIFY_WINDOW_MS };
    otpVerificationWindows.set(key, entry);
  }
  if (entry.count >= OTP_VERIFY_REQUEST_LIMIT) return true;
  entry.count += 1;
  return false;
}

function createPortalSessions() {
  return new Map();
}

function readCookie(request, name) {
  const pair = (request.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}

async function getPortalAccount(request, sessions, database = null) {
  const token = readCookie(request, 'clubs_portal');
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  if (database && session.account.role !== 'admin') {
    const record = await get(
      database,
      'SELECT id,full_name,email,role,club,club_id,course,year,active FROM accounts WHERE id=?',
      [session.account.id],
    );
    if (!record?.active) {
      sessions.delete(token);
      return null;
    }
    session.account = publicAccount(record);
  }
  session.expiresAt = Date.now() + SESSION_MS;
  return session.account;
}

function setPortalCookie(request, response, sessions, account) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { account, expiresAt: Date.now() + SESSION_MS });
  const secure =
    request.socket.encrypted || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const current = response.getHeader('Set-Cookie');
  const cookies = Array.isArray(current) ? current : current ? [current] : [];
  cookies.push(`clubs_portal=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`);
  response.setHeader('Set-Cookie', cookies);
}

function publicAccount(account) {
  return {
    id: Number(account.id),
    fullName: account.full_name,
    email: account.email,
    role: account.role,
    club: account.club,
    clubId: account.club_id == null ? null : Number(account.club_id),
    course: account.course,
    year: account.year,
  };
}

async function handleAuthRequest(request, response, database, url, sessions) {
  try {
    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const account = await getPortalAccount(request, sessions, database);
      if (!account) return sendJson(response, 401, { error: 'Please sign in.' });
      return sendJson(response, 200, { account });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      sessions.delete(readCookie(request, 'clubs_portal'));
      response.setHeader(
        'Set-Cookie',
        'clubs_portal=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
      );
      return sendJson(response, 200, { message: 'Signed out.' });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/request-otp') {
      if (!isOtpTestModeEnabled()) {
        return sendJson(response, 503, {
          error: 'OTP testing mode is disabled. No email delivery service is configured.',
        });
      }
      const body = await readJson(request);
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const purpose = body.purpose;
      const role = purpose === 'signup' ? 'member' : body.role;
      if (
        !EMAIL.test(email) ||
        email.length > 254 ||
        !['login', 'signup'].includes(purpose) ||
        !['member', 'leader'].includes(role)
      ) {
        return sendJson(response, 400, { error: 'Enter a valid email address and account type.' });
      }
      const rateKey = `${request.socket.remoteAddress || 'unknown'}:${purpose}:${email}`;
      if (Date.now() - (otpRequestTimes.get(rateKey) || 0) < OTP_REQUEST_COOLDOWN_MS) {
        return sendJson(response, 429, {
          error: 'Wait one minute before requesting another code.',
        });
      }
      let metadata = null;
      if (purpose === 'signup') {
        metadata = {
          fullName: String(body.fullName || '').trim(),
          course: String(body.course || '').trim(),
          year: Number(body.year),
        };
        if (body.consent !== true)
          return sendJson(response, 400, {
            error: 'Agree to the terms and data-use notice to create an account.',
          });
        if (metadata.fullName.length < 2 || metadata.fullName.length > 120)
          return sendJson(response, 400, { error: 'Enter your full name.' });
        if (metadata.course.length < 2 || metadata.course.length > 120)
          return sendJson(response, 400, { error: 'Enter your course.' });
        if (!Number.isInteger(metadata.year) || metadata.year < 1 || metadata.year > 4)
          return sendJson(response, 400, { error: 'Choose a valid year of study.' });
        if (await get(database, 'SELECT id FROM accounts WHERE LOWER(email)=LOWER(?)', [email]))
          return sendJson(response, 409, { error: 'An account already uses that email.' });
      } else {
        const account = await get(
          database,
          'SELECT id FROM accounts WHERE LOWER(email)=LOWER(?) AND role=? AND active=1',
          [email, role],
        );
        if (!account) {
          otpRequestTimes.set(rateKey, Date.now());
          if (role === 'leader') {
            return sendJson(response, 404, {
              error:
                'No active club leader account uses this email. Ask the Clubs Office to create or enable your leader account first.',
            });
          }
          return sendJson(response, 404, {
            error: 'No active member account uses this email. Create an account first.',
          });
        }
      }
      const { code } = await issueOtp(database, { email, role, purpose, metadata });
      otpRequestTimes.set(rateKey, Date.now());
      return sendJson(response, 200, {
        message: 'Your verification code is ready. Enter the code displayed below.',
        warning: 'Test mode codes do not verify email ownership.',
        testCode: code,
      });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
      if (!isOtpTestModeEnabled()) {
        return sendJson(response, 503, {
          error: 'OTP testing mode is disabled. No email delivery service is configured.',
        });
      }
      const body = await readJson(request);
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const purpose = body.purpose;
      const role = purpose === 'signup' ? 'member' : body.role;
      const code = String(body.code || '');
      if (
        !EMAIL.test(email) ||
        !['login', 'signup'].includes(purpose) ||
        !['member', 'leader'].includes(role) ||
        !/^\d{6}$/.test(code)
      ) {
        return sendJson(response, 400, { error: 'Enter the six-digit verification code.' });
      }
      const verifyRateKey = `${request.socket.remoteAddress || 'unknown'}:${email}:${role}:${purpose}`;
      if (isOtpVerificationRateLimited(verifyRateKey)) {
        return sendJson(response, 429, {
          error: 'Too many verification attempts. Wait one minute and try again.',
        });
      }
      const verified = await consumeOtp(database, { email, role, purpose, code });
      if (!verified)
        return sendJson(response, 400, {
          error: 'That code is invalid or expired. Request a new one.',
        });
      let record;
      if (purpose === 'signup') {
        const profile = verified.metadata;
        if (
          !profile ||
          (await get(database, 'SELECT id FROM accounts WHERE LOWER(email)=LOWER(?)', [email]))
        ) {
          return sendJson(response, 409, {
            error: 'An account already uses that email. Please sign in.',
          });
        }
        const randomPasswordValue = crypto.randomBytes(48).toString('hex');
        const result = await run(
          database,
          `INSERT INTO accounts (full_name,email,password_hash,role,course,year)
          VALUES (?,?,?,'member',?,?) RETURNING id`,
          [profile.fullName, email, randomPasswordValue, profile.course, profile.year],
        );
        record = await get(database, 'SELECT * FROM accounts WHERE id=?', [
          Number(result.lastInsertRowid),
        ]);
      } else {
        record = await get(
          database,
          'SELECT * FROM accounts WHERE LOWER(email)=LOWER(?) AND role=? AND active=1',
          [email, role],
        );
        if (!record)
          return sendJson(response, 401, {
            error: 'This account is not active. Contact the Clubs Office.',
          });
        if (role === 'leader' && (!CLUB_NAME_SET.has(record.club) || !record.club_id)) {
          return sendJson(response, 403, {
            error:
              'This leader account does not have a valid assigned club. Contact the Clubs Office.',
          });
        }
      }
      setPortalCookie(request, response, sessions, publicAccount(record));
      return sendJson(response, purpose === 'signup' ? 201 : 200, {
        account: publicAccount(record),
      });
    }
    sendJson(response, 404, { error: 'Authentication endpoint not found.' });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status === 500) console.error(error);
    sendJson(response, status, {
      error: status === 500 ? 'Unable to complete sign-in request.' : error.message,
    });
  }
}

async function handlePortalRequest(request, response, database, url, sessions) {
  const account = await getPortalAccount(request, sessions, database);
  const role = url.pathname.startsWith('/api/leader/') ? 'leader' : 'member';
  if (!account || account.role !== role) {
    sendJson(response, 401, { error: `Please sign in as a ${role}.` });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/member/dashboard') {
    sendJson(response, 200, {
      account,
      memberships: await all(
        database,
        'SELECT id,course,year,club,status,created_at FROM membership_applications WHERE account_id=? ORDER BY id DESC',
        [account.id],
      ),
      registrations: await all(
        database,
        'SELECT id,event_id,status,created_at FROM event_registrations WHERE account_id=? ORDER BY id DESC',
        [account.id],
      ),
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/leader/dashboard') {
    if (!account.clubId || !CLUB_NAME_SET.has(account.club)) {
      sendJson(response, 403, {
        error: 'Your leader account does not have an assigned club. Contact the Clubs Office.',
      });
      return;
    }
    const events = await all(
      database,
      'SELECT event_id AS id,title,category,date,status FROM club_events WHERE club_id=? ORDER BY title',
      [account.clubId],
    );
    const clubEvents = await Promise.all(
      events.map(async (event) => ({
        ...event,
        registrations: (
          await get(
            database,
            `SELECT COUNT(*) AS count FROM event_registrations registrations
        INNER JOIN club_events events ON events.event_id=registrations.event_id
        WHERE events.club_id=? AND registrations.event_id=?`,
            [account.clubId, event.id],
          )
        ).count,
      })),
    );
    const [
      members,
      memberships,
      eventActivity,
      approvedMembers,
      pendingApplications,
      totalApplications,
      eventRegistrations,
    ] = await Promise.all([
      all(
        database,
        "SELECT id,full_name,email,course,year,club,status,created_at FROM membership_applications WHERE club_id=? AND status='approved' ORDER BY id DESC LIMIT 500",
        [account.clubId],
      ),
      all(
        database,
        'SELECT id,full_name,email,course,year,club,status,created_at FROM membership_applications WHERE club_id=? ORDER BY id DESC LIMIT 500',
        [account.clubId],
      ),
      all(
        database,
        `SELECT registrations.id,registrations.first_name,registrations.last_name,registrations.student_id,
        registrations.email,registrations.event_id,registrations.status,registrations.created_at
        FROM event_registrations registrations
        INNER JOIN club_events events ON events.event_id=registrations.event_id
        WHERE events.club_id=? ORDER BY registrations.id DESC LIMIT 500`,
        [account.clubId],
      ),
      get(
        database,
        "SELECT COUNT(*) AS count FROM membership_applications WHERE club_id=? AND status='approved'",
        [account.clubId],
      ),
      get(
        database,
        "SELECT COUNT(*) AS count FROM membership_applications WHERE club_id=? AND status='pending'",
        [account.clubId],
      ),
      get(database, 'SELECT COUNT(*) AS count FROM membership_applications WHERE club_id=?', [
        account.clubId,
      ]),
      get(
        database,
        `SELECT COUNT(*) AS count FROM event_registrations registrations
        INNER JOIN club_events events ON events.event_id=registrations.event_id WHERE events.club_id=?`,
        [account.clubId],
      ),
    ]);
    sendJson(response, 200, {
      account,
      members,
      memberships,
      events: clubEvents,
      eventActivity,
      stats: {
        approvedMembers: approvedMembers.count,
        pendingApplications: pendingApplications.count,
        totalApplications: totalApplications.count,
        eventRegistrations: eventRegistrations.count,
      },
    });
    return;
  }
  const match = url.pathname.match(/^\/api\/leader\/memberships\/(\d+)$/);
  if (match && request.method === 'PATCH') {
    try {
      const body = await readJson(request);
      if (!['pending', 'approved', 'rejected'].includes(body.status))
        return sendJson(response, 400, { error: 'Choose a valid application status.' });
      const result = await run(
        database,
        'UPDATE membership_applications SET status=? WHERE id=? AND club_id=?',
        [body.status, Number(match[1]), account.clubId],
      );
      if (!result.changes)
        return sendJson(response, 404, { error: 'Application not found for your club.' });
      sendJson(response, 200, { message: 'Application updated.' });
    } catch (error) {
      const status = error.statusCode || 500;
      sendJson(response, status, {
        error: status === 500 ? 'Unable to update application.' : error.message,
      });
    }
    return;
  }
  sendJson(response, 404, { error: 'Portal endpoint not found.' });
}

module.exports = {
  createPortalSessions,
  getPortalAccount,
  handleAuthRequest,
  handlePortalRequest,
  setPortalCookie,
};
