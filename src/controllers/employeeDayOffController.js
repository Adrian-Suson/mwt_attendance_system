const Employee = require("../models/employee");
const EmployeeDayOff = require("../models/employeeDayOff");

async function listEmployeeDayOffs(req, res) {
  try {
    const employeeId = Number(req.query.employee_id);
    if (!employeeId)
      return res.status(400).json({ error: "employee_id is required" });
    const employee = await Employee.getEmployeeById(employeeId);
    if (!employee) return res.status(404).json({ error: "Employee not found" });
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
    const employee = await Employee.getEmployeeById(employeeId);
    if (!employee) return res.status(404).json({ error: "Employee not found" });
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
    const employee = await Employee.getEmployeeById(employeeId);
    if (!employee) return res.status(404).json({ error: "Employee not found" });
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
