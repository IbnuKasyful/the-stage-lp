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
 *        Lead   → 7 Days to Speak Up PDF (attachment) + WhatsApp Community link
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

  // 7 Days to Speak Up PDF (internally still called "playbook").
  // RECOMMENDED: set it WITHOUT redeploying via Project Settings (⚙️) → Script Properties →
  //   Property: PLAYBOOK_PDF   Value: the Google Drive link (or file ID) of the PDF.
  // The Script Property wins over the value below. A full Drive link or a bare ID both work.
  // While empty, leads still get an email saying the PDF is on its way, and are
  // marked "PDF pending". Run sendPendingPlaybooks() once the file is added.
  PLAYBOOK_PDF_FILE_ID: "",
  PLAYBOOK_FILE_NAME: "7-Days-to-Speak-Up.pdf",

  LP_URL: "https://stage.the-family-village.pages.dev",
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
    headers: ["submitted_at", "lead_status", "email_status", "parent_name", "email", "whatsapp_full",
      "country_code", "whatsapp", "child_age_group", "location", "consent",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "page"]
  }
};
// Bump on every change; shown by the web app (GET) so you can confirm which version is live.
const CODE_VERSION = "2026-11-01.2-7-days-to-speak-up";
const SKIP_KEYS = ["form_type", "company"];
const STATUS_PDF_PENDING = "Sent – PDF pending";

// The Family Village logo (144px PNG), embedded in every email as an inline image
// so it never depends on the website URL or on the email client loading remote images.
const LOGO_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAJAAAACQCAMAAADQmBKKAAAACXBIWXMAAAAAAAAAAQCEeRdzAAADAFBMVEUyMgU3Nw06ORA9PBRBQBhEQxxISCJOTihVVTBbWzdgYT1nZ0ZwcU93d1d8fV2ChV6Hh26Mk2GOj2+Qj3mWnmqYmIGao22bpG6bpG6en4efpnefqXKfqXOko4+nppSpr4asrJqvr5+1taW/vrDHx7vOzsPX1s7f3tfm5uHv7uv39/X8/Pv+/v7///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8A/wAuoM8kAAABAHRSTlP///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AU/cHJQAACtZJREFUeJztm3tX2swWxp9JMrkSkErxPbTVKuD3/zhnCWLBW0WUQsh1ksxZEwJie1qLEsp6V/cfJgy3n3PZ8+y9B8KxW6Zgx0zBjpmCHTMFO2YKdswU7Jgp2DFTsGOmYMdMwY6Zgh0zBf92oMbE3SWgwzvOy9PdAbIC3QwC7ApQa0BsG4nfPN8NoOYXzdIiQuUJdgLotK/bCiNclcLdALqkNhgBQPiWgVrd/9daY2Ul49k6UMVRZfr+h3k7NayIgBOAS9sFSnQ1jvp6afSs9TClHOCEE5bS7QIBewmLoonWuFhpG1MrorPAVJEkle0CER4zYlqB16+srO9EBhCBcupjsF0giceEM2ganZVmy9ZU5tSLDcriSMN2gSwv0RgBg42Z7aw+E0k6U6fR520DDZnoA4KohGnjJm+VOHEjjcL1zfMtA3X0WFw4wOx4udTkRGZEJ4EnPeu0bQBBC5hwOErMuRHWciTNcSPVmrrkbXv9q4DqF6EdUc/RTKZrCzVWnXqEPnj6kzprsgA6Pd8CUKcU6ojlGCa4EpyezRuNWJrx/WH+mprHuATyjavULd4x/nPhlwPNcKflmJLF1i6nqTXO76szQi1JlpDCS1A8UNf2VS0sxYFicmnRAZwf5ptu6yrRdR08BrQ41rcABEebSRoz4kAlhOVtQTXnOb5UTTOOhGPgCJL6NoBw+MWxNDDP3Vu01Ei+3I4HRklhmAuRONA7WwHqtPtTo7SXBG72xQBmxvzavjSqbK6LwNUp+7glxdhByYl0K/VzrdEOP8yfuKQlBjWADHAa+GZ3S0DA7Phuqsg8NbNHw9zhVBNbAZsE2l4EQjzibFFTX6A1jFJ42QM/X0yuXg6CIFUpA1G+Ba/YZ9cBaoE8m6JdoHmdKZAm+5S11Ig1DRg1zZhTTNzaeYFAdsg5CJXp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";

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
  return json_({ ok: true, service: "The Stage LP form endpoint", version: CODE_VERSION });
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
  // The PDF must never block the email: if it can't be loaded or attached,
  // the lead still gets the "on its way" email and the reason is logged in the sheet.
  let pdf = null, pdfError = "";
  try { pdf = getPlaybookPdf_(); } catch (err) { pdfError = errMsg_(err); }

  if (pdf) {
    try {
      MailApp.sendEmail(mailOpts_(buildPlaybookEmail_(p, pdf)));
      return "Sent – with PDF";
    } catch (err) {
      pdfError = "attach failed: " + errMsg_(err);   // e.g. attachment too large
    }
  }
  MailApp.sendEmail(mailOpts_(buildPlaybookEmail_(p, null)));
  return pdfError ? `${STATUS_PDF_PENDING} (PDF error: ${pdfError})`.slice(0, 250) : STATUS_PDF_PENDING;
}

