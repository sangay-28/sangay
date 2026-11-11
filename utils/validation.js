const { REGISTRABLE_EVENT_IDS } = require('./club-events');
const { CLUB_NAME_SET } = require('./clubs');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function text(value, label, max = 500, required = true) {
  if (typeof value !== 'string') value = '';
  const clean = value.trim();
  if (required && !clean) throw invalid(`${label} is required.`);
  if (clean.length > max) throw invalid(`${label} must be ${max} characters or fewer.`);
  return clean;
}

function email(value) {
  const clean = text(value, 'Email', 254);
  if (!EMAIL.test(clean)) throw invalid('Enter a valid email address.');
  return clean.toLowerCase();
}

function validateSubmission(kind, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw invalid('A JSON object is required.');
  if (body.consent !== true) throw invalid('Please provide consent before submitting.');
  if (kind === 'contact') {
    return {
      name: text(body.name, 'Name', 100),
      email: email(body.email),
      subject: text(body.subject, 'Subject', 150),
      message: text(body.message, 'Message', 3000),
    };
  }
  if (kind === 'membership') {
    const year = Number(body.year);
    const club = text(body.club, 'Club', 80);
    if (!Number.isInteger(year) || year < 1 || year > 4)
      throw invalid('Select a valid year of study.');
    if (!CLUB_NAME_SET.has(club)) throw invalid('Select a valid club.');
    return {
      fullName: text(body.fullName, 'Full name', 120),
      course: text(body.course, 'Course', 120),
      year,
      club,
      email: body.email ? email(body.email) : '',
    };
  }
  if (kind === 'event') {
    const eventId = text(body.eventId, 'Event', 60);
    if (!REGISTRABLE_EVENT_IDS.has(eventId)) throw invalid('Select a valid event.');
    const role = text(body.role, 'Role', 40, false);
    if (role && !['Participant', 'Volunteer', 'Organizer', 'Performer'].includes(role)) {
      throw invalid('Select a valid participation role.');
    }
    return {
      firstName: text(body.firstName, 'First name', 80),
      lastName: text(body.lastName, 'Last name', 80),
      studentId: text(body.studentId, 'Student ID', 40),
      email: email(body.email),
      phone: text(body.phone, 'Phone', 40, false),
      department: text(body.department, 'Department', 120),
      year: text(body.year, 'Year of study', 30),
      eventId,
      role,
      message: text(body.message, 'Message', 1000, false),
    };
  }
  throw invalid('Unsupported submission type.');
}

module.exports = { validateSubmission };
