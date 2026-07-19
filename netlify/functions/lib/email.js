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

const buildAcceptanceEmail = ({ application }) => {
  const firstName = String(application.name || "").trim().split(/\s+/)[0] || "there";
  const vehicleLabel = buildVehicleLabel(application) || "your vehicle";

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
                  We reviewed your application and we are excited to have your <strong>${escapeHtml(vehicleLabel)}</strong> on Lloyd Avenue on July 19th. Because you applied in advance, your registration is <strong>free</strong> and your spot is secured — no payment required.
                </p>

                <h2 style="margin:0 0 12px;font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#6f7f46;">Event Details</h2>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:24px;">
                  ${detailRow("Event", escapeHtml(BLOCK_PARTY_CONFIG.name))}
                  ${detailRow("Date", escapeHtml(BLOCK_PARTY_CONFIG.dateDisplay))}
                  ${detailRow("Location", escapeHtml(BLOCK_PARTY_CONFIG.location))}
                  ${detailRow("Show hours", escapeHtml(BLOCK_PARTY_CONFIG.showHours))}
                  ${detailRow("Car check-in", escapeHtml(BLOCK_PARTY_CONFIG.checkIn))}
                  ${detailRow("Advance registration", "Free")}
                </table>

                ${buildCarDetailsSection(application)}

                <h2 style="margin:0 0 12px;font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#6f7f46;">What Happens Next</h2>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
                  Closer to the event you will receive a final details email with your exact display spot, check-in instructions, dash plaque details, and the full day schedule.
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
                  On the day of the event please check in at the registration booth on Lloyd Avenue at 2:00 PM with this confirmation email. Your dash plaque and car number will be waiting for you.
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
    `We are excited to have your ${vehicleLabel} on Lloyd Avenue on July 19th. Because you applied in advance, your registration is free and your spot is secured — no payment required.`,
    "",
    "EVENT DETAILS",
    `Event: ${BLOCK_PARTY_CONFIG.name}`,
    `Date: ${BLOCK_PARTY_CONFIG.dateDisplay}`,
    `Location: ${BLOCK_PARTY_CONFIG.location}`,
    `Show hours: ${BLOCK_PARTY_CONFIG.showHours}`,
    `Car check-in: ${BLOCK_PARTY_CONFIG.checkIn}`,
    "Advance registration: Free",
    "",
    buildCarDetailsText(application),
    "",
    "WHAT HAPPENS NEXT",
    "Closer to the event you will receive a final details email with check-in instructions and show details.",
    "Please check in at the registration booth on Lloyd Avenue at 2:00 PM with this confirmation email.",
    "",
    "See you there.",
    "Giant Tsai",
    "Founder, Nova North Shore",
  ].join("\n");

  return { subject, html, text };
};

const sendAcceptanceEmail = async ({ application }) => {
  const resend = new Resend(requiredEnv("RESEND_API_KEY"));
  const { subject, html, text } = buildAcceptanceEmail({ application });

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

const buildPaymentConfirmationEmail = ({ application, sessionId, amountPaid }) => {
  const firstName = String(application.name || "").trim().split(/\s+/)[0] || "there";
  const vehicleLabel = buildVehicleLabel(application) || "your vehicle";
  const amountDisplay = amountPaid || BLOCK_PARTY_CONFIG.price.amountDisplay;
  const receiptRef = String(sessionId || "").trim();

  const subject = "Payment Confirmed - Nova North Shore Block Party Car Show";

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
                  Thank you — your registration payment has been received and your spot at the Nova North Shore Block Party Car Show is <strong>confirmed.</strong>
                </p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
                  We are excited to have your <strong>${escapeHtml(vehicleLabel)}</strong> on Lloyd Avenue on July 19th. Please save this email as your receipt.
                </p>

                <h2 style="margin:0 0 12px;font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#6f7f46;">Payment Receipt</h2>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:24px;">
                  ${detailRow("Name", escapeHtml(application.name))}
                  ${detailRow("Vehicle", escapeHtml(vehicleLabel))}
                  ${detailRow("Amount paid", escapeHtml(amountDisplay))}
                  ${receiptRef ? detailRow("Confirmation", escapeHtml(receiptRef)) : ""}
                </table>

                <h2 style="margin:0 0 12px;font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#6f7f46;">Event Details</h2>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:24px;">
                  ${detailRow("Event", escapeHtml(BLOCK_PARTY_CONFIG.name))}
                  ${detailRow("Date", escapeHtml(BLOCK_PARTY_CONFIG.dateDisplay))}
                  ${detailRow("Location", escapeHtml(BLOCK_PARTY_CONFIG.location))}
                  ${detailRow("Show hours", escapeHtml(BLOCK_PARTY_CONFIG.showHours))}
                  ${detailRow("Car check-in", escapeHtml(BLOCK_PARTY_CONFIG.checkIn))}
                </table>

                ${buildCarDetailsSection(application)}

                <h2 style="margin:0 0 12px;font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#6f7f46;">What Happens Next</h2>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
                  Closer to the event you will receive a final details email with your exact display spot, check-in instructions, dash plaque details, and the full day schedule.
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
                  On the day of the event please check in at the registration booth on Lloyd Avenue at 2:00 PM with this confirmation email. Your dash plaque and car number will be waiting for you.
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
    "Thank you — your registration payment has been received and your spot at the Nova North Shore Block Party Car Show is confirmed.",
    "",
    `We are excited to have your ${vehicleLabel} on Lloyd Avenue on July 19th. Please save this email as your receipt.`,
    "",
    "PAYMENT RECEIPT",
    `Name: ${application.name}`,
    `Vehicle: ${vehicleLabel}`,
    `Amount paid: ${amountDisplay}`,
    receiptRef ? `Confirmation: ${receiptRef}` : "",
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
    "See you there.",
    "Giant Tsai",
    "Founder, Nova North Shore",
  ].filter(Boolean).join("\n");

  return { subject, html, text };
};

