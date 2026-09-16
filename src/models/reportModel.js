// models/reportModel.js

/**
 * REPORT MODEL
 *
 * Uses only the database schema:
 *
 * employees
 * chapels
 * employee_chapels
 * attendance_records
 * employee_leaves
 *
 * No report data is stored in a separate table.
 */

class ReportModel {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get all active employees with their chapel and default schedule.
   */
  async getEmployees() {
    const query = `
      SELECT
        e.id,
        e.first_name,
        e.middle_name,
        e.last_name,
        e.role,
        e.chapel_id,
        c.name AS chapel_name,
        c.location AS chapel_location,
        e.employment_type,
        e.day_off,
        e.time_in,
        e.time_out,
        e.status,
        e.hire_date
      FROM employees e
      LEFT JOIN chapels c
        ON c.id = e.chapel_id
      WHERE e.status <> 'inactive'
      ORDER BY
        e.last_name ASC,
        e.first_name ASC,
        e.id ASC
    `;

    const result = await this.db.query(query);

    return result.rows;
  }

  /**
   * Get attendance records for a date range.
   */
  async getAttendance(startDate, endDate) {
    const query = `
      SELECT
        ar.id,
        ar.employee_id,
        ar.attendance_date,
        ar.status,
        ar.check_in,
        ar.check_out,
        ar.working_hours,
        ar.source,
        ar.notes
      FROM attendance_records ar
      WHERE ar.attendance_date BETWEEN $1 AND $2
      ORDER BY
        ar.employee_id ASC,
        ar.attendance_date ASC
    `;

    const result = await this.db.query(query, [
      startDate,
      endDate,
    ]);

    return result.rows;
  }

  /**
   * Get leave records for a date range.
   */
  async getLeaves(startDate, endDate) {
    const query = `
      SELECT
        el.id,
        el.employee_id,
        el.leave_date,
        el.leave_type,
        el.notes
      FROM employee_leaves el
      WHERE el.leave_date BETWEEN $1 AND $2
      ORDER BY
        el.employee_id ASC,
        el.leave_date ASC
    `;

    const result = await this.db.query(query, [
      startDate,
      endDate,
    ]);

    return result.rows;
  }

  /**
   * Get the complete report data.
   *
   * One API request returns:
   *
   * employees
   * attendance
   * leaves
   */
  async getReport(startDate, endDate) {
    const [employees, attendance, leaves] = await Promise.all([
      this.getEmployees(),
      this.getAttendance(startDate, endDate),
      this.getLeaves(startDate, endDate),
    ]);

    return {
      employees,
      attendance,
      leaves,
      date_range: {
        start_date: startDate,
        end_date: endDate,
      },
    };
  }

  /**
   * Optional:
   * Get report for one employee only.
   */
  async getEmployeeReport(employeeId, startDate, endDate) {
    const employeeQuery = `
      SELECT
        e.id,
        e.first_name,
        e.middle_name,
        e.last_name,
        e.role,
        e.chapel_id,
        c.name AS chapel_name,
        c.location AS chapel_location,
        e.employment_type,
        e.day_off,
        e.time_in,
        e.time_out,
        e.status,
        e.hire_date
      FROM employees e
      LEFT JOIN chapels c
        ON c.id = e.chapel_id
      WHERE e.id = $1
      LIMIT 1
    `;

    const attendanceQuery = `
      SELECT
        ar.id,
        ar.employee_id,
        ar.attendance_date,
        ar.status,
        ar.check_in,
        ar.check_out,
        ar.working_hours,
        ar.source,
        ar.notes
      FROM attendance_records ar
      WHERE ar.employee_id = $1
        AND ar.attendance_date BETWEEN $2 AND $3
      ORDER BY ar.attendance_date ASC
    `;

    const leaveQuery = `
      SELECT
        el.id,
        el.employee_id,
        el.leave_date,
        el.leave_type,
        el.notes
      FROM employee_leaves el
      WHERE el.employee_id = $1
        AND el.leave_date BETWEEN $2 AND $3
      ORDER BY el.leave_date ASC
    `;

    const [
      employeeResult,
      attendanceResult,
      leaveResult,
    ] = await Promise.all([
      this.db.query(employeeQuery, [employeeId]),
      this.db.query(attendanceQuery, [
        employeeId,
        startDate,
        endDate,
      ]),
      this.db.query(leaveQuery, [
        employeeId,
        startDate,
        endDate,
      ]),
    ]);

    return {
      employee: employeeResult.rows[0] || null,
      attendance: attendanceResult.rows,
      leaves: leaveResult.rows,
      date_range: {
        start_date: startDate,
        end_date: endDate,
      },
    };
  }
}

module.exports = ReportModel;