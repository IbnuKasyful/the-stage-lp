/**
 * ================================================================
 *  The Stage LP  →  Google Sheets CRM  +  Auto-reply Emails
 *  The Family Village
 * ================================================================
 *  What this does on every form submission from the landing page:
 *   1. Saves the lead to the spreadsheet
 *        "Trial Bookings"  ← trial class form
 *        "Playbook Leads"  ← lead magnet form
 *   2. Emails the visitor:
 *        Trial  → booking confirmation + WhatsApp Community link
 *        Lead   → Confident Kid Playbook PDF (attachment) + WhatsApp Community link
 *   3. (Optional) Notifies the team at NOTIFY_EMAIL
 *   4. Writes the email result into the "email_status" column
 *
 *  SETUP: see apps-script/README.md
 * ================================================================
 */

const CONFIG = {
  // Leave empty if this script is created from the spreadsheet (Extensions → Apps Script).
  // Otherwise paste the spreadsheet ID (the long string in the sheet URL).
  SPREADSHEET_ID: "",

  // DUMMY link – replace with the real WhatsApp Community invite link.
  WA_COMMUNITY_URL: "https://chat.whatsapp.com/DUMMY-TheFamilyVillage-Community",

  // WhatsApp number for direct chat (country code, no +).
  WA_CHAT_NUMBER: "60175667315",

  // Confident Kid Playbook PDF (file coming later).
  // RECOMMENDED: set it WITHOUT redeploying via Project Settings (⚙️) → Script Properties →
  //   Property: PLAYBOOK_PDF   Value: the Google Drive link (or file ID) of the PDF.
  // The Script Property wins over the value below. A full Drive link or a bare ID both work.
  // While empty, leads still get an email saying the PDF is on its way, and are
  // marked "PDF pending". Run sendPendingPlaybooks() once the file is added.
  PLAYBOOK_PDF_FILE_ID: "",
  PLAYBOOK_FILE_NAME: "The-Confident-Kid-Playbook.pdf",

  LP_URL: "https://stage.familyvillage.pages.dev",
  SENDER_NAME: "The Family Village",
  REPLY_TO: "",       // e.g. "hello@the-family-village.com" (optional)
  NOTIFY_EMAIL: ""    // team inbox for new-lead alerts (optional)
};

const SHEETS = {
  trial_booking: {
    name: "Trial Bookings",
    headers: ["submitted_at", "lead_status", "email_status", "parent_name", "email", "whatsapp_full",
      "country_code", "whatsapp", "location", "child_name", "child_age", "age_group", "goals",
      "child_personality", "preferred_days", "heard_from", "notes", "consent",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "page"]
  },
  lead_magnet: {
    name: "Playbook Leads",
    headers: ["submitted_at", "lead_status", "email_status", "parent_name", "email", "whatsapp",
      "child_age_group", "location", "consent",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "page"]
  }
};
const SKIP_KEYS = ["form_type", "company"];
const STATUS_PDF_PENDING = "Sent – PDF pending";

/* ================================================================
   Web app entry points
   ================================================================ */
function doPost(e) {
  try {
    const result = handleSubmission_((e && e.parameter) || {});
    return json_(result);
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: "The Stage LP form endpoint" });
}

/* ================================================================
   Core
   ================================================================ */
function handleSubmission_(p) {
  if (p.company) return { ok: true, skipped: "honeypot" };          // spam bot
  const type = SHEETS[p.form_type] ? p.form_type : null;
  if (!type) return { ok: false, error: "Unknown form_type" };
  if (!isEmail_(p.email)) return { ok: false, error: "Invalid email" };

  p.submitted_at = p.submitted_at || new Date().toISOString();
  p.lead_status = "New";

  // 1) save to sheet
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let sheet, row, headers;
  try {
    ({ sheet, headers } = getSheet_(type, p));
    row = sheet.getLastRow() + 1;
    const values = headers.map(h => safeCell_(h === "email_status" ? "Sending…" : p[h]));
    sheet.getRange(row, 1, 1, headers.length).setValues([values]);
  } finally {
    lock.releaseLock();
  }

  // 2) email the visitor
  let status;
  try {
    status = type === "trial_booking" ? sendTrialEmail_(p) : sendPlaybookEmail_(p);
  } catch (err) {
    status = "Error: " + String(err).slice(0, 180);
  }
  sheet.getRange(row, headers.indexOf("email_status") + 1).setValue(status);

  // 3) notify team
  if (CONFIG.NOTIFY_EMAIL) {
    try { notifyTeam_(type, p); } catch (err) { console.warn(err); }
  }
  return { ok: true, row: row, email_status: status };
}

