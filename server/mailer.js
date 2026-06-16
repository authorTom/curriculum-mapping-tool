// Email notifications. Fully optional: if SMTP is not configured the app still
// works - messages are logged to the console instead of being sent. Configure
// by setting SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM (and
// optionally APP_URL for links in emails).
let transport = null;
let configured = false;

try {
  if (process.env.SMTP_HOST) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE) === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    configured = true;
  }
} catch (e) {
  console.warn('Email disabled: could not initialise SMTP transport -', e.message);
}

const FROM = process.env.MAIL_FROM || 'Curriculum Mapping Tool <no-reply@localhost>';
const APP_URL = process.env.APP_URL || '';

// Fire-and-forget: never let email problems break a request.
async function sendMail(to, subject, body) {
  if (!to) return;
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to];
  if (recipients.length === 0) return;
  const text = APP_URL ? `${body}\n\n${APP_URL}` : body;
  if (!configured) {
    console.log(`[email:not-configured] To: ${recipients.join(', ')} | ${subject}`);
    return;
  }
  try {
    await transport.sendMail({ from: FROM, to: recipients.join(', '), subject, text });
  } catch (e) {
    console.warn('Email send failed:', e.message);
  }
}

module.exports = { sendMail, emailConfigured: () => configured };
