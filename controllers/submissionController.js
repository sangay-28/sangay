const { validateSubmission } = require('../utils/validation');
const { get, run } = require('../utils/database-query');

function createSubmissionController(database) {
  return {
    async contact(body) {
      const data = validateSubmission('contact', body);
      const result = await run(
        database,
        'INSERT INTO contact_messages (name,email,subject,message,consent) VALUES (?,?,?,?,?) RETURNING id',
        [data.name, data.email, data.subject, data.message, 1],
      );
      return { id: Number(result.lastInsertRowid), message: 'Your message was received.' };
    },
    async membership(body, accountId = null) {
      const data = validateSubmission('membership', body);
      const clubId = (await get(database, 'SELECT id FROM clubs WHERE name=?', [data.club]))?.id;
      if (!clubId) {
        const error = new Error('Select a valid club.');
        error.statusCode = 400;
        throw error;
      }
      const accountEmail = accountId
        ? (
            await get(database, "SELECT email FROM accounts WHERE id=? AND role='member'", [
              accountId,
            ])
          )?.email
        : null;
      const email = data.email || accountEmail || null;
      const duplicate = accountId
        ? await get(
            database,
            `SELECT id FROM membership_applications
          WHERE club_id=? AND status IN ('pending','approved')
            AND (account_id=? OR LOWER(email)=LOWER(?)) LIMIT 1`,
            [clubId, accountId, email],
          )
        : email
          ? await get(
              database,
              `SELECT id FROM membership_applications
            WHERE club_id=? AND status IN ('pending','approved') AND LOWER(email)=LOWER(?) LIMIT 1`,
              [clubId, email],
            )
          : null;
      if (duplicate) {
        const error = new Error(
          'You already have an active application or membership for this club.',
        );
        error.statusCode = 409;
        throw error;
      }
      const result = await run(
        database,
        'INSERT INTO membership_applications (full_name,course,year,club,club_id,email,consent,account_id) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
        [data.fullName, data.course, data.year, data.club, clubId, email, 1, accountId],
      );
      return {
        id: Number(result.lastInsertRowid),
        message: 'Your membership application was received.',
      };
    },
    async eventRegistration(body, accountId = null) {
      const data = validateSubmission('event', body);
      const eventOwner = await get(
        database,
        'SELECT club,club_id FROM club_events WHERE event_id=?',
        [data.eventId],
      );
      if (!eventOwner) {
        const error = new Error(
          'This event is not currently assigned to a club. Contact the Clubs Office.',
        );
        error.statusCode = 400;
        throw error;
      }
      try {
        const result = await run(
          database,
          `INSERT INTO event_registrations
          (first_name,last_name,student_id,email,phone,department,year,event_id,club,club_id,role,message,consent,account_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
          [
            data.firstName,
            data.lastName,
            data.studentId,
            data.email,
            data.phone,
            data.department,
            data.year,
            data.eventId,
            eventOwner.club,
            eventOwner.club_id,
            data.role,
            data.message,
            1,
            accountId,
          ],
        );
        return {
          id: Number(result.lastInsertRowid),
          message: 'Your event registration was received.',
        };
      } catch (error) {
        if (
          error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
          error.code === '23505' ||
          /UNIQUE constraint failed/.test(error.message)
        ) {
          const duplicate = new Error('This student is already registered for that event.');
          duplicate.statusCode = 409;
          throw duplicate;
        }
        throw error;
      }
    },
  };
}

module.exports = { createSubmissionController };
