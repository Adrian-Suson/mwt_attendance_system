const Employee = require("../models/employee");
const EmployeeDayOff = require("../models/employeeDayOff");
const { ROLES } = require("../middlewares/auth");

async function getAuthorizedEmployee(req, res, employeeId) {
  if (req.user.role === ROLES.CM && !req.user.chapel_id) {
    res.status(403).json({ error: "Your account is not assigned to a chapel" });
    return null;
  }

  const chapelId = req.user.role === ROLES.CM ? req.user.chapel_id : undefined;
  const employee = await Employee.getEmployeeById(employeeId, chapelId);
  if (!employee) {
    res.status(404).json({
      error: chapelId
        ? "Employee not found in your chapel"
        : "Employee not found",
    });
  }
  return employee;
}

async function listEmployeeDayOffs(req, res) {
  try {
    const employeeId = Number(req.query.employee_id);
    if (!employeeId)
      return res.status(400).json({ error: "employee_id is required" });
    const employee = await getAuthorizedEmployee(req, res, employeeId);
    if (!employee) return;
    res.json(await EmployeeDayOff.listDayOffs(employeeId));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createEmployeeDayOffs(req, res) {
  const employeeId = Number(req.body.employee_id);
  const dates = Array.isArray(req.body.dates) ? req.body.dates : [];
  if (!employeeId || !dates.length) {
    return res
      .status(400)
      .json({ error: "employee_id and dates are required" });
  }

  try {
    const employee = await getAuthorizedEmployee(req, res, employeeId);
    if (!employee) return;
    res
      .status(201)
      .json(
        await EmployeeDayOff.createDayOffs(employeeId, dates, req.body.notes),
      );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteEmployeeDayOffs(req, res) {
  const employeeId = Number(req.body.employee_id);
  const dates = Array.isArray(req.body.dates) ? req.body.dates : [];
  if (!employeeId || !dates.length) {
    return res
      .status(400)
      .json({ error: "employee_id and dates are required" });
  }

  try {
    const employee = await getAuthorizedEmployee(req, res, employeeId);
    if (!employee) return;
    res.json({
      ok: true,
      deleted: await EmployeeDayOff.deleteDayOffs(employeeId, dates),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listEmployeeDayOffs,
  createEmployeeDayOffs,
  deleteEmployeeDayOffs,
};
