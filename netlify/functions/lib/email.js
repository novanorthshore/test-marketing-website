const { Resend } = require("resend");
const { BLOCK_PARTY_CONFIG } = require("./event-config");

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const getFromAddress = () => process.env.EMAIL_FROM || "Nova North Shore <events@novanorthshore.com>";

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");


const buildVehicleLabel = (application) => [
  application.vehicleYear,
  application.vehicleMake,
  application.vehicleModel,
].map((part) => String(part || "").trim()).filter(Boolean).join(" ");

const buildCarDetailsSection = (application) => {
  const carNumber = String(application.carNumber || "").trim();
  const category = String(application.category || "").trim();
  const displayZone = String(application.displayZone || "").trim();
  const hasAssignments = Boolean(carNumber || category || displayZone);

  const heading = `<h2 style="margin:0 0 12px;font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#6f7f46;">Your Car Details</h2>`;

  if (!hasAssignments) {
    return `${heading}
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
                  Your car number, show category, and display zone will be assigned to you at check-in when you arrive on Lloyd Avenue.
                </p>`;
  }

  const detailRow = (label, value) => `
    <tr>
      <td style="padding:4px 0;color:#555;font-size:14px;">${escapeHtml(label)}</td>
      <td style="padding:4px 0;color:#111;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(value)}</td>
    </tr>`;

  return `${heading}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:24px;">
                  ${carNumber ? detailRow("Car number", carNumber) : ""}
                  ${category ? detailRow("Category", category) : ""}
                  ${displayZone ? detailRow("Display zone", displayZone) : ""}
                </table>
                <p style="margin:-12px 0 24px;font-size:14px;line-height:1.5;color:#555;">
                  Any remaining show details will be assigned to you at check-in when you arrive on Lloyd Avenue.
                </p>`;
};

const buildCarDetailsText = (application) => {
  const carNumber = String(application.carNumber || "").trim();
  const category = String(application.category || "").trim();
  const displayZone = String(application.displayZone || "").trim();
  const hasAssignments = Boolean(carNumber || category || displayZone);

  if (!hasAssignments) {
    return [
      "YOUR CAR DETAILS",
      "Your car number, show category, and display zone will be assigned to you at check-in when you arrive on Lloyd Avenue.",
    ].join("\n");
  }

  const lines = ["YOUR CAR DETAILS"];
  if (carNumber) lines.push(`Car number: ${carNumber}`);
  if (category) lines.push(`Category: ${category}`);
  if (displayZone) lines.push(`Display zone: ${displayZone}`);
  lines.push("Any remaining show details will be assigned to you at check-in when you arrive on Lloyd Avenue.");
  return lines.join("\n");
};

