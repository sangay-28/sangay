const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const http = require('node:http');
const { initializePostgresDatabase } = require('./config/postgres');
const { createApplication } = require('./app');
const { getEmailConfigStatus } = require('./utils/mailer');

const port = Number(process.env.PORT) || 3000;
const emailConfigStatus = Object.entries(getEmailConfigStatus())
  .map(([name, configured]) => `${name}=${configured ? 'set' : 'missing'}`)
  .join(', ');
console.info(`Gmail SMTP configuration: ${emailConfigStatus}`);

async function startServer() {
  const database = await initializePostgresDatabase(process.env.DATABASE_URL);
  const app = createApplication(database, path.join(__dirname, 'public'), {
    adminCredentials: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  });
  const server = http.createServer(app);
  server.listen(port, () => console.log(`Sherubtse Clubs is running at http://localhost:${port}`));
  server.on('close', () => database.end());
}

startServer().catch((error) => {
  console.error(`Unable to start Sherubtse Clubs: ${error.message}`);
  process.exitCode = 1;
});
