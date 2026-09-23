const Employee = require("../models/employee");
const {
  detectImage,
  matchEmbedding,
  getFaceConfiguration,
} = require("../services/faceRecognitionService");
const {
  uploadToGoogleDrivePath,
  downloadFromGoogleDrive,
} = require("../services/googleDriveService");

const FACE_TEMPLATE_CACHE_TTL_MS = Number(
  process.env.FACE_TEMPLATE_CACHE_TTL_MS || 60000,
);
let faceTemplateCache = null;
let faceTemplateCacheExpiresAt = 0;
let faceTemplateCachePromise = null;

async function getActiveFaceTemplates() {
  const now = Date.now();
  if (faceTemplateCache && faceTemplateCacheExpiresAt > now) {
    return faceTemplateCache;
  }

  if (!faceTemplateCachePromise) {
    faceTemplateCachePromise = Employee.getAllActiveFaceEmbeddings()
      .then((templates) => {
        faceTemplateCache = templates;
        faceTemplateCacheExpiresAt = Date.now() + FACE_TEMPLATE_CACHE_TTL_MS;
        return templates;
      })
      .finally(() => {
        faceTemplateCachePromise = null;
      });
  }

  return faceTemplateCachePromise;
}

function invalidateFaceTemplateCache() {
  faceTemplateCache = null;
  faceTemplateCacheExpiresAt = 0;
}

function getEmployeeName(employee) {
  return [employee.first_name, employee.middle_name, employee.last_name]
    .filter(Boolean)
    .join(" ");
}

function validateFaceInput(req, res) {
  if (!req.file?.buffer) {
    res.status(400).json({ error: "An image file is required." });
    return false;
  }

  return true;
}

function getDescriptorInput(req, res) {
  if (req.body?.descriptor === undefined) return null;

  let descriptor = req.body.descriptor;
  if (typeof descriptor === "string") {
    try {
      descriptor = JSON.parse(descriptor);
    } catch {
      res.status(400).json({ error: "The face descriptor is invalid." });
      return false;
    }
  }

  if (
    !Array.isArray(descriptor) ||
    descriptor.length !== 128 ||
    descriptor.some((value) => !Number.isFinite(Number(value)))
  ) {
    res.status(400).json({ error: "The face descriptor is invalid." });
    return false;
  }

  return descriptor.map(Number);
}

async function registerEmployeeFace(req, res) {
  if (!validateFaceInput(req, res)) return;

  const employeeId = Number(req.params.employeeId);
  if (!employeeId) {
    return res.status(400).json({ error: "Invalid employee ID." });
  }

  try {
    const employee = await Employee.getEmployeeById(employeeId);
    if (!employee)
      return res.status(404).json({ error: "Employee not found." });

    const detected = await detectImage(req.file.buffer);
    if (detected.multipleFaces) {
      return res.status(422).json({
        error: "Only one face is allowed in an enrollment photo.",
        code: "MULTIPLE_FACES",
      });
    }
    if (!detected.descriptor) {
      return res.status(422).json({
        error: "No clear face was detected in the enrollment photo.",
        code: "NO_FACE",
      });
    }

    const existingTemplates = await getActiveFaceTemplates();
    const existingMatch = matchEmbedding(
      detected.descriptor,
      existingTemplates,
    );

    if (
      existingMatch.match &&
      String(existingMatch.match.employee_id) !== String(employeeId)
    ) {
      const matchedEmployee = await Employee.getEmployeeById(
        existingMatch.match.employee_id,
      );
      return res.status(409).json({
        error: `This face is already registered to ${getEmployeeName(matchedEmployee)}. It cannot be registered to another employee.`,
        code: "FACE_ALREADY_REGISTERED",
        employee_id: existingMatch.match.employee_id,
        distance: existingMatch.match.distance,
        similarity: existingMatch.match.similarity,
      });
    }

    if (
      existingMatch.best?.ambiguous &&
      String(existingMatch.best.employee_id) !== String(employeeId)
    ) {
      const matchedEmployee = await Employee.getEmployeeById(
        existingMatch.best.employee_id,
      );
      return res.status(409).json({
        error: `This face is too similar to ${getEmployeeName(matchedEmployee)}. Use a clearer reference photo before registering it.`,
        code: "FACE_MATCH_AMBIGUOUS",
        employee_id: existingMatch.best.employee_id,
        distance: existingMatch.best.distance,
        similarity: existingMatch.best.similarity,
        next_distance: existingMatch.best.nextDistance,
      });
    }

    const employeeName = getEmployeeName(employee);
    const driveFile = await uploadToGoogleDrivePath(
      {
        ...req.file,
        originalname: `employee-${employeeId}-${employeeName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${Date.now()}.jpg`,
      },
      ["DTR photo", "Facetemplate"],
    );

    const saved = await Employee.addEmployeeFaceEmbedding(
      employeeId,
      detected.descriptor,
      "face-api.js",
      driveFile,
    );
    invalidateFaceTemplateCache();

    console.log(`[FACE] Registered employee ${employeeId}`);
    return res.status(201).json({
      ok: true,
      employee_id: employeeId,
      embedding_id: saved.id,
      model: saved.model,
      drive_file_id: driveFile.id,
      drive_file_url: driveFile.webViewLink || driveFile.webContentLink,
      face_dimensions: detected.faceDimensions,
      message: `${employeeName} face registered successfully and was saved to Google Drive.`,
    });
  } catch (error) {
    console.error("[FACE] Registration failed:", error.message);
    const status =
      error.message.includes("models are not loaded") ||
      error.message.includes("models are not loaded")
        ? 503
        : 500;
    return res.status(status).json({ error: error.message });
  }
}

