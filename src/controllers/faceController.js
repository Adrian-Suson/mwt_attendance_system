const Employee = require("../models/employee");
const {
  detectImage,
  matchEmbedding,
  getFaceConfiguration,
} = require("../services/faceRecognitionService");
const { uploadToGoogleDrivePath } = require("../services/googleDriveService");

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

    const existingTemplates = await Employee.getAllActiveFaceEmbeddings();
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
  if (!validateFaceInput(req, res)) return;

  try {
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

    const templates = await Employee.getAllActiveFaceEmbeddings();
    const { match, best } = matchEmbedding(detected.descriptor, templates);

    if (!match) {
      return res.json({
        recognized: false,
        code: "NOT_RECOGNIZED",
        similarity: best?.similarity || 0,
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
      face_dimensions: detected.faceDimensions,
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
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function deleteEmployeeFaces(req, res) {
  const employeeId = Number(req.params.employeeId);
  if (!employeeId)
    return res.status(400).json({ error: "Invalid employee ID." });

  try {
    const deleted = await Employee.deleteEmployeeFaceEmbeddings(employeeId);
    return res.json({ ok: true, employee_id: employeeId, deleted });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  registerEmployeeFace,
  recognizeFace,
  getEmployeeFaceStatus,
  deleteEmployeeFaces,
};
