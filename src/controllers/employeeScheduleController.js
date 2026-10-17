const EmployeeSchedule = require("../models/employeeSchedule");
const Employee = require("../models/employee");
const { ROLES } = require("../middlewares/auth");

async function authorizeScheduleEmployee(req, res, employeeId) {
  if (req.user.role !== ROLES.CM) return true;
  if (!req.user.chapel_id) {
    res.status(403).json({ error: "Your account is not assigned to a chapel" });
    return false;
  }

  const employee = await Employee.getEmployeeById(employeeId, req.user.chapel_id);
  if (!employee) {
    res.status(404).json({ error: "Employee not found in your chapel" });
    return false;
  }
  return true;
}

async function listEmployeeSchedules(req, res) {
  if (req.user.role === ROLES.CM && !req.user.chapel_id) {
    return res.status(403).json({ error: "Your account is not assigned to a chapel" });
  }

  try {
    const rows = await EmployeeSchedule.listSchedules({
      employee_id: req.query.employee_id
        ? Number(req.query.employee_id)
        : undefined,
      chapel_id: req.user.role === ROLES.CM ? req.user.chapel_id : undefined,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
    });
    res.json(rows);
  } catch (error) {
    console.error("[SCHEDULE] Failed to load schedules:", error.message);
    res.status(500).json({ error: error.message });
  }
}

async function createEmployeeSchedules(req, res) {
  const employeeId = Number(req.body.employee_id);
  const schedules = Array.isArray(req.body.schedules) ? req.body.schedules : [];

  if (!employeeId || schedules.length === 0) {
    return res
      .status(400)
      .json({ error: "employee_id and schedules are required" });
  }

  for (const schedule of schedules) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(schedule.date) ||
      !schedule.time_in ||
      !schedule.time_out
    ) {
      return res
        .status(400)
        .json({ error: "Each schedule needs a date, time in, and time out" });
    }
    if (schedule.time_out === schedule.time_in) {
      return res
        .status(400)
        .json({ error: "Time Out must differ from Time In" });
    }
  }

  try {
    if (!(await authorizeScheduleEmployee(req, res, employeeId))) return;
    res
      .status(201)
      .json(await EmployeeSchedule.upsertSchedules(employeeId, schedules));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteEmployeeSchedules(req, res) {
  const employeeId = Number(req.body.employee_id);
  const dates = Array.isArray(req.body.dates) ? req.body.dates : [];
  if (!employeeId || !dates.length) {
    return res
      .status(400)
      .json({ error: "employee_id and dates are required" });
  }

  try {
    if (!(await authorizeScheduleEmployee(req, res, employeeId))) return;
    const deleted = await EmployeeSchedule.deleteSchedules(employeeId, dates);
    res.json({ ok: true, deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listEmployeeSchedules,
  createEmployeeSchedules,
  deleteEmployeeSchedules,
};
