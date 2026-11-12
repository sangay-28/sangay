const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { verifyEmailTransport } = require('../utils/mailer');

verifyEmailTransport()
  .then(() => {
    console.log('Gmail SMTP connection and authentication verified. No email was sent.');
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