function getSheet_(type, p) {
  const ss = CONFIG.SPREADSHEET_ID ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const def = SHEETS[type];
  let sheet = ss.getSheetByName(def.name);
  if (!sheet) {
    sheet = ss.insertSheet(def.name);
    sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers])
      .setFontWeight("bold").setBackground("#ED9849").setFontColor("#292822");
    sheet.setFrozenRows(1);
  }
  let headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].filter(String);
  // add any new field from the form as a new column
  const extra = Object.keys(p).filter(k => SKIP_KEYS.indexOf(k) === -1 && headers.indexOf(k) === -1);
  if (extra.length) {
    sheet.getRange(1, headers.length + 1, 1, extra.length).setValues([extra])
      .setFontWeight("bold").setBackground("#ED9849").setFontColor("#292822");
    headers = headers.concat(extra);
  }
  return { sheet, headers };
}

/* ================================================================
   Emails
   ================================================================ */
function sendTrialEmail_(p) {
  const first = firstName_(p.parent_name);
  const child = esc_(p.child_name || "your child");
  const rows = [
    ["Child", `${child} (${esc_(p.child_age || "-")} y/o)`],
    ["Age group", esc_(p.age_group || "-")],
    ["Preferred days", esc_(p.preferred_days || "-")],
    ["Based in", esc_(p.location || "-")],
    ["Trial fee", "RM55 · one session"]
  ];
  const body = `
    <p style="margin:0 0 16px">Hi ${esc_(first)},</p>
    <p style="margin:0 0 16px">Thank you for booking a <b>The Stage trial class</b> for ${child}! 🎭 We can't wait to see them take the stage.</p>
    ${summaryTable_(rows)}
    <h3 style="font-family:Arial,sans-serif;font-size:17px;color:#292822;margin:26px 0 10px">What happens next</h3>
    <ol style="margin:0 0 20px;padding-left:20px;line-height:1.7">
      <li>We'll WhatsApp you on <b>${esc_(p.whatsapp_full || p.whatsapp || "your number")}</b> to confirm the slot.</li>
      <li>We'll share the payment details for the RM55 trial.</li>
      <li>${child} joins a real class, then you decide on the 8-week program (RM420).</li>
    </ol>
    ${communityBlock_()}
    <p style="margin:22px 0 0">Can't wait to meet you both,<br><b>Melissa &amp; The Family Village team</b></p>`;
  MailApp.sendEmail(mailOpts_({
    to: p.email,
    subject: `🎭 ${p.child_name || "Your child"}'s The Stage trial request is in!`,
    htmlBody: layout_("Your trial request is in!", body),
    body: plain_([
      `Hi ${first},`, "",
      `Thank you for booking a The Stage trial class for ${p.child_name}!`,
      `Age group: ${p.age_group} · Preferred days: ${p.preferred_days} · Trial fee: RM55`, "",
      "Next: we'll WhatsApp you to confirm the slot and share payment details.", "",
      `Join our WhatsApp Community: ${CONFIG.WA_COMMUNITY_URL}`,
      `Chat with us: https://wa.me/${CONFIG.WA_CHAT_NUMBER}`, "",
      "Melissa & The Family Village team"
    ])
  }));
  return "Sent";
}

