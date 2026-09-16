const { getClient } = require("../db");

async function getChapelsForEmployee(employeeId) {
  const client = getClient();
  const result = await client.query(
    `SELECT c.* FROM employee_chapels ec
     JOIN chapels c ON c.id = ec.chapel_id
     WHERE ec.employee_id = $1
     ORDER BY c.name ASC`,
    [employeeId],
  );
  return result.rows;
}

async function getEmployeesForChapel(chapelId) {
  const client = getClient();
  const result = await client.query(
    `SELECT e.* FROM employee_chapels ec
     JOIN employees e ON e.id = ec.employee_id
     WHERE ec.chapel_id = $1
     ORDER BY e.last_name ASC, e.first_name ASC`,
    [chapelId],
  );
  return result.rows;
}

async function addChapelToEmployee(employeeId, chapelId) {
  const client = getClient();
  const result = await client.query(
    `INSERT INTO employee_chapels (employee_id, chapel_id)
     VALUES ($1, $2)
     ON CONFLICT (employee_id, chapel_id) DO NOTHING
     RETURNING *`,
    [employeeId, chapelId],
  );
  return result.rows[0] || null;
}

async function removeChapelFromEmployee(employeeId, chapelId) {
  const client = getClient();
  const result = await client.query(
    `DELETE FROM employee_chapels
     WHERE employee_id = $1 AND chapel_id = $2
     RETURNING *`,
    [employeeId, chapelId],
  );
  return result.rows[0] || null;
}

module.exports = {
  getChapelsForEmployee,
  getEmployeesForChapel,
  addChapelToEmployee,
  removeChapelFromEmployee,
};
