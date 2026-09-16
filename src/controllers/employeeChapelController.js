const EmployeeChapel = require("../models/employeeChapel");

async function listChapelsForEmployee(req, res) {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!employeeId)
      return res.status(400).json({ error: "Invalid employee id" });
    const rows = await EmployeeChapel.getChapelsForEmployee(employeeId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function listEmployeesForChapel(req, res) {
  try {
    const chapelId = Number(req.params.chapelId);
    if (!chapelId) return res.status(400).json({ error: "Invalid chapel id" });
    const rows = await EmployeeChapel.getEmployeesForChapel(chapelId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function addChapelAssignment(req, res) {
  try {
    const { employee_id, chapel_id } = req.body;
    const employeeId = Number(employee_id);
    const chapelId = Number(chapel_id);
    if (!employeeId || !chapelId)
      return res
        .status(400)
        .json({ error: "employee_id and chapel_id are required" });
    const created = await EmployeeChapel.addChapelToEmployee(
      employeeId,
      chapelId,
    );
    res.status(201).json(created || { ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function removeChapelAssignment(req, res) {
  try {
    const employeeId = Number(req.params.employeeId);
    const chapelId = Number(req.params.chapelId);
    if (!employeeId || !chapelId)
      return res.status(400).json({ error: "Invalid ids" });
    const removed = await EmployeeChapel.removeChapelFromEmployee(
      employeeId,
      chapelId,
    );
    if (!removed)
      return res.status(404).json({ error: "Assignment not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listChapelsForEmployee,
  listEmployeesForChapel,
  addChapelAssignment,
  removeChapelAssignment,
};
