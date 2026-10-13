const Employee = require("../models/employee");

function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function listPublicEmployeeNames(req, res) {
  try {
    const employees = await Employee.getPublicEmployeeNames();
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function listEmployees(req, res) {
  try {
    const page = parseInt(req.query.page || 1, 10);
    const pageSize = parseInt(req.query.pageSize || 10, 10);
    const search = req.query.search || req.query.q || "";

    if (page < 1 || pageSize < 1 || pageSize > 1000) {
      return res.status(400).json({ error: "Invalid page or pageSize" });
    }

    const requestedChapelId = req.query.chapel_id
      ? Number(req.query.chapel_id)
      : undefined;
    const chapelId =
      req.user.role === "cm_admin" ? req.user.chapel_id : requestedChapelId;
    const attendanceDate = req.query.attendance_date || undefined;
    if (attendanceDate && !isValidDateOnly(attendanceDate)) {
      return res.status(400).json({ error: "Invalid attendance_date" });
    }
    const result = await Employee.getAllEmployees(
      page,
      pageSize,
      search,
      chapelId,
      {
        attendanceDate,
        status: req.query.status || undefined,
        sortBy: req.query.sort_by || "name",
        sortDirection: req.query.sort_direction || "asc",
      },
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getEmployee(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const chapelId =
      req.user.role === "cm_admin" ? req.user.chapel_id : undefined;
    const emp = await Employee.getEmployeeById(id, chapelId);
    if (!emp) return res.status(404).json({ error: "Employee not found" });
    res.json(emp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createEmployee(req, res) {
  const {
    name,
    first_name,
    last_name,
    email,
    role,
    phone,
    chapel_id,
    status,
    hire_date,
  } = req.body;

  if (!(name || first_name) || !role) {
    return res.status(400).json({ error: "Name and role are required" });
  }

  try {
    const created = await Employee.createEmployee({
      name,
      first_name,
      middle_name: req.body.middle_name,
      last_name,
      email,
      role,
      phone,
      chapel_id,
      employment_type: req.body.employment_type,
      time_in: req.body.time_in,
      time_out: req.body.time_out,
      status,
      hire_date,
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateEmployee(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const updates = { ...req.body };
    const chapelId =
      req.user.role === "cm_admin" ? req.user.chapel_id : undefined;

    if (req.user.role === "cm_admin") {
      delete updates.role;
      delete updates.chapel_id;
    }

    const updated = await Employee.updateEmployee(id, updates, chapelId);
    if (!updated) return res.status(404).json({ error: "Employee not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteEmployee(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const removed = await Employee.deleteEmployee(id);
    if (!removed) return res.status(404).json({ error: "Employee not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listPublicEmployeeNames,
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
};
