# Attendance System Backend

This backend uses Express.js and PostgreSQL.

## Setup

1. Copy `.env.example` to `.env`
2. Update your PostgreSQL credentials
3. Create the database:

```bash
createdb attendance_db
```

4. Install dependencies:

```bash
npm install
```

5. Start the server:

```bash
npm start
```

## Google Drive image uploads

The public upload endpoint sends images to Google Drive before saving the attendance record. Configure one of these server-side credentials in `.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS=C:/path/to/google-service-account.json
GOOGLE_DRIVE_FOLDER_ID=your_drive_folder_id
```

Alternatively, set `GOOGLE_SERVICE_ACCOUNT_JSON` to the minified contents of the service-account JSON file. Enable the Google Drive API, create a service account, and share the destination Drive folder with the service account email as an Editor. The folder ID is the value after `/folders/` in its Drive URL.

The OAuth web client JSON (`client_id` and `client_secret`) is not sufficient by itself for server uploads because it requires a user authorization flow and refresh token. Do not commit either credential file or place secrets in frontend code. Rotate any client secret that has been exposed publicly.

### Deployment configuration

For production, add these variables in the hosting provider's backend environment settings:

```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_DRIVE_FOLDER_ID=0AK2yyKgLJRRoUk9PVA
GOOGLE_DRIVE_ID=0AK2yyKgLJRRoUk9PVA
```

`GOOGLE_SERVICE_ACCOUNT_JSON` must contain the complete service-account JSON, including `private_key`. Do not use the local Windows path in production. If the hosting provider does not accept multiline JSON, set `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` to the base64-encoded JSON instead. The Shared drive must include the service account as a member, and the Drive API must be enabled.

## API endpoints

- `GET /` -> API status
- `GET /api/health` -> database health check
- `GET /api/employees` -> list employees
- `POST /api/employees` -> add employee

## Production deployment

1. Use Node.js 20 LTS.
2. Copy `.env.example` to `.env` and replace every placeholder, especially `JWT_SECRET`, `ADMIN_PASSWORD`, database credentials, `CORS_ORIGIN`, and Google Drive credentials.
3. Keep `DB_AUTO_CREATE=false`; create the PostgreSQL database and use a least-privilege application user.
4. Build and serve the same-origin frontend from the backend:

```bash
cd Frontend
npm ci
npm run build
cd ../Backend
npm ci --omit=dev
NODE_ENV=production npm start
```

The Vite build writes to `Backend/public`, which is served by Express. Do not expose PostgreSQL or Google credentials to the frontend. Put TLS/HTTPS in front of Express using the hosting provider or a reverse proxy. The backend exits early in production if JWT or CORS configuration is missing.

### Automatic attendance and schedule cleanup

On Vercel, a daily cron runs at midnight in the Philippines and deletes attendance records and past employee schedules older than 90 Manila calendar days. Current and future schedules are retained. Configure a strong `CRON_SECRET` environment variable in Vercel; the cleanup endpoint rejects requests without its matching Bearer token. Employee accounts, public-upload rows, and Google Drive images are not deleted by this cleanup.

## Example request

```bash
curl http://localhost:5000/api/employees
```
