const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { createApplication } = require('../app');
const { initializeDatabase } = require('../config/database');

test('leaders only receive their assigned club data and assignment edits take effect immediately', async (suite) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clubs-leader-'));
  const database = initializeDatabase(path.join(directory, 'test.sqlite'));
  const originalOtpSecret = process.env.OTP_SECRET;
  process.env.OTP_SECRET = 'leader-dashboard-test-secret';
  const adminSessions = new Map([['admin-test', Date.now() + 60_000]]);
  const portalSessions = new Map();
  const server = require('node:http').createServer(
    createApplication(database, process.cwd(), { adminSessions, portalSessions }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  suite.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
    if (originalOtpSecret === undefined) delete process.env.OTP_SECRET;
    else process.env.OTP_SECRET = originalOtpSecret;
  });

  async function request(url, { method = 'GET', body, cookie, redirect } = {}) {
    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(redirect ? { redirect } : {}),
    });
    const text = await response.text();
    let parsedBody = text;
    try { parsedBody = JSON.parse(text); } catch {}
    return {
      status: response.status,
      body: parsedBody,
      cookies: response.headers.getSetCookie(),
      location: response.headers.get('location'),
    };
  }

  async function signIn(email, role) {
    const code = '123456';
    const codeHash = crypto.createHmac('sha256', process.env.OTP_SECRET)
      .update(`${email}:${role}:login:${code}`).digest('hex');
    database.prepare(`INSERT INTO otp_challenges (email,role,purpose,code_hash,expires_at)
      VALUES (?,?,'login',?,?)`).run(email, role, codeHash, Date.now() + 60_000);
    const result = await request('/api/auth/verify-otp', {
      method: 'POST', body: { email, role, purpose: 'login', code },
    });
    const sessionCookie = result.cookies.find((cookie) => cookie.startsWith('clubs_portal='));
    return { ...result, sessionCookie: sessionCookie?.split(';')[0] };
  }

  const adminCookie = 'clubs_admin=admin-test';
  const leaderA = await request('/api/admin/leaders', {
    method: 'POST', cookie: adminCookie,
    body: { fullName: 'Leader A', email: 'leader-a@example.com', club: 'Democracy Club' },
  });
  const leaderB = await request('/api/admin/leaders', {
    method: 'POST', cookie: adminCookie,
    body: { fullName: 'Leader B', email: 'leader-b@example.com', club: 'UN Club' },
  });
  assert.equal(leaderA.status, 201);
  assert.equal(leaderB.status, 201);
  assert.equal(database.prepare('SELECT club_id FROM accounts WHERE id=?').get(leaderA.body.id).club_id,
    database.prepare('SELECT id FROM clubs WHERE name=?').get('Democracy Club').id);

  const applicationA = await request('/api/memberships', {
    method: 'POST', body: { fullName: 'Member A', email: 'member-a@example.com', course: 'Science', year: 2, club: 'Democracy Club', consent: true },
  });
  const duplicateApplicationA = await request('/api/memberships', {
    method: 'POST', body: { fullName: 'Member A', email: 'member-a@example.com', course: 'Science', year: 2, club: 'Democracy Club', consent: true },
  });
  const applicationB = await request('/api/memberships', {
    method: 'POST', body: { fullName: 'Member B', course: 'Arts', year: 1, club: 'UN Club', consent: true },
  });
  assert.equal(applicationA.status, 201);
  assert.equal(duplicateApplicationA.status, 409);
  assert.equal(applicationB.status, 201);

  const clubAId = database.prepare('SELECT id FROM clubs WHERE name=?').get('Democracy Club').id;
  const clubBId = database.prepare('SELECT id FROM clubs WHERE name=?').get('UN Club').id;
  const memberResult = database.prepare(`INSERT INTO accounts (full_name,email,password_hash,role,course,year)
    VALUES ('Event Member','event-member@example.com','unused','member','Science',2)`).run();
  const memberId = Number(memberResult.lastInsertRowid);
  const memberLogin = await signIn('event-member@example.com', 'member');
  assert.equal(memberLogin.status, 200);
  assert.equal(memberLogin.body.account.role, 'member');
  assert.equal((await request('/api/auth/me', { cookie: memberLogin.sessionCookie })).body.account.id, memberId);
  const registrationA = await request('/api/event-registrations', {
    method: 'POST', cookie: memberLogin.sessionCookie, body: {
      firstName: 'Event', lastName: 'Member', studentId: 'TEST001', email: 'event-member@example.com',
      department: 'Science', year: '2nd Year', eventId: 'debate', role: 'Participant', consent: true,
    },
  });
  const registrationB = await request('/api/event-registrations', {
    method: 'POST', cookie: memberLogin.sessionCookie, body: {
      firstName: 'Event', lastName: 'Member', studentId: 'TEST002', email: 'event-member@example.com',
      department: 'Science', year: '2nd Year', eventId: 'model-un', role: 'Participant', consent: true,
    },
  });
  assert.equal(registrationA.status, 201);
  assert.equal(registrationB.status, 201);
  const storedRegistration = database.prepare('SELECT club_id,account_id FROM event_registrations WHERE student_id=?').get('TEST001');
  assert.equal(storedRegistration.club_id, clubAId);
  assert.equal(storedRegistration.account_id, memberId);

  const leaderALogin = await signIn('leader-a@example.com', 'leader');
  const leaderBLogin = await signIn('leader-b@example.com', 'leader');
  assert.equal(leaderALogin.status, 200);
  assert.equal(leaderBLogin.status, 200);
  assert.equal(leaderALogin.body.account.club, 'Democracy Club');
  assert.equal(leaderALogin.body.account.clubId, clubAId);
  assert.equal(leaderBLogin.body.account.clubId, clubBId);
  const leaderACookie = leaderALogin.sessionCookie;
  const leaderBCookie = leaderBLogin.sessionCookie;
  assert.ok(leaderACookie);
  assert.ok(leaderBCookie);
  const memberForbidden = await request('/api/leader/dashboard', { cookie: memberLogin.sessionCookie });
  assert.equal(memberForbidden.status, 401);
  const memberDashboardRedirect = await request('/leader.html', { cookie: memberLogin.sessionCookie, redirect: 'manual' });
  assert.equal(memberDashboardRedirect.status, 302);
  assert.equal(memberDashboardRedirect.location, '/member.html');
  const dashboardA = await request('/api/leader/dashboard', { cookie: leaderACookie });
  const dashboardB = await request('/api/leader/dashboard', { cookie: leaderBCookie });
  const dashboardWithForgedClub = await request('/api/leader/dashboard?clubId=999', { cookie: leaderACookie });
  assert.equal(dashboardA.body.account.clubId, clubAId);
  assert.equal(dashboardWithForgedClub.body.account.clubId, clubAId);
  assert.deepEqual(dashboardA.body.memberships.map((row) => row.id), [applicationA.body.id]);
  assert.deepEqual(dashboardA.body.events.map((event) => event.id), ['debate', 'science-fair']);
  assert.deepEqual(dashboardA.body.eventActivity.map((row) => row.event_id), ['debate']);
  assert.deepEqual(dashboardB.body.memberships.map((row) => row.id), [applicationB.body.id]);
  assert.deepEqual(dashboardB.body.events.map((event) => event.id), ['model-un', 'un-workshop']);
  assert.deepEqual(dashboardB.body.eventActivity.map((row) => row.event_id), ['model-un']);
  assert.equal(dashboardA.body.stats.eventRegistrations, 1);

  const approveOwnClub = await request(`/api/leader/memberships/${applicationA.body.id}`, {
    method: 'PATCH', cookie: leaderACookie, body: { status: 'approved' },
  });
  const rejectOtherClub = await request(`/api/leader/memberships/${applicationB.body.id}`, {
    method: 'PATCH', cookie: leaderACookie, body: { status: 'rejected' },
  });
  assert.equal(approveOwnClub.status, 200);
  assert.equal(rejectOtherClub.status, 404);
  const approvedDashboard = await request('/api/leader/dashboard', { cookie: leaderACookie });
  assert.equal(approvedDashboard.body.stats.approvedMembers, 1);
  assert.equal(approvedDashboard.body.stats.pendingApplications, 0);
  assert.deepEqual(approvedDashboard.body.members.map((member) => member.id), [applicationA.body.id]);

  const eventReassigned = await request('/api/admin/events/debate', {
    method: 'PATCH', cookie: adminCookie, body: { club: 'UN Club' },
  });
  assert.equal(eventReassigned.status, 200);
  assert.equal(database.prepare('SELECT club_id FROM event_registrations WHERE student_id=?').get('TEST001').club_id, clubBId);
  const updatedDashboardA = await request('/api/leader/dashboard', { cookie: leaderACookie });
  const updatedDashboardB = await request('/api/leader/dashboard', { cookie: leaderBCookie });
  assert.deepEqual(updatedDashboardA.body.events.map((event) => event.id), ['science-fair']);
  assert.deepEqual(updatedDashboardA.body.eventActivity, []);
  assert.deepEqual(updatedDashboardB.body.events.map((event) => event.id), ['debate', 'model-un', 'un-workshop']);
  assert.deepEqual(updatedDashboardB.body.eventActivity.map((row) => row.event_id).sort(), ['debate', 'model-un']);

  const reassigned = await request(`/api/admin/accounts/${leaderA.body.id}`, {
    method: 'PATCH', cookie: adminCookie, body: { club: 'UN Club' },
  });
  assert.equal(reassigned.status, 200);
  const refreshedDashboard = await request('/api/leader/dashboard', { cookie: leaderACookie });
  assert.equal(refreshedDashboard.body.account.club, 'UN Club');
  assert.deepEqual(refreshedDashboard.body.memberships.map((row) => row.id), [applicationB.body.id]);

  assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('legacy registrations are backfilled once without overwriting an existing club or dropping unknown events', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clubs-migration-'));
  const databasePath = path.join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL, club TEXT, course TEXT, year INTEGER,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE event_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      student_id TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, department TEXT NOT NULL,
      year TEXT NOT NULL, event_id TEXT NOT NULL, club TEXT, account_id INTEGER REFERENCES accounts(id),
      role TEXT, message TEXT, consent INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'registered', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id,event_id)
    );
    INSERT INTO accounts (full_name,email,password_hash,role,course,year)
      VALUES ('Legacy Member','legacy@example.com','unused','member','Science',2);
    INSERT INTO event_registrations (first_name,last_name,student_id,email,department,year,event_id,account_id)
      VALUES ('Legacy','Member','OLD001','legacy@example.com','Science','2nd Year','debate',1);
    INSERT INTO event_registrations (first_name,last_name,student_id,email,department,year,event_id,club,account_id)
      VALUES ('Legacy','Member','OLD002','legacy@example.com','Science','2nd Year','missing-event','SMS',1);
  `);
  legacy.close();

  let database = initializeDatabase(databasePath);
  const backfilled = database.prepare('SELECT event_id,club,club_id,account_id FROM event_registrations ORDER BY id').all();
  assert.equal(backfilled.length, 2);
  assert.equal(backfilled[0].club, 'Democracy Club');
  assert.equal(backfilled[0].club_id, database.prepare('SELECT id FROM clubs WHERE name=?').get('Democracy Club').id);
  assert.equal(backfilled[0].account_id, 1);
  assert.equal(backfilled[1].event_id, 'missing-event');
  assert.equal(backfilled[1].club, 'SMS');
  assert.equal(database.prepare('SELECT club_id FROM event_registrations WHERE id=2').get().club_id,
    database.prepare('SELECT id FROM clubs WHERE name=?').get('SMS').id);
  assert.equal(database.prepare('SELECT club_id FROM club_events WHERE event_id=?').get('missing-event').club_id, null);
  assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
  database.close();

  database = initializeDatabase(databasePath);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM event_registrations').get().count, 2);
  assert.equal(database.prepare('SELECT club FROM event_registrations WHERE id=2').get().club, 'SMS');
  assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
