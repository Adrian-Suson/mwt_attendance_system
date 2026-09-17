const { google } = require("googleapis");
const { Readable } = require("stream");
const fs = require("fs");

function getDriveClient() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const serviceAccountJsonBase64 =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

  let credentials;

  if (serviceAccountJson || serviceAccountJsonBase64) {
    try {
      const encodedJson = serviceAccountJsonBase64
        ? Buffer.from(serviceAccountJsonBase64, "base64").toString("utf8")
        : serviceAccountJson;
      credentials = JSON.parse(encodedJson);
    } catch {
      throw new Error(
        "Google service-account credentials are not valid JSON. Check GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.",
      );
    }
  }

  if (credentials?.type !== "service_account" || !credentials.client_email) {
    if (serviceAccountJson || serviceAccountJsonBase64) {
      throw new Error(
        "Google service-account credentials must contain type=service_account and client_email.",
      );
    }
  }

  if (credentials) {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    return google.drive({ version: "v3", auth });
  }

  if (credentialsPath && fs.existsSync(credentialsPath)) {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    return google.drive({ version: "v3", auth });
  }

  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);
    const auth = new google.auth.GoogleAuth({
      credentials: parsed,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    return google.drive({ version: "v3", auth });
  }

  if (credentialsPath && process.env.NODE_ENV !== "production") {
    throw new Error(`Google credential file not found: ${credentialsPath}`);
  }

  return null;
}

async function getOrCreateDriveFolder(drive, folderName, parentFolderId) {
  const escapedName = folderName.replace(/'/g, "\\'");
  const query = [
    `'${parentFolderId}' in parents`,
    `name = '${escapedName}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ].join(" and ");

  const listOptions = {
    q: query,
    spaces: "drive",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: "files(id,name)",
  };

  if (process.env.GOOGLE_DRIVE_ID) {
    listOptions.corpora = "drive";
    listOptions.driveId = process.env.GOOGLE_DRIVE_ID;
  }

  const existing = await drive.files.list(listOptions);

  if (existing.data.files?.[0]) {
    return existing.data.files[0].id;
  }

  const created = await drive.files.create({
    resource: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    supportsAllDrives: true,
    fields: "id,name",
  });

  return created.data.id;
}

async function uploadToGoogleDrive(
  file,
  folderId = process.env.GOOGLE_DRIVE_FOLDER_ID,
  subfolderName,
) {
  const drive = getDriveClient();

  if (!drive) {
    throw new Error(
      "Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON (recommended for deployment) or GOOGLE_APPLICATION_CREDENTIALS, plus GOOGLE_DRIVE_FOLDER_ID.",
    );
  }

  const uploadFolderId = subfolderName
    ? await getOrCreateDriveFolder(drive, subfolderName, folderId)
    : folderId;

  const fileMetadata = {
    name: file.originalname || file.filename || "upload.jpg",
    parents: uploadFolderId ? [uploadFolderId] : undefined,
  };

  const media = {
    mimeType: file.mimetype || "image/jpeg",
    body: Readable.from(file.buffer),
  };

  const response = await drive.files.create({
    resource: fileMetadata,
    media,
    supportsAllDrives: true,
    fields: "id,name,webViewLink,webContentLink",
  });

  const uploadedFile = response.data;

  if (process.env.GOOGLE_DRIVE_MAKE_PUBLIC === "true") {
    await drive.permissions.create({
      fileId: uploadedFile.id,
      supportsAllDrives: true,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });
  }

  return {
    id: uploadedFile.id,
    name: uploadedFile.name,
    webViewLink: uploadedFile.webViewLink,
    webContentLink:
      uploadedFile.webContentLink ||
      `https://drive.google.com/uc?export=view&id=${uploadedFile.id}`,
  };
}

async function uploadToGoogleDrivePath(file, folderNames = []) {
  const drive = getDriveClient();

  if (!drive) {
    throw new Error(
      "Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS, plus GOOGLE_DRIVE_FOLDER_ID.",
    );
  }

  let folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  for (const folderName of folderNames) {
    folderId = await getOrCreateDriveFolder(drive, folderName, folderId);
  }

  return uploadToGoogleDrive(file, folderId);
}

function getDriveFileId(filePath) {
  try {
    const url = new URL(filePath);
    const queryId = url.searchParams.get("id");
    if (queryId) return queryId;

    const pathMatch = url.pathname.match(/\/d\/([^/]+)/);
    return pathMatch?.[1] || null;
  } catch {
    return null;
  }
}

async function downloadFromGoogleDrive(filePath) {
  const drive = getDriveClient();
  const fileId = getDriveFileId(filePath);

  if (!drive || !fileId) {
    throw new Error("The stored Google Drive file reference is invalid.");
  }

  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    { responseType: "stream" },
  );

  return {
    stream: response.data,
    mimeType: response.headers["content-type"] || "application/octet-stream",
  };
}

module.exports = {
  downloadFromGoogleDrive,
  getOrCreateDriveFolder,
  uploadToGoogleDrive,
  uploadToGoogleDrivePath,
};
