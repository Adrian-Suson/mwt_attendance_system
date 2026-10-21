const BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

function getEmailConfiguration() {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const recipientEmail = process.env.BREVO_NOTIFICATION_EMAIL;

  if (!apiKey) throw new Error("BREVO_API_KEY is not configured.");
  if (!senderEmail) throw new Error("BREVO_SENDER_EMAIL is not configured.");
  if (!recipientEmail) {
    throw new Error("BREVO_NOTIFICATION_EMAIL is not configured.");
  }

  return {
    apiKey,
    sender: {
      name: process.env.BREVO_SENDER_NAME || "Attendance System",
      email: senderEmail,
    },
    recipient: { email: recipientEmail },
  };
}

async function sendBrevoEmail({ subject, htmlContent, textContent, attachments }) {
  const config = getEmailConfiguration();
  const response = await fetch(BREVO_EMAIL_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": config.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: config.sender,
      to: [config.recipient],
      subject,
      htmlContent,
      textContent,
      ...(attachments?.length ? { attachment: attachments } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Brevo email request failed (${response.status}): ${responseBody || response.statusText}`,
    );
  }

  return response.json();
}

module.exports = { sendBrevoEmail };
