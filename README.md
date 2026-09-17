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

## Backend face recognition

Face recognition runs inside Express using `face-api.js`, SSD MobileNet V1 face detection, 68-point landmarks, and the face recognition descriptor model. It uses pure JavaScript TensorFlow.js CPU execution, so it does not require `@tensorflow/tfjs-node`, Python, or a separate service. The server loads one shared model instance during startup. Enrollment images are uploaded from memory to Google Drive under `DTR photo/Facetemplate`; PostgreSQL stores the descriptor plus the Drive file ID/link.

The existing employee primary key is `employees.id`. Startup creates `employee_face_embeddings`, allowing multiple reference descriptors per employee:

```text
employee_face_embeddings(id, employee_id, embedding, model, drive_file_id, drive_file_url, created_at, updated_at)
```

Register a reference photo as an authenticated GCM or CM user:

```text
POST /api/face/register/:employeeId
FormData: image=<photo>
```

Each registered image is saved in the configured Drive root folder using this nested path:

```text
GOOGLE_DRIVE_FOLDER_ID/
└── DTR photo/
	└── Facetemplate/
```

Recognize an attendance selfie through Express:

```text
POST /api/face/recognize
FormData: image=<photo>
```

The recognition response contains only the matched employee ID, display name, model, and similarity. It never returns the stored embedding. The public DTR flow passes a recognized employee into the existing attendance and schedule logic.

### Model files

The required model files are stored in `Backend/models/face-api`:

- `ssd_mobilenetv1_model-weights_manifest.json` and shards
- `face_landmark_68_model-weights_manifest.json` and shard
- `face_recognition_model-weights_manifest.json` and shards

The directory can be changed with `FACE_MODEL_DIR`.

### Matching threshold

face-api.js uses Euclidean descriptor distance. The initial `FACE_MATCH_THRESHOLD` is `0.55`; lower distance is a stronger match. The endpoint returns both distance and a display-only similarity value (`1 - distance`). Calibrate with genuine photos from different angles and lighting plus impostor/unknown photos. Choose a threshold that rejects impostor distances while retaining genuine matches; do not copy thresholds from another model or image pipeline.

Calibrate it with real data before production: collect several different lighting and angle photos for each enrolled employee, plus photos of other employees and unknown people. Record genuine-match and impostor similarity values, then choose a threshold that rejects impostors while retaining genuine matches. Do not compare thresholds from a different Human model or match configuration.

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

## Example request

```bash
curl http://localhost:5000/api/employees
```
