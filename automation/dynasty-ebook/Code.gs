/**
 * Dynasty e-book delivery — Google Apps Script web app.
 *
 * The landing page (/dynasty) POSTs a JSON body here. This script:
 *   1. Logs the lead to the "Leads" tab of the bound Google Sheet.
 *   2. Emails the e-book PDF (from Google Drive) to the person, from the
 *      Google account that deployed the script.
 *
 * Setup steps are in README.md next to this file.
 */

var CONFIG = {
  // Drive file ID of the e-book PDF. Set it in Project Settings → Script
  // properties as EBOOK_FILE_ID (preferred), or paste it here.
  EBOOK_FILE_ID: '',
  ATTACHMENT_NAME: 'Dynasty - Brad DiPaolo.pdf',

  FROM_NAME: 'Brad DiPaolo',
  REPLY_TO: '',            // Leave blank to use the deploying account's address.
  SUBJECT: 'Your copy of Dynasty',

  // Optional: get an email for every new lead. Script property NOTIFY_EMAIL overrides.
  NOTIFY_EMAIL: '',

  SHEET_NAME: 'Leads',
  DEDUPE_MINUTES: 10       // Ignore repeat sends to the same address within this window.
};

var HEADERS = [
  'Timestamp', 'First name', 'Email', 'Marketing consent', 'Status',
  'Quiz score', 'Quiz tier', 'Weakest pillar',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'li_fat_id', 'gclid', 'Referrer', 'Landing URL', 'User agent'
];

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function doGet() {
  return json_({ ok: true, service: 'dynasty-ebook' });
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    data = (e && e.parameter) || {};
  }

  // Honeypot: real people never fill this hidden field.
  if (data.website) return json_({ ok: true });

  var firstName = clean_(data.firstName, 80);
  var email = clean_(data.email, 254).toLowerCase();
  if (!firstName) return json_({ ok: false, error: 'missing_name' });
  if (!EMAIL_RE.test(email)) return json_({ ok: false, error: 'invalid_email' });

  var cache = CacheService.getScriptCache();
  var dedupeKey = 'sent:' + email;
  var status = 'sent';

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (cache.get(dedupeKey)) {
      status = 'duplicate (not resent)';
    } else {
      try {
        sendEbook_(firstName, email);
        cache.put(dedupeKey, '1', CONFIG.DEDUPE_MINUTES * 60);
      } catch (err) {
        status = 'error: ' + String(err).slice(0, 200);
      }
    }

    sheet_().appendRow([
      new Date(), firstName, email, data.consent === 'yes' ? 'yes' : 'no', status,
      clean_(data.quizScore, 4), clean_(data.quizTier, 40), clean_(data.quizWeakest, 40),
      clean_(data.utm_source, 200), clean_(data.utm_medium, 200), clean_(data.utm_campaign, 200),
      clean_(data.utm_content, 200), clean_(data.utm_term, 200),
      clean_(data.fbclid, 200), clean_(data.li_fat_id, 200), clean_(data.gclid, 200),
      clean_(data.referrer, 300), clean_(data.landing_url || data.pageUrl, 500), clean_(data.userAgent, 300)
    ]);
  } finally {
    lock.releaseLock();
  }

  if (status.indexOf('error') === 0) {
    console.error('Delivery failed for ' + email + ': ' + status);
    return json_({ ok: false, error: 'send_failed' });
  }

  notify_(firstName, email, data);
  return json_({ ok: true });
}

function sendEbook_(firstName, email) {
  var props = PropertiesService.getScriptProperties();
  var fileId = props.getProperty('EBOOK_FILE_ID') || CONFIG.EBOOK_FILE_ID;
  if (!fileId) throw new Error('EBOOK_FILE_ID is not set');

  var pdf = DriveApp.getFileById(fileId).getBlob().setName(CONFIG.ATTACHMENT_NAME);
  var name = escapeHtml_(firstName);

  var text = [
    'Hi ' + firstName + ',',
    '',
    'Thanks for grabbing a copy of Dynasty: Building Championship Teams in Sports and Business. It\'s attached to this email as a PDF.',
    '',
    'A suggestion before you dive in: flip to the Dynasty Scorecard at the back first. Rate your team honestly on the five pillars, then read the chapter for your lowest score. That\'s where the biggest wins are hiding.',
    '',
    'When you\'ve scored your team, hit reply and tell me your Dynasty Score. I read every reply.',
    '',
    'Brad DiPaolo',
    'Founder, CandidateHub',
    'https://candidatehub.io'
  ].join('\n');

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#0D1117;max-width:560px;">' +
    '<p>Hi ' + name + ',</p>' +
    '<p>Thanks for grabbing a copy of <strong>Dynasty: Building Championship Teams in Sports and Business</strong>. ' +
    'It\'s attached to this email as a PDF.</p>' +
    '<p>A suggestion before you dive in: flip to the <strong>Dynasty Scorecard</strong> at the back first. ' +
    'Rate your team honestly on the five pillars, then read the chapter for your lowest score. ' +
    'That\'s where the biggest wins are hiding.</p>' +
    '<p>When you\'ve scored your team, hit reply and tell me your Dynasty Score. I read every reply.</p>' +
    '<p style="margin-top:28px;">Brad DiPaolo<br>' +
    '<span style="color:#4A5568;">Founder, <a href="https://candidatehub.io" style="color:#2D7BBF;">CandidateHub</a></span></p>' +
    '</div>';

  var options = { name: CONFIG.FROM_NAME, htmlBody: html, attachments: [pdf] };
  var replyTo = props.getProperty('REPLY_TO') || CONFIG.REPLY_TO;
  if (replyTo) options.replyTo = replyTo;

  GmailApp.sendEmail(email, CONFIG.SUBJECT, text, options);
}

function notify_(firstName, email, data) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || CONFIG.NOTIFY_EMAIL;
  if (!to) return;
  try {
    MailApp.sendEmail(to, 'New Dynasty download: ' + firstName,
      firstName + ' <' + email + '>' +
      '\nMarketing consent: ' + (data.consent === 'yes' ? 'yes' : 'no') +
      (data.utm_source ? '\nSource: ' + clean_(data.utm_source, 200) + ' / ' + clean_(data.utm_campaign, 200) : ''));
  } catch (err) {
    console.warn('Lead notification failed: ' + err);
  }
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

// Strips leading formula characters so a submitted value can't run as a Sheets formula.
function clean_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, max || 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor: creates the Leads tab and grants permissions. */
function setup() {
  sheet_();
  var fileId = PropertiesService.getScriptProperties().getProperty('EBOOK_FILE_ID') || CONFIG.EBOOK_FILE_ID;
  if (!fileId) throw new Error('Set the EBOOK_FILE_ID script property first.');
  console.log('E-book found: ' + DriveApp.getFileById(fileId).getName());
}

/** Run from the editor to email yourself a test copy. */
function testSend() {
  sendEbook_('Brad', Session.getActiveUser().getEmail());
  console.log('Test email sent to ' + Session.getActiveUser().getEmail());
}
