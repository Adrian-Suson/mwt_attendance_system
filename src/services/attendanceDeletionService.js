const { getClient } = require("../db");
const { deleteFromGoogleDrive } = require("./googleDriveService");

async function deleteAttendanceRecordAndUploads(attendanceRecordId) {
  const pool = getClient();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const attendance = await client.query(
      "SELECT id FROM attendance_records WHERE id = $1 FOR UPDATE",
      [attendanceRecordId],
    );

    if (!attendance.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const uploads = await client.query(
      `SELECT id, file_path
       FROM public_uploads
       WHERE attendance_record_id = $1
       FOR UPDATE`,
      [attendanceRecordId],
    );

    for (const upload of uploads.rows) {
      await deleteFromGoogleDrive(upload.file_path);
    }

    await client.query(
      "DELETE FROM public_uploads WHERE attendance_record_id = $1",
      [attendanceRecordId],
    );
    const removed = await client.query(
      "DELETE FROM attendance_records WHERE id = $1 RETURNING id",
      [attendanceRecordId],
    );

    await client.query("COMMIT");
    return removed.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { deleteAttendanceRecordAndUploads };