const sendPaymentConfirmationEmail = async ({ application, sessionId, amountPaid }) => {
  const resend = new Resend(requiredEnv("RESEND_API_KEY"));
  const { subject, html, text } = buildPaymentConfirmationEmail({ application, sessionId, amountPaid });

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

const EVENT_INFO_FLYER_CID = "nova-event-info-flyer";

const buildEventInfoEmail = ({ application }) => {
  const firstName = String(application.name || "").trim().split(/\s+/)[0] || "there";
  const vehicleLabel = buildVehicleLabel(application) || "your vehicle";

  const subject = "Event Info - Nova North Shore Block Party Car Show";

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
                  Final event info for Sunday — everything you need for your <strong>${escapeHtml(vehicleLabel)}</strong> is in the flyer below.
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#333;">
                  <strong>Show car roll-in:</strong> 2:00 PM – 3:00 PM<br />
                  <strong>Entrance:</strong> West side of 14th Street, from Pemberton Avenue<br />
                  All registered show vehicles must be parked before the event opens at 3:00 PM.
                </p>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#555;">
                  Save this email and bring it with you to check-in.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 16px 32px;text-align:center;">
                <img
                  src="cid:${EVENT_INFO_FLYER_CID}"
                  alt="Nova Block Party Car Show event info flyer"
                  width="568"
                  style="display:block;width:100%;max-width:568px;height:auto;border:0;margin:0 auto;"
                />
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <p style="margin:0 0 4px;font-size:15px;">See you on Lloyd Avenue.</p>
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
    `Final event info for Sunday — everything you need for your ${vehicleLabel} is in the attached flyer.`,
    "",
    "Show car roll-in: 2:00 PM – 3:00 PM",
    "Entrance: West side of 14th Street, from Pemberton Avenue",
    "All registered show vehicles must be parked before the event opens at 3:00 PM.",
    "",
    "See you on Lloyd Avenue.",
    "Giant Tsai",
    "Founder, Nova North Shore",
  ].join("\n");

  return { subject, html, text };
};

const sendEventInfoEmail = async ({ application, flyerBuffer }) => {
  if (!flyerBuffer || !Buffer.isBuffer(flyerBuffer)) {
    throw new Error("Missing event info flyer attachment.");
  }

  const resend = new Resend(requiredEnv("RESEND_API_KEY"));
  const { subject, html, text } = buildEventInfoEmail({ application });

  const { data, error } = await resend.emails.send({
    from: getFromAddress(),
    to: [application.email],
    subject,
    html,
    text,
    attachments: [
      {
        filename: "nova-block-party-event-info.png",
        content: flyerBuffer,
        contentId: EVENT_INFO_FLYER_CID,
        contentType: "image/png",
      },
    ],
  });

  if (error) {
    throw new Error(`Resend failed: ${error.message || JSON.stringify(error)}`);
  }

  return data;
};

const buildVotingOtpEmail = ({ code }) => {
  const safeCode = escapeHtml(code);
  const subject = `${code} is your Nova Block Party voting code`;
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0a0a0a;padding:26px 30px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:21px;letter-spacing:0.06em;text-transform:uppercase;">Nova North Shore</h1>
                <p style="margin:6px 0 0;color:#c7d0a8;font-size:14px;letter-spacing:0.12em;text-transform:uppercase;">Block Party Voting</p>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 30px;text-align:center;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.5;">Enter this code to confirm your ballot:</p>
                <p style="margin:0 0 20px;font-size:38px;line-height:1;font-weight:800;letter-spacing:0.18em;">${safeCode}</p>
                <p style="margin:0;color:#555;font-size:14px;line-height:1.5;">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = [
    "Nova North Shore Block Party Voting",
    "",
    `Your verification code is: ${code}`,
    "",
    "This code expires in 10 minutes. If you did not request it, ignore this email.",
  ].join("\n");

  return { subject, html, text };
};

const sendVotingOtpEmail = async ({ email, code }) => {
  const resend = new Resend(requiredEnv("RESEND_API_KEY"));
  const { subject, html, text } = buildVotingOtpEmail({ code });
  let lastError;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [email],
      subject,
      html,
      text,
    });

    if (!error) {
      return data;
    }

    lastError = error;
    const status = Number(error.statusCode || error.status || 0);
    const retryable = status === 429
      || status >= 500
      || /rate limit|too many requests|temporar/i.test(String(error.message || ""));
    if (!retryable || attempt === 4) {
      break;
    }

    const delay = (500 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 350);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(`Resend failed: ${lastError?.message || JSON.stringify(lastError)}`);
};

module.exports = {
  buildAcceptanceEmail,
  sendAcceptanceEmail,
  buildPaymentConfirmationEmail,
  sendPaymentConfirmationEmail,
  buildEventInfoEmail,
  sendEventInfoEmail,
  buildVotingOtpEmail,
  sendVotingOtpEmail,
};
