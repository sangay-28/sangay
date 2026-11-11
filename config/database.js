const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { CLUB_NAMES } = require('../utils/clubs');

function initializeDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS clubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      consent INTEGER NOT NULL DEFAULT 1 CHECK (consent IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('member', 'leader')),
      club TEXT,
      club_id INTEGER REFERENCES clubs(id),
      course TEXT,
      year INTEGER CHECK (year IS NULL OR year BETWEEN 1 AND 4),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS otp_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL COLLATE NOCASE,
      role TEXT NOT NULL CHECK (role IN ('member', 'leader', 'admin')),
      purpose TEXT NOT NULL CHECK (purpose IN ('login', 'signup')),
      code_hash TEXT NOT NULL,
      metadata TEXT,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_otp_challenges_email
      ON otp_challenges(email, purpose, created_at DESC);
    CREATE TABLE IF NOT EXISTS membership_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      course TEXT NOT NULL,
      year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 4),
      club TEXT NOT NULL,
      club_id INTEGER REFERENCES clubs(id),
      email TEXT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      consent INTEGER NOT NULL DEFAULT 1 CHECK (consent IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS event_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      student_id TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      department TEXT NOT NULL,
      year TEXT NOT NULL,
      event_id TEXT NOT NULL REFERENCES club_events(event_id),
      club TEXT,
      club_id INTEGER REFERENCES clubs(id),
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      role TEXT,
      message TEXT,
      consent INTEGER NOT NULL DEFAULT 1 CHECK (consent IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'registered',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, event_id)
    );
    CREATE TABLE IF NOT EXISTS club_events (
      event_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      club TEXT NOT NULL,
      club_id INTEGER REFERENCES clubs(id)
    );
  `);
  const insertClub = database.prepare('INSERT OR IGNORE INTO clubs (name) VALUES (?)');
  for (const club of CLUB_NAMES) insertClub.run(club);
  for (const table of ['contact_messages', 'membership_applications', 'event_registrations']) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((column) => column.name === 'consent')) {
      database.exec(
        `ALTER TABLE ${table} ADD COLUMN consent INTEGER NOT NULL DEFAULT 1 CHECK (consent IN (0, 1))`,
      );
    }
  }
  for (const [table, defaultStatus] of [
    ['contact_messages', 'new'],
    ['membership_applications', 'pending'],
    ['event_registrations', 'registered'],
  ]) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((column) => column.name === 'status')) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN status TEXT NOT NULL DEFAULT '${defaultStatus}'`);
    }
  }
  for (const table of ['membership_applications', 'event_registrations']) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((column) => column.name === 'account_id')) {
      database.exec(
        `ALTER TABLE ${table} ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`,
      );
    }
  }
  const membershipColumns = database.prepare('PRAGMA table_info(membership_applications)').all();
  if (!membershipColumns.some((column) => column.name === 'email')) {
    database.exec('ALTER TABLE membership_applications ADD COLUMN email TEXT');
  }
  const registrationColumns = database.prepare('PRAGMA table_info(event_registrations)').all();
  if (!registrationColumns.some((column) => column.name === 'club')) {
    database.exec('ALTER TABLE event_registrations ADD COLUMN club TEXT');
  }
  for (const table of ['accounts', 'membership_applications', 'event_registrations', 'club_events']) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((column) => column.name === 'club_id')) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN club_id INTEGER REFERENCES clubs(id)`);
    }
  }
  const { CLUB_EVENTS } = require('../utils/club-events');
  for (const [eventId, event] of Object.entries(CLUB_EVENTS)) {
    const clubId = database.prepare('SELECT id FROM clubs WHERE name=?').get(event.club).id;
    database.prepare(`INSERT OR IGNORE INTO club_events (event_id,title,category,date,status,club,club_id)
      VALUES (?,?,?,?,?,?,?)`).run(eventId, event.title, event.category, event.date, event.status, event.club, clubId);
    database.prepare("UPDATE event_registrations SET club=? WHERE event_id=? AND (club IS NULL OR club='')")
      .run(database.prepare('SELECT club FROM club_events WHERE event_id=?').get(eventId).club, eventId);
  }
  database.prepare('UPDATE club_events SET club_id=(SELECT id FROM clubs WHERE name=club_events.club) WHERE club_id IS NULL').run();
  for (const table of ['accounts', 'membership_applications', 'event_registrations']) {
    database.prepare(`UPDATE ${table} SET club_id=(SELECT id FROM clubs WHERE name=${table}.club) WHERE club_id IS NULL AND club IS NOT NULL`).run();
  }
  database.prepare(`INSERT OR IGNORE INTO club_events (event_id,title,category,date,status,club,club_id)
    SELECT DISTINCT registrations.event_id,
      'Unassigned event (' || registrations.event_id || ')','Unassigned','Unknown','Unassigned','',NULL
    FROM event_registrations AS registrations
    LEFT JOIN club_events AS events ON events.event_id=registrations.event_id
    WHERE events.event_id IS NULL`).run();
  const registrationForeignKeys = database.prepare('PRAGMA foreign_key_list(event_registrations)').all();
  if (!registrationForeignKeys.some((foreignKey) => foreignKey.table === 'club_events')) {
    database.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
    try {
      database.exec(`CREATE TABLE event_registrations_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        student_id TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        department TEXT NOT NULL,
        year TEXT NOT NULL,
        event_id TEXT NOT NULL REFERENCES club_events(event_id),
        club TEXT,
        club_id INTEGER REFERENCES clubs(id),
        account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        role TEXT,
        message TEXT,
        consent INTEGER NOT NULL DEFAULT 1 CHECK (consent IN (0, 1)),
        status TEXT NOT NULL DEFAULT 'registered',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (student_id,event_id)
      );
      INSERT INTO event_registrations_migrated
        (id,first_name,last_name,student_id,email,phone,department,year,event_id,club,club_id,account_id,role,message,consent,status,created_at)
      SELECT old.id,old.first_name,old.last_name,old.student_id,old.email,old.phone,old.department,old.year,old.event_id,
        old.club,
        CASE WHEN EXISTS (SELECT 1 FROM clubs WHERE id=old.club_id) THEN old.club_id
          ELSE (SELECT id FROM clubs WHERE name=old.club) END,
        CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id=old.account_id) THEN old.account_id ELSE NULL END,
        old.role,old.message,old.consent,old.status,old.created_at
      FROM event_registrations AS old;
      DROP TABLE event_registrations;
      ALTER TABLE event_registrations_migrated RENAME TO event_registrations;
      COMMIT;
    `);
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    } finally {
      database.exec('PRAGMA foreign_keys = ON;');
    }
  }
  return database;
}

module.exports = { initializeDatabase };
