const crypto = require('node:crypto');
const { readJson, sendJson } = require('../utils/http');
const { CLUB_NAME_SET } = require('../utils/clubs');
const { all, get, run } = require('../utils/database-query');

function createAdminSessions() {
  return new Map();
}

function cookieValue(request, name) {
  const cookie = (request.headers.cookie || '').split(';').map((part) => part.trim());
  const value = cookie.find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : '';
}

function authorized(request, sessions) {
  const token = cookieValue(request, 'clubs_admin');
  const expires = sessions.get(token);
  if (!expires || expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
  return true;
}

async function list(database) {
  const [contacts, memberships, registrations] = await Promise.all([
    all(database, 'SELECT * FROM contact_messages ORDER BY id DESC LIMIT 500'),
    all(database, 'SELECT * FROM membership_applications ORDER BY id DESC LIMIT 500'),
    all(database, 'SELECT * FROM event_registrations ORDER BY id DESC LIMIT 500'),
  ]);
  return { contacts, memberships, registrations };
}

async function handleAdminApiRequest(request, response, database, url, sessions, credentials) {
  try {
    if (request.method === 'POST' && url.pathname === '/api/admin/login') {
      const body = await readJson(request);
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const password = String(body.password || '');
      const expectedEmail = String(credentials.email || '')
        .trim()
        .toLowerCase();
      const expectedPassword = String(credentials.password || '');
      if (!expectedEmail || !expectedPassword) {
        sendJson(response, 503, {
          error:
            'Administrator sign-in has not been configured. Set ADMIN_EMAIL and ADMIN_PASSWORD.',
        });
        return;
      }
      if (email !== expectedEmail || password !== expectedPassword) {
        sendJson(response, 401, { error: 'Email or password is incorrect.' });
        return;
      }
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
      const secure =
        request.socket.encrypted || process.env.NODE_ENV === 'production' ? '; Secure' : '';
      response.setHeader(
        'Set-Cookie',
        `clubs_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`,
      );
      sendJson(response, 200, { message: 'Signed in.' });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/logout') {
      sessions.delete(cookieValue(request, 'clubs_admin'));
      response.setHeader(
        'Set-Cookie',
        'clubs_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
      );
      sendJson(response, 200, { message: 'Signed out.' });
      return;
    }
    if (!authorized(request, sessions)) {
      sendJson(response, 401, { error: 'Please sign in as an administrator.' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/submissions') {
      sendJson(response, 200, await list(database));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/accounts') {
      const accounts = await all(
        database,
        'SELECT id,full_name,email,role,club,course,year,active,created_at FROM accounts ORDER BY role,full_name',
      );
      sendJson(response, 200, { accounts });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/events') {
      const events = await all(
        database,
        'SELECT event_id AS id,title,category,date,status,club FROM club_events ORDER BY title',
      );
      sendJson(response, 200, { events });
      return;
    }
    const eventMatch = url.pathname.match(/^\/api\/admin\/events\/([a-z0-9-]+)$/);
    if (request.method === 'PATCH' && eventMatch) {
      const body = await readJson(request);
      const event = await get(database, 'SELECT event_id FROM club_events WHERE event_id=?', [
        eventMatch[1],
      ]);
      if (!event || !CLUB_NAME_SET.has(body.club)) {
        sendJson(response, 400, { error: 'Choose a valid event and club.' });
        return;
      }
      const clubId = (await get(database, 'SELECT id FROM clubs WHERE name=?', [body.club]))?.id;
      await run(database, 'UPDATE club_events SET club=?,club_id=? WHERE event_id=?', [
        body.club,
        clubId,
        event.event_id,
      ]);
      await run(database, 'UPDATE event_registrations SET club=?,club_id=? WHERE event_id=?', [
        body.club,
        clubId,
        event.event_id,
      ]);
      sendJson(response, 200, { message: 'Event assigned to club.' });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/leaders') {
      const body = await readJson(request);
      const fullName = String(body.fullName || '').trim();
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const club = String(body.club || '');
      if (
        fullName.length < 2 ||
        fullName.length > 120 ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        sendJson(response, 400, { error: 'Enter a valid leader name and email.' });
        return;
      }
      if (!CLUB_NAME_SET.has(club)) {
        sendJson(response, 400, { error: 'Choose a valid club.' });
        return;
      }
      const clubId = (await get(database, 'SELECT id FROM clubs WHERE name=?', [club]))?.id;
      const unusedPasswordHash = crypto.randomBytes(48).toString('hex');
      try {
        const result = await run(
          database,
          "INSERT INTO accounts (full_name,email,password_hash,role,club,club_id) VALUES (?,?,?,'leader',?,?) RETURNING id",
          [fullName, email, unusedPasswordHash, club, clubId],
        );
        sendJson(response, 201, {
          id: Number(result.lastInsertRowid),
          message: 'Club leader account created.',
        });
      } catch (error) {
        if (error.code === '23505' || /UNIQUE constraint failed/i.test(error.message)) {
          sendJson(response, 409, { error: 'An account already uses that email.' });
          return;
        }
        throw error;
      }
      return;
    }
    const accountMatch = url.pathname.match(/^\/api\/admin\/accounts\/(\d+)$/);
    if (request.method === 'PATCH' && accountMatch) {
      const body = await readJson(request);
      const account = await get(database, 'SELECT id,role FROM accounts WHERE id=?', [
        Number(accountMatch[1]),
      ]);
      if (!account) {
        sendJson(response, 404, { error: 'Account not found.' });
        return;
      }
      if (typeof body.active === 'boolean') {
        await run(database, 'UPDATE accounts SET active=? WHERE id=?', [
          body.active ? 1 : 0,
          account.id,
        ]);
        sendJson(response, 200, {
          message: body.active ? 'Account enabled.' : 'Account disabled.',
        });
        return;
      }
      if (account.role !== 'leader' || !CLUB_NAME_SET.has(body.club)) {
        sendJson(response, 400, { error: 'Choose a valid club assignment for a leader account.' });
        return;
      }
      const clubId = (await get(database, 'SELECT id FROM clubs WHERE name=?', [body.club]))?.id;
      await run(database, 'UPDATE accounts SET club=?,club_id=? WHERE id=?', [
        body.club,
        clubId,
        account.id,
      ]);
      sendJson(response, 200, { message: 'Leader club assignment updated.' });
      return;
    }
    const match = url.pathname.match(/^\/api\/admin\/(contacts|memberships|registrations)\/(\d+)$/);
    if (match && request.method === 'PATCH') {
      const body = await readJson(request);
      const config = {
        contacts: ['contact_messages', ['new', 'read', 'resolved']],
        memberships: ['membership_applications', ['pending', 'approved', 'rejected']],
        registrations: ['event_registrations', ['registered', 'attended', 'cancelled']],
      }[match[1]];
      if (!config[1].includes(body.status)) {
        sendJson(response, 400, { error: 'That status is not valid for this submission.' });
        return;
      }
      const result = await run(database, `UPDATE ${config[0]} SET status = ? WHERE id = ?`, [
        body.status,
        Number(match[2]),
      ]);
      if (!result.changes) {
        sendJson(response, 404, { error: 'Submission not found.' });
        return;
      }
      sendJson(response, 200, { message: 'Status updated.' });
      return;
    }
    sendJson(response, 404, { error: 'Admin endpoint not found.' });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status === 500) console.error(error);
    sendJson(response, status, {
      error: status === 500 ? 'Unable to complete admin request.' : error.message,
    });
  }
}

module.exports = { createAdminSessions, handleAdminApiRequest };