const buildAcceptanceEmail = ({ application, paymentUrl, paymentDeadline }) => {
  const firstName = String(application.name || "").trim().split(/\s+/)[0] || "there";
  const vehicleLabel = buildVehicleLabel(application) || "your vehicle";
  const amountDisplay = BLOCK_PARTY_CONFIG.price.amountDisplay;

  const subject = "You're In - Nova North Shore Block Party Car Show";

  const detailRow = (label, value) => `
    <tr>
      <td style="padding:4px 0;color:#555;font-size:14px;">${escapeHtml(label)}</td>
      <td style="padding:4px 0;color:#111;font-size:14px;font-weight:700;text-align:right;">${value}</td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0a0a0a;padding:28px 32px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:0.06em;text-transform:uppercase;">Nova North Shore</h1>
                <p style="margin:6px 0 0;color:#c7d0a8;font-size:15px;letter-spacing:0.14em;text-transform:uppercase;">Block Party Car Show</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(firstName)},</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
                  Congratulations, your application for the Nova North Shore Block Party Car Show has been <strong>approved!</strong>
                </p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
                  We reviewed your application and we are excited to have your <strong>${escapeHtml(vehicleLabel)}</strong> on Lloyd Avenue on July 19th. Here are your confirmed details.
                </p>

                <h2 style="margin:0 0 12px;font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#6f7f46;">Event Details</h2>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:24px;">
                  ${detailRow("Event", escapeHtml(BLOCK_PARTY_CONFIG.name))}
                  ${detailRow("Date", escapeHtml(BLOCK_PARTY_CONFIG.dateDisplay))}
                  ${detailRow("Location", escapeHtml(BLOCK_PARTY_CONFIG.location))}
                  ${detailRow("Show hours", escapeHtml(BLOCK_PARTY_CONFIG.showHours))}
                  ${detailRow("Car check-in", escapeHtml(BLOCK_PARTY_CONFIG.checkIn))}
                </table>

                ${buildCarDetailsSection(application)}

                <h2 style="margin:0 0 12px;font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#6f7f46;">Complete Your Registration</h2>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">
                  To secure your spot, please complete your registration fee payment of <strong>${escapeHtml(amountDisplay)}</strong> using the button below. Spots are not held until payment is received.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                  <tr>
                    <td style="border-radius:8px;background:#0a0a0a;">
                      <a href="${escapeHtml(paymentUrl)}" style="display:inline-block;padding:16px 32px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:0.06em;text-transform:uppercase;">Pay Registration Fee</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 28px;font-size:14px;color:#555;">Payment deadline: <strong>${escapeHtml(paymentDeadline)}</strong></p>

                <h2 style="margin:0 0 12px;font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#6f7f46;">What Happens Next</h2>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
                  Once payment is confirmed you will receive a final details email closer to the event with your exact display spot, check-in instructions, dash plaque details, and the full day schedule.
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
                  On the day of the event please check in at the registration booth on Lloyd Avenue at 2:00 PM with your confirmation email. Your dash plaque and car number will be waiting for you.
                </p>

                <h2 style="margin:0 0 12px;font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#6f7f46;">A Few Things To Know</h2>
                <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.6;color:#333;">
                  <li>All vehicles must be in place by 2:45 PM. No vehicles will be permitted onto the show field after 3:00 PM.</li>
                  <li>Vehicles may not leave the display area until the official end of the show at 7:00 PM.</li>
                  <li>Your Instagram handle will be featured on your dash plaque and voting profile, so make sure it is spelled correctly in your application. Reply to this email if you need to update it.</li>
                </ul>

                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
                  We are putting everything into making this the best car show North Vancouver has seen and we cannot wait to have your car at the show.
                </p>
                <p style="margin:0 0 4px;font-size:15px;">See you there.</p>
                <p style="margin:24px 0 0;font-size:15px;font-weight:700;">Giant Tsai</p>
                <p style="margin:2px 0 0;font-size:14px;color:#555;">Founder, Nova North Shore</p>
              </td>
            </tr>
            <tr>
              <td style="background:#0a0a0a;padding:18px 32px;text-align:center;">
                <p style="margin:0;color:#888;font-size:12px;">Nova North Shore &bull; North Vancouver, BC</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${firstName},`,
    "",
    "Congratulations, your application for the Nova North Shore Block Party Car Show has been approved!",
    "",
    `We are excited to have your ${vehicleLabel} on Lloyd Avenue on July 19th. Here are your confirmed details.`,
    "",
    "EVENT DETAILS",
    `Event: ${BLOCK_PARTY_CONFIG.name}`,
    `Date: ${BLOCK_PARTY_CONFIG.dateDisplay}`,
    `Location: ${BLOCK_PARTY_CONFIG.location}`,
    `Show hours: ${BLOCK_PARTY_CONFIG.showHours}`,
    `Car check-in: ${BLOCK_PARTY_CONFIG.checkIn}`,
    "",
    buildCarDetailsText(application),
    "",
    "COMPLETE YOUR REGISTRATION",
    `Registration fee: ${amountDisplay}`,
    `Pay here: ${paymentUrl}`,
    `Payment deadline: ${paymentDeadline}`,
    "",
    "Spots are not held until payment is received.",
    "",
    "See you there.",
    "Giant Tsai",
    "Founder, Nova North Shore",
  ].join("\n");

  return { subject, html, text };
};

const sendAcceptanceEmail = async ({ application, paymentUrl, paymentDeadline }) => {
  const resend = new Resend(requiredEnv("RESEND_API_KEY"));
  const { subject, html, text } = buildAcceptanceEmail({ application, paymentUrl, paymentDeadline });

  const { data, error } = await resend.emails.send({
    from: getFromAddress(),
    to: [application.email],
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(`Resend failed: ${error.message || JSON.stringify(error)}`);
  }

  return data;
};

module.exports = {
  buildAcceptanceEmail,
  sendAcceptanceEmail,
};
