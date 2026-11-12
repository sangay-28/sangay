# Sherubtse Clubs

A static HTML/CSS/JavaScript website with a small Node.js API for event registrations, club membership applications, and contact messages. Frontend pages and assets are grouped under `public/`; backend code remains in dedicated server, route, controller, utility, and configuration folders.

## Technologies

- HTML, CSS, and browser JavaScript
- Node.js 22.5 or newer
- PostgreSQL database managed through PostgreSQL Server and pgAdmin 4
- Prettier and ESLint for development formatting and linting

## Project structure

```text
config/          PostgreSQL setup and legacy SQLite initialization for tests/import
controllers/     Submission business logic
routes/          API and role-specific routing
utils/           HTTP, OTP, and request helpers
public/          Static frontend served by the Node.js app
  *.html         Site, account, and admin pages
  css/           Stylesheets
  js/            Browser integration and interactions
  images/        Site image assets
  images2/       Additional image assets
data/            Existing SQLite source database for migration into PostgreSQL
tests/           Node.js API tests
app.js           Static file, access gate, and API request handler
server.js        Server startup and local environment loading
```

## Setup and run

Install [Node.js 22.5 or newer](https://nodejs.org/) and PostgreSQL Server. pgAdmin 4 is the management interface; the application connects to the PostgreSQL server. The PostgreSQL service must be installed and running (pgAdmin alone is not a database server).

In pgAdmin, connect to your local server, open **Query Tool** on its `postgres` database, and create an app login role (replace the example password with one you choose):

```sql
CREATE ROLE clubs_app WITH LOGIN PASSWORD 'choose-a-strong-password';
CREATE DATABASE sherubtse_clubs OWNER clubs_app;
```

If the role or database already exists, keep it and skip its `CREATE` statement. Open the project's `.env` and set `DATABASE_URL` to `postgresql://clubs_app:YOUR_PASSWORD@localhost:5432/sherubtse_clubs`, replacing `YOUR_PASSWORD` with the role password. URL-encode special characters in the password. Keep the password in `.env`, not in source files or chat. The role must be allowed to connect to the database and create tables; making it the database owner provides that access.

```sh
npm install
npm start
```

Open <http://localhost:3000>. The PostgreSQL schema and initial club/event records are created automatically on first start. To import existing records from SQLite, start the app once to create the PostgreSQL schema, stop it, then run `npm run migrate:sqlite`. The importer reads `DATABASE_PATH` (default `./data/clubs.sqlite`) and writes to `DATABASE_URL`; it preserves existing PostgreSQL rows and skips duplicate IDs. `PORT` defaults to `3000`. Set `PGSSL=true` only when your PostgreSQL host requires SSL.

On Windows, run `start.cmd` from the project folder if PowerShell blocks the `npm` command.

Member and leader login codes are sent through Gmail SMTP. Set `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, and `SMTP_SECURE=true` in `.env` for local use or in Render's environment settings for deployment. `.env` is gitignored and is not uploaded to Render; add those values in the Render service's Environment settings or attached Environment Group. For compatibility, `SMTP_USER` and `SMTP_PASSWORD` are accepted as alternatives; if using `SMTP_PASSWORD`, it must contain a Google App Password. Create a Google App Password for a dedicated Gmail sender account; Google requires 2-Step Verification, and an App Password is different from the account's normal password ([Google App Password help](https://support.google.com/accounts/answer/185833)). The application stores only an HMAC of each six-digit code, expires it after five minutes, permits five incorrect attempts, and enforces a 60-second resend cooldown plus request rate limits. The application reports success only after Gmail SMTP accepts the recipient. This confirms SMTP acceptance, not inbox placement. Run `npm run verify:email` to check SMTP connectivity and authentication without sending an email. **Render Free web services block outbound SMTP on port 465. Upgrade this web service to a paid instance before expecting Gmail SMTP to work on Render** ([Render Free instance limits](https://render.com/docs/free)). Administrator sign-in uses `ADMIN_EMAIL` and `ADMIN_PASSWORD`; it does not require email delivery. Admin submissions are at <http://localhost:3000/admin.html>; account provisioning is at <http://localhost:3000/admin-users.html>. Admin and portal sessions use HTTP-only, same-site cookies and expire after eight hours. Admins can create and disable accounts, review up to 500 recent submissions per type, and update their statuses. Form terms links open `terms.html`.

Members create accounts at <http://localhost:3000/member-register.html> and sign in at <http://localhost:3000/login.html> using one-time codes delivered by Gmail. The Clubs Office can create leaders, reassign their clubs, and assign events to clubs from the account management page. Leaders land on a separate dashboard showing that club's approved members, applications, assigned events, and event registrations. Membership applications and event registrations are filtered on the backend using the leader's current club assignment. OTP codes are single-use, expire after five minutes, and allow up to five verification attempts. Existing anonymous form submissions remain available, while submissions made during a member session are linked to that account.

The app does not process payments. The membership application form does not request bank details.

## API

All request bodies use JSON. Successful submissions return HTTP `201` with a generated record ID. Invalid input returns `400`, and a duplicate event registration for the same student and event returns `409`.

| Method  | Endpoint                                              | Purpose                                                      |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `GET`   | `/api/health`                                         | Health check                                                 |
| `POST`  | `/api/contact`                                        | Save `{ name, email, subject, message }`                     |
| `POST`  | `/api/memberships`                                    | Save `{ fullName, email?, course, year, club }`              |
| `POST`  | `/api/event-registrations`                            | Save event registration form details                         |
| `POST`  | `/api/admin/login`                                    | Sign in with the configured administrator email and password |
| `POST`  | `/api/admin/logout`                                   | End the current admin session                                |
| `GET`   | `/api/admin/submissions`                              | List recent submissions (admin session required)             |
| `PATCH` | `/api/admin/{contacts,memberships,registrations}/:id` | Update a submission status (admin session required)          |
| `POST`  | `/api/auth/request-otp`                               | Send a member/leader OTP by Gmail SMTP                       |
| `POST`  | `/api/auth/verify-otp`                                | Verify a code and create the session/account                 |
| `POST`  | `/api/auth/logout`                                    | End a member or leader session                               |
| `GET`   | `/api/member/dashboard`                               | Get the signed-in member's submissions                       |
| `GET`   | `/api/leader/dashboard`                               | Get applications for the leader's assigned club              |
| `POST`  | `/api/admin/leaders`                                  | Create a club leader account (admin session required)        |
| `GET`   | `/api/admin/accounts`                                 | List member and leader accounts (admin session required)     |
| `PATCH` | `/api/admin/accounts/:id`                             | Enable or disable an account (admin session required)        |

## Tests and code quality

```sh
npm test
npm run format
npx eslint .
```

VS Code will offer **Prettier - Code formatter** (`esbenp.prettier-vscode`) and **ESLint** (`dbaeumer.vscode-eslint`) as recommended extensions. Format on save is enabled in `.vscode/settings.json`.

## Notes

The contact, membership, and event forms save records to PostgreSQL. The admin dashboard handles those submissions. Email is used for OTP delivery; no payment processing is included. Search, event details, and event galleries are available after sign-in. Social icons currently link to their platforms; replace them with official college profiles when those URLs are available.
