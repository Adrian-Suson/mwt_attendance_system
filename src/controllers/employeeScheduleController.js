const EmployeeSchedule = require("../models/employeeSchedule");

async function listEmployeeSchedules(req, res) {
  try {
    const rows = await EmployeeSchedule.listSchedules({
      employee_id: req.query.employee_id
        ? Number(req.query.employee_id)
        : undefined,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
    });
    res.json(rows);
  } catch (error) {
    console.error("[SCHEDULE] Failed to save schedules:", error.message);
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
    if (schedule.time_out <= schedule.time_in) {
      return res
        .status(400)
        .json({ error: "Time Out must be later than Time In" });
    }
  }

  try {
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
