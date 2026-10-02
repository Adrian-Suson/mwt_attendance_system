const PublicUpload = require("../models/publicUpload");
const AttendanceRecord = require("../models/attendanceRecord");
const Employee = require("../models/employee");
const EmployeeSchedule = require("../models/employeeSchedule");
const {
  downloadFromGoogleDrive,
  uploadToGoogleDrive,
} = require("../services/googleDriveService");

const MAX_UPLOAD_DELAY_MINUTES = 5;

const CHAPEL_FOLDER_NAMES = [
  { folder: "Zamboanga", aliases: ["zamboanga"] },
  { folder: "Ipil", aliases: ["ipil"] },
  { folder: "Pagadian", aliases: ["pagadian"] },
  { folder: "Buug", aliases: ["buug"] },
  { folder: "Oroquieta", aliases: ["oroquieta"] },
  { folder: "Tangub", aliases: ["tangub"] },
];

function getChapelFolderName(chapelName) {
  const normalizedName = String(chapelName || "")
    .trim()
    .toLowerCase();
  return CHAPEL_FOLDER_NAMES.find(({ aliases }) =>
    aliases.some((alias) => normalizedName.includes(alias)),
  )?.folder;
}

function validateCaptureTime(captureDateValue) {
  if (!captureDateValue) {
    return "The picture capture time is required.";
  }

  const captureTime = new Date(captureDateValue);

  if (Number.isNaN(captureTime.getTime())) {
    return "The picture capture time is invalid.";
  }

  const elapsedMinutes = (Date.now() - captureTime.getTime()) / 60000;

  if (elapsedMinutes < 0) {
    return "The picture capture time cannot be in the future.";
  }

  if (elapsedMinutes > MAX_UPLOAD_DELAY_MINUTES) {
    return `The DTR must be uploaded within ${MAX_UPLOAD_DELAY_MINUTES} minutes of taking the picture.`;
  }

  return null;
}

function getPhilippineDate(dateValue) {
  const date = new Date(dateValue);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function getManilaClockTime(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function parseClockToMinutes(value) {
  if (!value) return null;

  const [timePart, meridiem] = String(value).trim().split(/\s+/);
  const [hours, minutes] = (timePart || "").split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;

  let totalMinutes = hours * 60 + minutes;
  if (meridiem?.toLowerCase() === "pm" && hours < 12) totalMinutes += 720;
  if (meridiem?.toLowerCase() === "am" && hours === 12) totalMinutes -= 720;

  return totalMinutes;
}

function formatClockTime(value) {
  const totalMinutes = parseClockToMinutes(value);
  if (totalMinutes === null) return value || "the scheduled time";

  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const meridiem = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function getManilaDateKey(dateValue) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  }).formatToParts(new Date(dateValue));
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addDateDays(dateKey, dayCount) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + dayCount));
  return date.toISOString().slice(0, 10);
}

async function getEmployeeSchedule(employeeId, dateKey) {
  const schedules = await EmployeeSchedule.listSchedules({
    employee_id: employeeId,
    start_date: dateKey,
    end_date: dateKey,
  });
  return schedules[0] || null;
}

