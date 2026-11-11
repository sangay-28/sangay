const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApplication } = require('../app');
const { initializeDatabase } = require('../config/database');

test('submission endpoints validate and persist application data', async (suite) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clubs-api-'));
  const database = initializeDatabase(path.join(directory, 'test.sqlite'));
  const server = require('node:http').createServer(createApplication(database, process.cwd()));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  suite.after(() => {
    server.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function post(endpoint, data) {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return { status: response.status, body: await response.json() };
  }

  await suite.test('serves frontend files and keeps project configuration private', async () => {
    const homepage = await fetch(`${baseUrl}/`);
    assert.equal(homepage.status, 200);
    const privateConfig = await fetch(`${baseUrl}/package.json`);
    assert.equal(privateConfig.status, 404);
    const hiddenFile = await fetch(`${baseUrl}/.gitignore`);
    assert.equal(hiddenFile.status, 404);
  });

  await suite.test('accepts contact messages and membership applications', async () => {
    const contact = await post('/api/contact', {
      name: 'Tashi Dorji',
      email: 'tashi@example.com',
      subject: 'Question',
      message: 'Hello',
      consent: true,
    });
    assert.equal(contact.status, 201);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM contact_messages').get().count, 1);

    const membership = await post('/api/memberships', {
      fullName: 'Tashi Dorji',
      course: 'Data Science',
      year: 2,
      club: 'SMS',
      consent: true,
    });
    assert.equal(membership.status, 201);
    assert.equal(
      database.prepare('SELECT COUNT(*) AS count FROM membership_applications').get().count,
      1,
    );
  });

  await suite.test('accepts event registration and prevents duplicate registration', async () => {
    const registration = {
      firstName: 'Tashi',
      lastName: 'Dorji',
      studentId: '07240001',
      email: 'tashi@example.com',
      department: 'Mathematics',
      year: '2nd Year',
      eventId: 'debate',
      role: 'Participant',
      phone: '',
      message: '',
      consent: true,
    };
    assert.equal((await post('/api/event-registrations', registration)).status, 201);
    assert.equal((await post('/api/event-registrations', registration)).status, 409);
  });

  await suite.test('rejects invalid emails and unknown events', async () => {
    const badContact = await post('/api/contact', {
      name: 'Tashi',
      email: 'invalid',
      subject: 'Question',
      message: 'Hello',
      consent: true,
    });
    assert.equal(badContact.status, 400);
    const badEvent = await post('/api/event-registrations', {
      firstName: 'Tashi',
      lastName: 'Dorji',
      studentId: '07240002',
      email: 'tashi@example.com',
      department: 'Math',
      year: '1st Year',
      eventId: 'unknown',
    });
    assert.equal(badEvent.status, 400);
  });
});
