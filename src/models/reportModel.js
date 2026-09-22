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
        s.time_in AS scheduled_time_in,
        s.time_out AS scheduled_time_out,
        e.status,
        e.hire_date
      FROM employees e
      LEFT JOIN chapels c
        ON c.id = e.chapel_id
      LEFT JOIN employee_schedules s
        ON s.employee_id = e.id
       AND s.schedule_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
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

    const result = await this.db.query(query, [startDate, endDate]);

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

    const result = await this.db.query(query, [startDate, endDate]);

    return result.rows;
  }

  async getSchedules(startDate, endDate) {
    const query = `
      SELECT employee_id, schedule_date, time_in, time_out
      FROM employee_schedules
      WHERE schedule_date BETWEEN $1 AND $2
      ORDER BY employee_id ASC, schedule_date ASC
    `;
    const result = await this.db.query(query, [startDate, endDate]);
    return result.rows;
  }

  async getDayOffs(startDate, endDate) {
    const query = `
      SELECT employee_id, day_off_date, notes
      FROM employee_day_offs
      WHERE day_off_date BETWEEN $1 AND $2
      ORDER BY employee_id ASC, day_off_date ASC
    `;
    const result = await this.db.query(query, [startDate, endDate]);
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
    const [employees, attendance, leaves, schedules, day_offs] =
      await Promise.all([
        this.getEmployees(),
        this.getAttendance(startDate, endDate),
        this.getLeaves(startDate, endDate),
        this.getSchedules(startDate, endDate),
        this.getDayOffs(startDate, endDate),
      ]);

    return {
      employees,
      attendance,
      leaves,
      schedules,
      day_offs,
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
        s.time_in AS scheduled_time_in,
        s.time_out AS scheduled_time_out,
        e.status,
        e.hire_date
      FROM employees e
      LEFT JOIN chapels c
        ON c.id = e.chapel_id
      LEFT JOIN employee_schedules s
        ON s.employee_id = e.id
       AND s.schedule_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
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
      scheduleResult,
      dayOffResult,
    ] = await Promise.all([
      this.db.query(employeeQuery, [employeeId]),
      this.db.query(attendanceQuery, [employeeId, startDate, endDate]),
      this.db.query(leaveQuery, [employeeId, startDate, endDate]),
      this.db.query(
        `SELECT employee_id, schedule_date, time_in, time_out
         FROM employee_schedules
         WHERE employee_id = $1 AND schedule_date BETWEEN $2 AND $3
         ORDER BY schedule_date ASC`,
        [employeeId, startDate, endDate],
      ),
      this.db.query(
        `SELECT employee_id, day_off_date, notes
         FROM employee_day_offs
         WHERE employee_id = $1 AND day_off_date BETWEEN $2 AND $3
         ORDER BY day_off_date ASC`,
        [employeeId, startDate, endDate],
      ),
    ]);

    return {
      employee: employeeResult.rows[0] || null,
      attendance: attendanceResult.rows,
      leaves: leaveResult.rows,
      schedules: scheduleResult.rows,
      day_offs: dayOffResult.rows,
      date_range: {
        start_date: startDate,
        end_date: endDate,
      },
    };
  }
}

module.exports = ReportModel;
