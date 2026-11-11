const { createSubmissionController } = require('../controllers/submissionController');
const { readJson, sendJson } = require('../utils/http');

async function handleApiRequest(request, response, database, url, getAccount = () => null) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  const route = {
    '/api/contact': 'contact',
    '/api/memberships': 'membership',
    '/api/event-registrations': 'eventRegistration',
  }[url.pathname];
  if (!route) {
    sendJson(response, 404, { error: 'API endpoint not found.' });
    return;
  }
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  try {
    const body = await readJson(request);
    const account = await getAccount(request);
    const result = await createSubmissionController(database)[route](body, account?.id || null);
    sendJson(response, 201, result);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status === 500) console.error(error);
    sendJson(response, status, {
      error: status === 500 ? 'Unable to save your submission right now.' : error.message,
    });
  }
}

module.exports = { handleApiRequest };
