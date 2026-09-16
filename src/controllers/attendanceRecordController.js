const AttendanceRecord = require("../models/attendanceRecord");

async function listAttendanceRecords(req, res) {
  try {
    const filters = {
      employee_id: req.query.employee_id
        ? Number(req.query.employee_id)
        : undefined,
      attendance_date: req.query.attendance_date || undefined,
      status: req.query.status || undefined,
      chapel_id: req.user.role === "cm_admin" ? req.user.chapel_id : undefined,
    };
    const rows = await AttendanceRecord.getAllAttendanceRecords(filters);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getAttendanceRecord(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const chapelId =
      req.user.role === "cm_admin" ? req.user.chapel_id : undefined;
    const record = await AttendanceRecord.getAttendanceRecordById(id, chapelId);
    if (!record) {
      return res.status(404).json({ error: "Attendance record not found" });
    }
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createAttendanceRecord(req, res) {
  const { employee_id, attendance_date, status } = req.body;

  if (!employee_id || !attendance_date || !status) {
    return res.status(400).json({
      error: "employee_id, attendance_date, and status are required",
    });
  }

  try {
    const created = await AttendanceRecord.createAttendanceRecord(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateAttendanceRecord(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const updated = await AttendanceRecord.updateAttendanceRecord(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Attendance record not found" });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteAttendanceRecord(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const removed = await AttendanceRecord.deleteAttendanceRecord(id);
    if (!removed) {
      return res.status(404).json({ error: "Attendance record not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listAttendanceRecords,
  getAttendanceRecord,
  createAttendanceRecord,
  updateAttendanceRecord,
  deleteAttendanceRecord,
};