function sendPlaybookEmail_(p) {
  const first = firstName_(p.parent_name);
  const pdf = getPlaybookPdf_();
  const pdfText = pdf
    ? `<p style="margin:0 0 16px">Your free <b>Confident Kid Playbook</b> is attached to this email 📎. Inside you'll find 7 screen-free drama &amp; speech games you can play at home in under 10 minutes a day.</p>`
    : `<p style="margin:0 0 16px">Thank you for requesting the <b>Confident Kid Playbook</b>! We're putting the finishing touches on it, and <b>we'll send the PDF to this email as soon as it's ready</b>.</p>`;
  const body = `
    <p style="margin:0 0 16px">Hi ${esc_(first)},</p>
    ${pdfText}
    <div style="background:#FFFAEF;border:1px solid #F1E3CF;border-radius:16px;padding:18px 20px;margin:0 0 22px">
      <p style="margin:0 0 8px;font-weight:bold;color:#292822">Try this tonight: “Mirror, Mirror” 🪞</p>
      <p style="margin:0;font-size:14px;line-height:1.6">Face your child and take turns copying each other's movements and faces, slowly at first and then faster. It builds focus, body confidence and lots of giggles.</p>
    </div>
    ${communityBlock_()}
    <div style="text-align:center;margin:26px 0 6px">
      <p style="margin:0 0 12px;color:#292822">Ready to see your child on a real stage?</p>
      ${button_("Book a Trial Class · RM55", CONFIG.LP_URL + "/#book", "#292822", "#FFFAEF")}
    </div>
    <p style="margin:22px 0 0">Warmly,<br><b>Melissa &amp; The Family Village team</b></p>`;
  const opts = {
    to: p.email,
    subject: pdf ? "📘 Your free Confident Kid Playbook is here" : "📘 Your Confident Kid Playbook is on its way",
    htmlBody: layout_(pdf ? "Your playbook is here!" : "Your playbook is on its way!", body),
    body: plain_([
      `Hi ${first},`, "",
      pdf ? "Your free Confident Kid Playbook is attached." : "We'll email your Confident Kid Playbook PDF as soon as it's ready.", "",
      `Join our WhatsApp Community: ${CONFIG.WA_COMMUNITY_URL}`,
      `Book a RM55 trial class: ${CONFIG.LP_URL}/#book`, "",
      "Melissa & The Family Village team"
    ])
  };
  if (pdf) opts.attachments = [pdf];
  MailApp.sendEmail(mailOpts_(opts));
  return pdf ? "Sent – with PDF" : STATUS_PDF_PENDING;
}

function getPlaybookPdf_() {
  const raw = (PropertiesService.getScriptProperties().getProperty("PLAYBOOK_PDF") || CONFIG.PLAYBOOK_PDF_FILE_ID || "").trim();
  if (!raw) return null;
  // accept a full Drive link (…/d/<ID>/… or ?id=<ID>) or a bare file ID
  const m = raw.match(/\/d\/([\w-]{20,})/) || raw.match(/[?&]id=([\w-]{20,})/);
  const id = m ? m[1] : raw;
  return DriveApp.getFileById(id).getBlob().setName(CONFIG.PLAYBOOK_FILE_NAME);
}

/**
 * Run this manually once the PDF is ready and PLAYBOOK_PDF_FILE_ID is filled in.
 * Sends the playbook to every lead whose email_status is "Sent – PDF pending".
 */
function sendPendingPlaybooks() {
  if (!getPlaybookPdf_()) throw new Error("Add the PDF first: Project Settings → Script Properties → PLAYBOOK_PDF.");
  const { sheet, headers } = getSheet_("lead_magnet", {});
  const data = sheet.getDataRange().getValues();
  const col = name => headers.indexOf(name);
  let sent = 0;
  for (let r = 1; r < data.length; r++) {
    if (data[r][col("email_status")] !== STATUS_PDF_PENDING) continue;
    const p = {};
    headers.forEach((h, i) => p[h] = String(data[r][i]));
    try {
      const status = sendPlaybookEmail_(p);
      sheet.getRange(r + 1, col("email_status") + 1).setValue(status + " (follow-up)");
      sent++;
    } catch (err) {
      sheet.getRange(r + 1, col("email_status") + 1).setValue("Error: " + String(err).slice(0, 180));
    }
  }
  console.log(`Sent playbook to ${sent} pending lead(s). Remaining daily quota: ${MailApp.getRemainingDailyQuota()}`);
}

function notifyTeam_(type, p) {
  const label = type === "trial_booking" ? "🎭 New trial booking" : "📘 New playbook lead";
  const lines = Object.keys(p).filter(k => SKIP_KEYS.indexOf(k) === -1 && p[k])
    .map(k => `<tr><td style="padding:4px 12px 4px 0;color:#777">${esc_(k)}</td><td style="padding:4px 0"><b>${esc_(p[k])}</b></td></tr>`).join("");
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: `${label}: ${p.child_name || p.parent_name || p.email}`,
    htmlBody: `<table style="font-family:Arial,sans-serif;font-size:14px">${lines}</table>`,
    name: "The Stage LP"
  });
}

/* ================================================================
   Email building blocks (inline styles for email clients)
   ================================================================ */