function formatMinutesForSchedule(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

async function getFirstTimeInSchedulePlan(employeeId, captureDate) {
  const captureDateKey = getManilaDateKey(captureDate);
  const currentSchedule = await getEmployeeSchedule(employeeId, captureDateKey);
  if (currentSchedule) {
    return { attendanceDate: captureDateKey, scheduleToCreate: null };
  }

  const capturedMinutes = parseClockToMinutes(getManilaClockTime(captureDate));
  const scheduledStart = (Math.floor(capturedMinutes / 60) + 1) * 60;
  const dayOffset = Math.floor(scheduledStart / (24 * 60));
  const scheduleDate = addDateDays(captureDateKey, dayOffset);
  const scheduleToCreate = {
    date: scheduleDate,
    time_in: formatMinutesForSchedule(scheduledStart % (24 * 60)),
    time_out: formatMinutesForSchedule((scheduledStart + 9 * 60) % (24 * 60)),
    notes: "Automatically generated from first Time In.",
  };

  if (dayOffset > 0 && (await getEmployeeSchedule(employeeId, scheduleDate))) {
    return { attendanceDate: scheduleDate, scheduleToCreate: null };
  }

  return { attendanceDate: scheduleDate, scheduleToCreate };
}

function isOvernightSchedule(schedule) {
  const timeIn = parseClockToMinutes(schedule?.time_in);
  const timeOut = parseClockToMinutes(schedule?.time_out);
  return timeIn !== null && timeOut !== null && timeOut < timeIn;
}

async function getOpenOvernightAttendance(employeeId, attendanceDate) {
  const previousDate = addDateDays(attendanceDate, -1);
  const schedule = await getEmployeeSchedule(employeeId, previousDate);
  if (!isOvernightSchedule(schedule)) return null;

  const records = await AttendanceRecord.getAllAttendanceRecords({
    employee_id: employeeId,
    attendance_date: previousDate,
  });
  const record = records.find((item) => item.check_in && !item.check_out);
  return record ? { attendanceDate: previousDate, schedule, record } : null;
}

async function getAttendanceWorkDate(employeeId, calendarDate, attendanceType) {
  if (
    !String(attendanceType || "")
      .toLowerCase()
      .includes("time out")
  ) {
    return calendarDate;
  }

  const currentRecords = await AttendanceRecord.getAllAttendanceRecords({
    employee_id: employeeId,
    attendance_date: calendarDate,
  });
  if (currentRecords.some((record) => record.check_in)) return calendarDate;

  const overnightAttendance = await getOpenOvernightAttendance(
    employeeId,
    calendarDate,
  );
  return overnightAttendance?.attendanceDate || calendarDate;
}

function getManilaClockMinutes(dateValue) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(dateValue));
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return Number(values.hour) * 60 + Number(values.minute);
}

async function validateTimeOutSchedule(
  employeeId,
  attendanceType,
  captureDate,
) {
  if (
    !String(attendanceType || "")
      .toLowerCase()
      .includes("time out")
  ) {
    return null;
  }

  const employee = await Employee.getEmployeeById(employeeId);
  if (!employee) return "Employee not found.";

  const captureDateKey = getManilaDateKey(captureDate);
  const overnightAttendance = await getOpenOvernightAttendance(
    employeeId,
    captureDateKey,
  );
  const schedule =
    overnightAttendance?.schedule ||
    (await getEmployeeSchedule(employeeId, captureDateKey));
  const scheduledTimeOut = parseClockToMinutes(schedule?.time_out);
  if (isOvernightSchedule(schedule) && !overnightAttendance) {
    return `Time Out is only allowed at ${formatClockTime(schedule.time_out)} or later on the next day.`;
  }
  if (
    scheduledTimeOut !== null &&
    getManilaClockMinutes(captureDate) < scheduledTimeOut
  ) {
    return `Time Out is only allowed at ${formatClockTime(schedule.time_out)} or later.`;
  }

  return null;
}

function getAttendanceStatus(attendanceType) {
  const value = String(attendanceType || "")
    .trim()
    .toLowerCase();

  if (value.includes("time in")) return "present";
  if (value.includes("time out")) return "present";
  if (value.includes("break in")) return "present";
  if (value.includes("break out")) return "present";

  return "present";
}

