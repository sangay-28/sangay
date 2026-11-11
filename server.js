const http = require('node:http');
const path = require('node:path');
const { initializePostgresDatabase } = require('./config/postgres');
const { createApplication } = require('./app');
const { loadEnvFile } = require('./utils/load-env');

loadEnvFile(path.join(__dirname, '.env'));

const port = Number(process.env.PORT) || 3000;
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