function layout_(title, inner) {
  const logo = CONFIG.LP_URL + "/assets/img/logo.png";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F6EFE3">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6EFE3;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:22px;overflow:hidden">
        <tr><td style="background:#ED9849;padding:26px 28px;text-align:center">
          <img src="${logo}" width="72" height="72" alt="The Family Village" style="display:inline-block;background:#FFFAEF;border-radius:50%;padding:6px">
          <p style="margin:10px 0 0;font-family:Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#4C4C26;font-weight:bold">The Stage · The Family Village</p>
          <h1 style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:24px;line-height:1.2;color:#292822">${title}</h1>
        </td></tr>
        <tr><td style="padding:28px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#55534A">${inner}</td></tr>
        <tr><td style="background:#292822;padding:18px 28px;text-align:center;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#cfcabd">
          The Family Village · Johor Bahru, Malaysia<br>
          <a href="https://wa.me/${CONFIG.WA_CHAT_NUMBER}" style="color:#ED9849;text-decoration:none">WhatsApp +60 17-566 7315</a> ·
          <a href="https://instagram.com/the.family.village" style="color:#ED9849;text-decoration:none">@the.family.village</a><br>
          <span style="color:#8d887b">You're receiving this because you submitted a form on our website.</span>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function communityBlock_() {
  return `
  <div style="background:#575C33;border-radius:18px;padding:22px;text-align:center;color:#FFFAEF">
    <p style="margin:0 0 6px;font-size:17px;font-weight:bold;color:#FFFAEF">Join our WhatsApp Community 💬</p>
    <p style="margin:0 0 16px;font-size:14px;color:#e8e4d6">400+ families get first dibs on new class slots, holiday workshops &amp; community events.</p>
    ${button_("Join the Community", CONFIG.WA_COMMUNITY_URL, "#ED9849", "#292822")}
    <p style="margin:14px 0 0;font-size:13px"><a href="https://wa.me/${CONFIG.WA_CHAT_NUMBER}" style="color:#FFFAEF">or chat with us directly on WhatsApp</a></p>
  </div>`;
}

function button_(label, url, bg, fg) {
  return `<a href="${url}" style="display:inline-block;background:${bg};color:${fg};font-family:Arial,sans-serif;font-weight:bold;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:999px">${label}</a>`;
}

function summaryTable_(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFAEF;border:1px solid #F1E3CF;border-radius:14px;font-size:14px">
    ${rows.map(([k, v], i) => `<tr><td style="padding:10px 16px;color:#8a7f6c;${i ? "border-top:1px solid #F1E3CF;" : ""}width:38%">${k}</td><td style="padding:10px 16px;color:#292822;font-weight:bold;${i ? "border-top:1px solid #F1E3CF;" : ""}">${v}</td></tr>`).join("")}
  </table>`;
}

/* ================================================================
   Helpers
   ================================================================ */
function mailOpts_(o) {
  o.name = CONFIG.SENDER_NAME;
  if (CONFIG.REPLY_TO) o.replyTo = CONFIG.REPLY_TO;
  return o;
}
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function isEmail_(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim()); }
function firstName_(n) { return String(n || "there").trim().split(/\s+/)[0]; }
function esc_(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function plain_(lines) { return lines.join("\n"); }
// Stop "+60…" phone numbers or "=…" text being read as formulas.
function safeCell_(v) { v = v == null ? "" : String(v); return /^[=+\-@]/.test(v) ? "'" + v : v; }

/* ================================================================
   Tests – run from the editor (also triggers the permission prompt)
   ================================================================ */
function testTrialBooking() {
  console.log(handleSubmission_({
    form_type: "trial_booking", parent_name: "Test Parent", email: Session.getActiveUser().getEmail(),
    country_code: "+60", whatsapp: "12 345 6789", whatsapp_full: "+60 12 345 6789", location: "Johor Bahru",
    child_name: "Aria", child_age: "7", age_group: "5-8", goals: "Confidence, Public speaking",
    preferred_days: "Saturday", heard_from: "Instagram", consent: "Yes", page: "test"
  }));
}
function testLeadMagnet() {
  console.log(handleSubmission_({
    form_type: "lead_magnet", parent_name: "Test Parent", email: Session.getActiveUser().getEmail(),
    child_age_group: "5–8 years", location: "Singapore", consent: "Yes", page: "test"
  }));
}