async function getPublicAttendanceStatus(req, res) {
  const employeeId = Number(req.query.employee_id);
  const attendanceDate = req.query.attendance_date;

  if (!employeeId || !attendanceDate) {
    return res.status(400).json({
      error: "employee_id and attendance_date are required",
    });
  }

  try {
    const records = await AttendanceRecord.getAllAttendanceRecords({
      employee_id: employeeId,
      attendance_date: attendanceDate,
    });

    if (!records.some((record) => record.check_in)) {
      const overnightAttendance = await getOpenOvernightAttendance(
        employeeId,
        attendanceDate,
      );
      if (overnightAttendance) {
        return res.json([
          {
            check_in: overnightAttendance.record.check_in,
            check_out: overnightAttendance.record.check_out,
            attendance_date: overnightAttendance.attendanceDate,
            is_overnight: true,
          },
        ]);
      }
    }

    res.json(
      records.map(({ check_in, check_out, attendance_date }) => ({
        check_in,
        check_out,
        attendance_date,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function syncAttendanceFromUpload(data, workDate) {
  const employeeId = Number(data.employee_id);
  const captureDate = data.capture_datetime
    ? new Date(data.capture_datetime)
    : new Date();
  const attendanceDate =
    workDate ||
    (await getAttendanceWorkDate(
      employeeId,
      getPhilippineDate(captureDate),
      data.attendance_type,
    ));
  const status = getAttendanceStatus(data.attendance_type);

  if (!employeeId || Number.isNaN(employeeId)) {
    return null;
  }

  const dayRecords = await AttendanceRecord.getAllAttendanceRecords({
    employee_id: employeeId,
    attendance_date: attendanceDate,
  });

  const payload = {
    employee_id: employeeId,
    attendance_date: attendanceDate,
    status,
    source: "photo-upload",
    notes: `Saved from DTR photo: ${data.file_name || "upload"}`,
  };

  if (
    data.attendance_type &&
    data.attendance_type.toLowerCase().includes("time in")
  ) {
    payload.check_in = getManilaClockTime(captureDate);
  }

  if (
    data.attendance_type &&
    data.attendance_type.toLowerCase().includes("time out")
  ) {
    payload.check_out = getManilaClockTime(captureDate);
  }

  if (dayRecords.length > 0) {
    const current = dayRecords[0];

    if (payload.check_in) {
      payload.check_in = payload.check_in || current.check_in;
    }

    if (payload.check_out) {
      payload.check_out = payload.check_out || current.check_out;
    }

    return AttendanceRecord.updateAttendanceRecord(current.id, payload);
  }

  return AttendanceRecord.createAttendanceRecord(payload);
}

async function listPublicUploads(req, res) {
  try {
    const filters = {
      employee_id: req.query.employee_id
        ? Number(req.query.employee_id)
        : undefined,
      attendance_type: req.query.attendance_type || undefined,
    };
    const rows = await PublicUpload.getAllPublicUploads(filters);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getPublicUpload(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const upload = await PublicUpload.getPublicUploadById(id);
    if (!upload) {
      return res.status(404).json({ error: "Public upload not found" });
    }
    res.json(upload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function streamPublicUploadImage(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const upload = await PublicUpload.getPublicUploadById(id);
    if (!upload) {
      return res.status(404).json({ error: "Public upload not found" });
    }

    if (
      !String(upload.file_path || "").startsWith("https://drive.google.com/")
    ) {
      return res.status(404).json({
        error: "This upload does not have a Google Drive image reference.",
      });
    }

    const { stream, mimeType } = await downloadFromGoogleDrive(
      upload.file_path,
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, max-age=300");
    stream.on("error", (error) => {
      if (!res.headersSent) {
        res.status(502).json({ error: error.message });
      } else {
        res.destroy(error);
      }
    });
    stream.pipe(res);
  } catch (err) {
    console.error("Failed to stream Google Drive image:", err);
    res.status(502).json({ error: err.message });
  }
}

async function createPublicUpload(req, res) {
  const body = { ...req.body };

  const hasLatitude =
    body.photo_latitude !== undefined && body.photo_latitude !== "";
  const hasLongitude =
    body.photo_longitude !== undefined && body.photo_longitude !== "";
  const photoLatitude = hasLatitude ? Number(body.photo_latitude) : null;
  const photoLongitude = hasLongitude ? Number(body.photo_longitude) : null;

  if (
    hasLatitude !== hasLongitude ||
    (hasLatitude &&
      (!Number.isFinite(photoLatitude) ||
        photoLatitude < -90 ||
        photoLatitude > 90)) ||
    (hasLongitude &&
      (!Number.isFinite(photoLongitude) ||
        photoLongitude < -180 ||
        photoLongitude > 180))
  ) {
    return res
      .status(400)
      .json({ error: "A valid latitude and longitude pair is required." });
  }

  body.photo_latitude = photoLatitude;
  body.photo_longitude = photoLongitude;

  if (req.file) {
    body.file_name = body.file_name || req.file.originalname;
  }

  if (
    !body.employee_id ||
    !body.employee_name ||
    !body.attendance_type ||
    !body.file_name ||
    (!body.file_path && !req.file)
  ) {
    return res.status(400).json({
      error:
        "employee_id, employee_name, attendance_type, file_name, and file_path are required",
    });
  }

  const captureTimeError = validateCaptureTime(body.capture_datetime);

  if (captureTimeError) {
    return res.status(422).json({ error: captureTimeError });
  }

  const employeeId = Number(body.employee_id);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return res
      .status(400)
      .json({ error: "A valid employee must be selected." });
  }

  const scheduleError = await validateTimeOutSchedule(
    employeeId,
    body.attendance_type,
    new Date(body.capture_datetime),
  );

  if (scheduleError) {
    return res.status(422).json({ error: scheduleError });
  }

  try {
    const employee = await Employee.getEmployeeById(employeeId);
    if (!employee) {
      return res
        .status(404)
        .json({ error: "Selected employee was not found." });
    }

    const chapelName = String(employee.chapel_name || "").trim();
    const chapelLocation = String(employee.chapel_location || "").trim();
    body.location = [chapelName, chapelLocation].filter(Boolean).join(" - ");
    if (!body.location) {
      return res.status(422).json({
        error:
          "The selected employee does not have a chapel or location assignment.",
      });
    }

    const captureDate = new Date(body.capture_datetime);
    const calendarDate = getPhilippineDate(captureDate);
    const attendanceType = String(body.attendance_type || "").toLowerCase();
    let attendanceDate;
    let scheduleToCreate = null;

    if (attendanceType.includes("time in")) {
      const schedulePlan = await getFirstTimeInSchedulePlan(
        employeeId,
        captureDate,
      );
      attendanceDate = schedulePlan.attendanceDate;
      scheduleToCreate = schedulePlan.scheduleToCreate;
    } else {
      attendanceDate = await getAttendanceWorkDate(
        employeeId,
        calendarDate,
        body.attendance_type,
      );
    }

    const existingRecords = await AttendanceRecord.getAllAttendanceRecords({
      employee_id: employeeId,
      attendance_date: attendanceDate,
    });
    const existingRecord = existingRecords[0];

    if (
      existingRecord &&
      attendanceType.includes("time in") &&
      existingRecord.check_in
    ) {
      return res.status(409).json({
        error: "This employee already has a Time In record for today.",
      });
    }

    if (
      existingRecord &&
      attendanceType.includes("time out") &&
      existingRecord.check_out
    ) {
      return res.status(409).json({
        error: "This employee already has a Time Out record for today.",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ error: "An image file is required." });
    }

    const chapelFolderName = getChapelFolderName(employee?.chapel_name);

    if (!chapelFolderName) {
      return res.status(422).json({
        error:
          "The employee does not have a supported chapel assignment. Expected Zamboanga, Ipil, Pagadian, Buug, Oroquieta, or Tangub.",
      });
    }

    const driveFile = await uploadToGoogleDrive(
      req.file,
      undefined,
      chapelFolderName,
    );
    body.file_path = driveFile.webContentLink;

    if (scheduleToCreate) {
      await EmployeeSchedule.createScheduleIfMissing(
        employeeId,
        scheduleToCreate,
      );
    }

    const attendanceRecord = await syncAttendanceFromUpload(
      body,
      attendanceDate,
    );
    body.attendance_record_id = attendanceRecord?.id || null;
    const created = await PublicUpload.createPublicUpload(body);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updatePublicUpload(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const updated = await PublicUpload.updatePublicUpload(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Public upload not found" });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deletePublicUpload(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const removed = await PublicUpload.deletePublicUpload(id);
    if (!removed) {
      return res.status(404).json({ error: "Public upload not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getPublicAttendanceStatus,
  listPublicUploads,
  getPublicUpload,
  streamPublicUploadImage,
  createPublicUpload,
  updatePublicUpload,
  deletePublicUpload,
};
