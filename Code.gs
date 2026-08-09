/**
 * GCC Membership Form — backend
 * Verifies the Google ID token server-side, enforces the university domain,
 * and appends one row per response in Google Forms' column layout.
 *
 * Deploy: Extensions > Apps Script, paste this, then Deploy > New deployment
 *         > Web app > Execute as: Me > Who has access: Anyone.
 */

// ============ CONFIG ============
// Values live in Project Settings > Script properties, so nothing is hardcoded here.
// Set CLIENT_ID there (same value as GCC_CLIENT_ID in Cloudflare). The rest are optional
// and fall back to the defaults below.
//
// Run setupProperties() once from the editor to create them, then edit the values in
// Project Settings.

function prop(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === '') ? fallback : v;
}

function setupProperties() {
  PropertiesService.getScriptProperties().setProperties({
    CLIENT_ID:      '313217709661-blqnmn1f6bo4e2ta6t39k9glanjhersj.apps.googleusercontent.com',
    ALLOWED_DOMAIN: 'gsfcuniversity.ac.in',
    SHEET_NAME:     'Form Responses 1',
    ALLOW_EDITS:    'false',
    CLOSES_ON:      '2026-08-15T23:59:59+05:30'
  }, false);
  Logger.log('Script properties created. Edit them in Project Settings > Script properties.');
}

var CLIENT_ID      = prop('CLIENT_ID', '');
var ALLOWED_DOMAIN = prop('ALLOWED_DOMAIN', 'gsfcuniversity.ac.in');
var SHEET_NAME     = prop('SHEET_NAME', 'Form Responses 1');
var ALLOW_EDITS    = prop('ALLOW_EDITS', 'false') === 'true';   // one submission per person unless true
var CLOSES_ON      = prop('CLOSES_ON', '');                     // empty = never closes
// ================================

// Column order mirrors a Google Forms response sheet.
var HEADERS = [
  'Timestamp',
  'Email Address',
  'Full Name',
  'Mobile Number',
  'Email',
  'Enrollment number',
  'School',
  'Stream',
  'Course',
  'Semester',
  'Which Comittee of Global Connect Club do you want to join ?',
  'Why do you want to join the Global Connect Club?',
  "Global perspectives start with a single step! Tell us about your experience in cultural exchange, cross-cultural networking, language learning, event management, or international relations. If you're a beginner, don't worry—share your enthusiasm for learning!",
  'Are you able to dedicate approximately 3–5 hours per week to club meetings, global networking events, session planning, and other activities?'
];

function doGet() {
  return json({ ok: true, service: 'GCC membership form', status: 'running' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    if (CLOSES_ON && new Date() > new Date(CLOSES_ON)) {
      return json({ ok: false, error: 'applications are closed' });
    }

    var body = JSON.parse(e.postData.contents);
    var claims = verifyToken(body.idToken);       // throws if invalid
    var email = String(claims.email).toLowerCase();
    var a = body.answers || {};

    var sheet = getSheet();
    var existing = findRowByEmail(sheet, email);
    if (existing && !ALLOW_EDITS) {
      return json({ ok: false, error: 'this account has already applied' });
    }

    var row = [
      new Date(),
      email,
      clean(a['Full Name']),
      clean(a['Mobile Number']),
      clean(a['Email']) || email,
      clean(a['Enrollment number']),
      clean(a['School']),
      clean(a['Stream']),
      clean(a['Course']),
      clean(a['Semester']),
      clean(a['Which Comittee of Global Connect Club do you want to join ?']),
      clean(a['Why do you want to join the Global Connect Club?']),
      clean(a[HEADERS[12]]),
      clean(a[HEADERS[13]])
    ];

    // Every answer is required now — Stream stopped being optional when Course
    // was added, since Course is chosen from the stream.
    for (var i = 2; i < HEADERS.length; i++) {
      if (!row[i]) return json({ ok: false, error: 'missing answer: ' + HEADERS[i] });
    }

    if (existing) {
      sheet.getRange(existing, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    return json({ ok: true });

  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/** Server-side check — the browser's check is only for a nicer error message. */
function verifyToken(token) {
  if (!token) throw new Error('not signed in');
  if (!CLIENT_ID) throw new Error('form is not configured — run setupProperties() and set CLIENT_ID');
  var res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) throw new Error('sign-in could not be verified');

  var c = JSON.parse(res.getContentText());
  if (c.aud !== CLIENT_ID) throw new Error('sign-in was issued for a different app');
  if (String(c.email_verified) !== 'true') throw new Error('email not verified');

  var email = String(c.email || '').toLowerCase();
  var domain = c.hd || email.split('@')[1];
  if (domain !== ALLOWED_DOMAIN) throw new Error('only @' + ALLOWED_DOMAIN + ' accounts can apply');

  return c;
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
         .setFontWeight('bold')
         .setBackground('#2B5CAB')
         .setFontColor('#FFFFFF')
         .setWrap(true);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 240);
  }
  return sheet;
}

function findRowByEmail(sheet, email) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var col = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]).toLowerCase() === email) return i + 2;
  }
  return 0;
}

function clean(v) {
  return String(v == null ? '' : v).trim().slice(0, 5000);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