function buildPlaybookEmail_(p, pdf) {
  const first = firstName_(p.parent_name);
  const pdfText = pdf
    ? `<p style="margin:0 0 16px">Your free copy of <b>7 Days to Speak Up</b> is attached to this email 📎. Inside you'll find seven short activities you and your child can do at home in about 5 minutes a day.</p>`
    : `<p style="margin:0 0 16px">Thank you for requesting <b>7 Days to Speak Up</b>! We're putting the finishing touches on it, and <b>we'll send the PDF to this email as soon as it's ready</b>.</p>`;
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
    subject: pdf ? "📘 Your free copy of 7 Days to Speak Up is here" : "📘 Your copy of 7 Days to Speak Up is on its way",
    htmlBody: layout_(pdf ? "Your activity book is here!" : "Your activity book is on its way!", body),
    body: plain_([
      `Hi ${first},`, "",
      pdf ? "Your free copy of 7 Days to Speak Up is attached." : "We'll email your copy of 7 Days to Speak Up as soon as it's ready.", "",
      `Join our WhatsApp Community: ${CONFIG.WA_COMMUNITY_URL}`,
      `Book a RM55 trial class: ${CONFIG.LP_URL}/#book`, "",
      "Melissa & The Family Village team"
    ])
  };
  if (pdf) opts.attachments = [pdf];
  return opts;
}

function playbookFileId_() {
  const raw = (PropertiesService.getScriptProperties().getProperty("PLAYBOOK_PDF") || CONFIG.PLAYBOOK_PDF_FILE_ID || "").trim();
  if (!raw) return "";
  // accept a full Drive link (…/d/<ID>/… or ?id=<ID>) or a bare file ID
  const m = raw.match(/\/d\/([\w-]{20,})/) || raw.match(/[?&]id=([\w-]{20,})/);
  return m ? m[1] : raw;
}

function getPlaybookPdf_() {
  const id = playbookFileId_();
  if (!id) return null;
  return DriveApp.getFileById(id).getBlob().setName(CONFIG.PLAYBOOK_FILE_NAME);
}

/**
 * DIAGNOSIS – run from the editor and read the Execution log.
 * Checks the PLAYBOOK_PDF property, Drive access, file size and email quota,
 * then sends a real test playbook email to your own address.
 */
function checkPlaybookSetup() {
  const me = Session.getActiveUser().getEmail();
  console.log("Script owner / sender: " + me);
  console.log("Remaining email quota today: " + MailApp.getRemainingDailyQuota());
  const prop = PropertiesService.getScriptProperties().getProperty("PLAYBOOK_PDF");
  console.log("Script Property PLAYBOOK_PDF: " + (prop ? prop : "(not set)"));
  const id = playbookFileId_();
  if (!id) { console.log("➜ No PDF configured: leads get the 'on its way' email."); }
  else {
    console.log("Parsed file ID: " + id);
    try {
      const f = DriveApp.getFileById(id);
      const mb = (f.getSize() / 1048576).toFixed(1);
      console.log(`File OK: "${f.getName()}" · ${f.getMimeType()} · ${mb} MB · owner ${f.getOwner() ? f.getOwner().getEmail() : "?"}`);
      if (f.getMimeType() !== "application/pdf") console.log("⚠ File is not a PDF.");
      if (f.getSize() > 24 * 1048576) console.log("⚠ Over ~24 MB: Gmail will refuse the attachment. Compress the PDF.");
    } catch (err) {
      console.log("✖ Cannot open the file with this account: " + errMsg_(err));
      console.log("➜ Fix: upload the PDF with " + me + ", or share the file with " + me + " (Viewer is enough).");
    }
  }
  const status = sendPlaybookEmail_({ parent_name: "Test", email: me });
  console.log("Test email result: " + status);
}

function errMsg_(err) { return String((err && err.message) || err).replace(/\s+/g, " ").slice(0, 160); }

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
    const st = String(data[r][col("email_status")]);
    // rows still waiting for the PDF, or whose email failed earlier
    if (!(st.indexOf(STATUS_PDF_PENDING) === 0 || st.indexOf("Error") === 0 || st === "Sending…")) continue;
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
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F6EFE3">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6EFE3;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:22px;overflow:hidden">
        <tr><td style="background:#ED9849;padding:26px 28px;text-align:center">
          <img src="cid:tfvlogo" width="72" height="72" alt="The Family Village" style="display:inline-block;background:#FFFAEF;border-radius:50%;padding:6px">
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
  if (o.htmlBody && o.htmlBody.indexOf("cid:tfvlogo") !== -1) {
    o.inlineImages = { tfvlogo: Utilities.newBlob(Utilities.base64Decode(LOGO_PNG_B64), "image/png", "the-family-village-logo.png") };
  }
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
    country_code: "+65", whatsapp: "9123 4567", whatsapp_full: "+65 9123 4567",
    child_age_group: "5–8 years", location: "Singapore", consent: "Yes", page: "test"
  }));
}