async function recognizeFace(req, res) {
  try {
    const inputDescriptor = getDescriptorInput(req, res);
    if (inputDescriptor === false) return;

    let descriptor = inputDescriptor;
    let faceDimensions = null;

    if (!descriptor) {
      if (!validateFaceInput(req, res)) return;

      const detected = await detectImage(req.file.buffer);
      if (detected.multipleFaces) {
        return res.status(422).json({
          recognized: false,
          code: "MULTIPLE_FACES",
          error: "Only one face is allowed for attendance recognition.",
        });
      }
      if (!detected.descriptor) {
        return res.status(422).json({
          recognized: false,
          code: "NO_FACE",
          error: "No clear face was detected.",
        });
      }

      descriptor = detected.descriptor;
      faceDimensions = detected.faceDimensions;
    }

    const templates = await getActiveFaceTemplates();
    const { match, best } = matchEmbedding(descriptor, templates);

    if (!match) {
      return res.json({
        recognized: false,
        code: best?.ambiguous ? "AMBIGUOUS_FACE" : "NOT_RECOGNIZED",
        similarity: best?.similarity || 0,
        ambiguous: Boolean(best?.ambiguous),
        configuration: getFaceConfiguration(),
      });
    }

    const employee = await Employee.getEmployeeById(match.employee_id);
    console.log(`[FACE] Recognized employee ${match.employee_id}`);

    return res.json({
      recognized: true,
      employee_id: match.employee_id,
      employee_name: getEmployeeName(employee),
      similarity: match.similarity,
      model: match.model,
      face_dimensions: faceDimensions,
    });
  } catch (error) {
    console.error("[FACE] Recognition failed:", error.message);
    const status =
      error.message.includes("models are not loaded") ||
      error.message.includes("models are not loaded")
        ? 503
        : 500;
    return res.status(status).json({
      recognized: false,
      code: "FACE_SERVICE_UNAVAILABLE",
      error: error.message,
    });
  }
}

async function getEmployeeFaceStatus(req, res) {
  const employeeId = Number(req.params.employeeId);
  if (!employeeId)
    return res.status(400).json({ error: "Invalid employee ID." });

  try {
    const rows = await Employee.getEmployeeFaceEmbeddings(employeeId);
    return res.json({
      employee_id: employeeId,
      count: rows.length,
      model: rows[0]?.model || "face-api.js",
      faces: rows.map((row) => ({
        id: row.id,
        model: row.model,
        drive_file_id: row.drive_file_id,
        drive_file_url: row.drive_file_url,
        created_at: row.created_at,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function streamEmployeeFaceImage(req, res) {
  const employeeId = Number(req.params.employeeId);
  const embeddingId = Number(req.params.embeddingId);
  if (!employeeId || !embeddingId) {
    return res.status(400).json({ error: "Invalid employee or face ID." });
  }

  try {
    const rows = await Employee.getEmployeeFaceEmbeddings(employeeId);
    const face = rows.find((row) => row.id === embeddingId);
    if (!face?.drive_file_url) {
      return res.status(404).json({ error: "Enrolled face image not found." });
    }

    const { stream, mimeType } = await downloadFromGoogleDrive(
      face.drive_file_url,
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, max-age=300");
    stream.on("error", (error) => {
      if (!res.headersSent) res.status(502).json({ error: error.message });
      else res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) {
    console.error("Failed to stream employee face image:", error);
    res.status(502).json({ error: error.message });
  }
}

async function deleteEmployeeFaces(req, res) {
  const employeeId = Number(req.params.employeeId);
  if (!employeeId)
    return res.status(400).json({ error: "Invalid employee ID." });

  try {
    const deleted = await Employee.deleteEmployeeFaceEmbeddings(employeeId);
    invalidateFaceTemplateCache();
    return res.json({ ok: true, employee_id: employeeId, deleted });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  registerEmployeeFace,
  recognizeFace,
  getEmployeeFaceStatus,
  streamEmployeeFaceImage,
  deleteEmployeeFaces,
};
