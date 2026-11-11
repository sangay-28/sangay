const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { initializePostgresDatabase } = require('../config/postgres');
const { loadEnvFile } = require('../utils/load-env');

loadEnvFile(path.join(__dirname, '..', '.env'));

async function migrateSqliteData() {
  const sourcePath =
    process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'clubs.sqlite');
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const pool = await initializePostgresDatabase(process.env.DATABASE_URL);
  const client = await pool.connect();
  const tableNames = [
    'accounts',
    'contact_messages',
    'membership_applications',
    'event_registrations',
  ];

  try {
    await client.query('BEGIN');
    const clubRows = source.prepare('SELECT name FROM clubs ORDER BY id').all();
    for (const club of clubRows) {
      await client.query('INSERT INTO clubs (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [
        club.name,
      ]);
    }

    const accounts = source.prepare('SELECT * FROM accounts ORDER BY id').all();
    for (const account of accounts) {
      const clubId = account.club
        ? (await client.query('SELECT id FROM clubs WHERE name=$1', [account.club])).rows[0]?.id
        : null;
      await client.query(
        `INSERT INTO accounts
        (id,full_name,email,password_hash,role,club,club_id,course,year,active,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO NOTHING`,
        [
          account.id,
          account.full_name,
          account.email,
          account.password_hash,
          account.role,
          account.club,
          clubId,
          account.course,
          account.year,
          account.active,
          account.created_at,
        ],
      );
    }

    const contacts = source.prepare('SELECT * FROM contact_messages ORDER BY id').all();
    for (const row of contacts) {
      await client.query(
        `INSERT INTO contact_messages (id,name,email,subject,message,consent,status,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [
          row.id,
          row.name,
          row.email,
          row.subject,
          row.message,
          row.consent,
          row.status,
          row.created_at,
        ],
      );
    }

    const events = source.prepare('SELECT * FROM club_events ORDER BY event_id').all();
    for (const event of events) {
      const clubId = event.club
        ? (await client.query('SELECT id FROM clubs WHERE name=$1', [event.club])).rows[0]?.id
        : null;
      await client.query(
        `INSERT INTO club_events (event_id,title,category,date,status,club,club_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (event_id) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category,
          date=EXCLUDED.date, status=EXCLUDED.status, club=EXCLUDED.club, club_id=EXCLUDED.club_id`,
        [event.event_id, event.title, event.category, event.date, event.status, event.club, clubId],
      );
    }

    const memberships = source.prepare('SELECT * FROM membership_applications ORDER BY id').all();
    for (const row of memberships) {
      const clubId = row.club
        ? (await client.query('SELECT id FROM clubs WHERE name=$1', [row.club])).rows[0]?.id
        : null;
      const accountId =
        row.account_id &&
        (await client.query('SELECT id FROM accounts WHERE id=$1', [row.account_id])).rows[0]
          ? row.account_id
          : null;
      await client.query(
        `INSERT INTO membership_applications
        (id,full_name,course,year,club,club_id,email,account_id,consent,status,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
        [
          row.id,
          row.full_name,
          row.course,
          row.year,
          row.club,
          clubId,
          row.email,
          accountId,
          row.consent,
          row.status,
          row.created_at,
        ],
      );
    }

    const registrations = source.prepare('SELECT * FROM event_registrations ORDER BY id').all();
    for (const row of registrations) {
      let event = (
        await client.query('SELECT club,club_id FROM club_events WHERE event_id=$1', [row.event_id])
      ).rows[0];
      if (!event) {
        await client.query(
          `INSERT INTO club_events (event_id,title,category,date,status,club,club_id)
          VALUES ($1,$2,'Unassigned','Unknown','Unassigned','',NULL) ON CONFLICT (event_id) DO NOTHING`,
          [row.event_id, `Unassigned event (${row.event_id})`],
        );
        event = { club: '', club_id: null };
      }
      const savedClub = row.club || event.club;
      const clubId = savedClub
        ? (await client.query('SELECT id FROM clubs WHERE name=$1', [savedClub])).rows[0]?.id
        : event.club_id;
      const accountId =
        row.account_id &&
        (await client.query('SELECT id FROM accounts WHERE id=$1', [row.account_id])).rows[0]
          ? row.account_id
          : null;
      await client.query(
        `INSERT INTO event_registrations
        (id,first_name,last_name,student_id,email,phone,department,year,event_id,club,club_id,account_id,role,message,consent,status,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (id) DO NOTHING`,
        [
          row.id,
          row.first_name,
          row.last_name,
          row.student_id,
          row.email,
          row.phone,
          row.department,
          row.year,
          row.event_id,
          savedClub,
          clubId,
          accountId,
          row.role,
          row.message,
          row.consent,
          row.status,
          row.created_at,
        ],
      );
    }

    for (const table of tableNames) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 0), 1), EXISTS (SELECT 1 FROM ${table}))`,
      );
    }
    await client.query('COMMIT');
    process.stdout.write(`Imported SQLite records into PostgreSQL from ${sourcePath}.\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    source.close();
    client.release();
    await pool.end();
  }
}

migrateSqliteData().catch((error) => {
  console.error(`SQLite import failed: ${error.message}`);
  process.exitCode = 1;
});
