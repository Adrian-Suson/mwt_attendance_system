const PublicUpload = require("../models/publicUpload");
const { getClient } = require("../db");
const { downloadFromGoogleDrive } = require("./googleDriveService");
const { sendBrevoEmail } = require("./brevoEmailService");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatManilaDateTime(value) {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function safeAttachmentName(fileName) {
  const name = String(fileName || "DTR-evidence.jpg")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\r\n]/g, "_");
  return name || "DTR-evidence.jpg";
}

async function readImageBuffer(filePath) {
  const { stream, mimeType } = await downloadFromGoogleDrive(filePath);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return { buffer: Buffer.concat(chunks), mimeType };
}

async function sendDtrEvidenceNotification(
  upload,
  imageBuffer,
  imageMimeType,
  attachmentName,
) {
  if (upload.brevo_notified_at) return { sent: false, alreadySent: true };
  if (!["Time In", "Time Out"].includes(upload.attendance_type)) {
    return { sent: false, skipped: true };
  }
  if (!upload.evidence_file_path && !imageBuffer) {
    throw new Error("The saved DTR does not have an evidence image.");
  }

  let attachment = imageBuffer
    ? { buffer: imageBuffer, mimeType: imageMimeType }
    : await readImageBuffer(upload.evidence_file_path);

  if (!attachment.mimeType?.startsWith("image/")) {
    throw new Error("The saved DTR evidence is not a supported image.");
  }

  const employeeName = upload.employee_name || "Unknown employee";
  const attendanceType = upload.attendance_type;
  const capturedAt = formatManilaDateTime(upload.capture_datetime);
  const location = upload.location || "Not recorded";
  const fileName = safeAttachmentName(attachmentName || upload.file_name);

  await sendBrevoEmail({
    subject: `DTR ${attendanceType}: ${employeeName}`,
    textContent: [
      `Employee: ${employeeName}`,
      `Attendance: ${attendanceType}`,
      `Captured: ${capturedAt} (Philippines time)`,
      `Location: ${location}`,
      "The DTR evidence image is attached.",
    ].join("\n"),
    htmlContent: `<h2>DTR ${escapeHtml(attendanceType)}</h2>
      <p><strong>Employee:</strong> ${escapeHtml(employeeName)}</p>
      <p><strong>Captured:</strong> ${escapeHtml(capturedAt)} (Philippines time)</p>
      <p><strong>Location:</strong> ${escapeHtml(location)}</p>
      <p>The DTR evidence image is attached.</p>`,
    attachments: [{
      name: fileName,
      content: attachment.buffer.toString("base64"),
    }],
  });

  await PublicUpload.markBrevoNotificationSent(upload.id);
  return { sent: true };
}

async function getOpenAttendanceRecords() {
  const client = getClient();
  const result = await client.query(
    `SELECT ar.id AS attendance_record_id,
            ar.attendance_date::text AS attendance_date,
            ar.check_in::text AS check_in,
            e.first_name || ' ' || e.last_name AS employee_name,
            COALESCE(es.time_in, e.time_in, TIME '08:00')::text AS scheduled_time_in,
            COALESCE(es.time_out, e.time_out, TIME '17:00')::text AS scheduled_time_out
     FROM attendance_records ar
     JOIN employees e ON e.id = ar.employee_id
     LEFT JOIN employee_schedules es
       ON es.employee_id = ar.employee_id
      AND es.schedule_date = ar.attendance_date
     WHERE ar.check_in IS NOT NULL
       AND ar.check_out IS NULL
       AND ar.attendance_date <=
         (NOW() AT TIME ZONE 'Asia/Manila')::date - 1
       AND (
         ar.attendance_date +
           COALESCE(es.time_out, e.time_out, TIME '17:00') +
           CASE
             WHEN COALESCE(es.time_out, e.time_out, TIME '17:00') <
                  COALESCE(es.time_in, e.time_in, TIME '08:00')
             THEN INTERVAL '1 day'
             ELSE INTERVAL '0 days'
           END
       ) <= NOW() AT TIME ZONE 'Asia/Manila'
     ORDER BY ar.attendance_date ASC, employee_name ASC`,
  );
  return result.rows;
}

async function sendOpenAttendanceAlert() {
  const records = await getOpenAttendanceRecords();
  if (!records.length) return { count: 0, sent: false };

  const rows = records.map((record) => `<tr>
    <td>${escapeHtml(record.employee_name)}</td>
    <td>${escapeHtml(record.attendance_date)}</td>
    <td>${escapeHtml(String(record.check_in).slice(0, 8))}</td>
    <td>${escapeHtml(String(record.scheduled_time_out).slice(0, 8))}</td>
  </tr>`).join("");
  const details = records.map((record) =>
    `- ${record.employee_name}: ${record.attendance_date}, time-in ${String(record.check_in).slice(0, 8)}, scheduled time-out ${String(record.scheduled_time_out).slice(0, 8)}`,
  ).join("\n");

  await sendBrevoEmail({
    subject: `Attendance alert: ${records.length} DTR record(s) missing time-out`,
    textContent: `These employees have an open DTR after their scheduled time-out:\n\n${details}`,
    htmlContent: `<h2>Open attendance records</h2>
      <p>These employees have a time-in but no time-out after their scheduled time-out.</p>
      <table border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>Employee</th><th>Work date</th><th>Time-in</th><th>Scheduled time-out</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
  });

  return { count: records.length, sent: true };
}

module.exports = {
  sendDtrEvidenceNotification,
  sendOpenAttendanceAlert,
};
