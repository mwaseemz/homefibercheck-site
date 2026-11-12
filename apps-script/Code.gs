/**
 * Home Fiber Check: lead, call-tracking and call-result receiver (Google Apps Script web app).
 * Deploy: Deploy > Manage deployments > edit > New version (keeps the same /exec URL).
 *
 * POST kind=(none)  "call me back" form: row in the first tab + email to everyone in NOTIFY.
 * POST kind=visit|tap|leave  ad-visit events from assets/track.js (homefibercheck.live, frontiernet.live,
 *      imbservices.online/verizon/): row in the "Call taps" tab, tied together by a session id, with the ad's keyword,
 *      match type, campaign/ad group/ad id and location when the campaign's final URL suffix passes them.
 * POST kind=result  agent call result from homefibercheck.live/agent/: row in the "Call results" tab.
 * GET  ?key=REPORT_KEY&days=N  JSON of the last N days of "Call taps", "Call results" and leads. Off unless the
 *      owner sets REPORT_KEY (the daily report reads the Sheet through the Sheets connector instead).
 *
 * Script properties (Project Settings > Script properties): SHEET_ID; optional AGENT_PIN (makes the agent page
 * require a PIN) and REPORT_KEY. Any secret lives there, never in this file (this repo is public).
 * Version 5 (2026-11-12): session id, seconds, scroll, button, load time and ad details on activity rows;
 * agent results; report endpoint. Version 6: the session id arrives as 'vid' (Apps Script reserves 'sid' and 'c').
 */
var NOTIFY = 'mwaseemzaheer@gmail.com,usamas002@gmail.com';   // comma-separated; every lead emails all of them
var SHEET_TITLE = 'Home Fiber Check Leads';
var HEADERS = ['Received (ET)', 'Provider', 'Name', 'Phone', 'Address', 'ZIP', 'Best time', 'Page', 'Click ID', 'Device'];
// "Call taps" tab: our own record of ad visits, call taps and exits, because Google misses a landing-page call
// whenever its tracking number hasn't replaced ours yet (or its script is blocked) at the moment of the tap.
var ACTIVITY_TAB = 'Call taps';
var ACTIVITY_HEADERS = ['Time (ET)', 'Event', 'Provider', 'Number dialed', 'Google tracking number shown', 'Page',
                        'Click ID', 'Device', 'Session', 'Seconds on page', 'Seconds visible', 'Scrolled %', 'Button',
                        'Load (ms)', 'Keyword', 'Match', 'Campaign ID', 'Ad group ID', 'Ad ID', 'Location ID'];
var RESULTS_TAB = 'Call results';
var RESULTS_HEADERS = ['Call date', 'Call length (sec)', 'Time zone', 'Caller phone (10 digits)', 'State / ZIP',
                       'Result (YES = sale)', 'Order / confirmation #', 'Agent', 'Notes', 'Sent to Google (leave blank)'];
var RESULTS = ['SALE', 'CALLBACK', 'NOT AVAILABLE', 'PRICE', 'EXISTING CUSTOMER', 'NOT HOME INTERNET', 'HUNG UP', 'OTHER'];

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

function sheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : null;
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_TITLE);
    props.setProperty('SHEET_ID', ss.getId());
  }
  var sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) { sh.appendRow(HEADERS); sh.setFrozenRows(1); }
  return sh;
}

function tab_(name, headers) {
  var ss = sheet_().getParent();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name, ss.getSheets().length); sh.setFrozenRows(1); }   // last tab: leads stay first
  if (sh.getLastColumn() < headers.length || sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);                        // add any new columns
  }
  return sh;
}

function clip_(v, n) { return String(v || '').slice(0, n || 300); }
function now_() { return Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd HH:mm:ss'); }

function logActivity_(p) {
  var event = p.kind === 'tap' ? 'Tapped call'
            : p.kind === 'leave' ? (p.again ? 'Left page again: ' : 'Left page: ') + clip_(p.detail, 120)
            : 'Arrived from ad';
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    tab_(ACTIVITY_TAB, ACTIVITY_HEADERS).appendRow([
      now_(), event, clip_(p.provider, 40), clip_(p.dialed, 20), clip_(p.swapped, 5), clip_(p.page), clip_(p.gclid),
      clip_(p.ua), clip_(p.vid, 20), clip_(p.sec, 8), clip_(p.active, 8), clip_(p.scroll, 4), clip_(p.btn, 80),
      clip_(p.load_ms, 8), clip_(p.kw, 80), clip_(p.mt, 4), clip_(p.cmp, 20), clip_(p.ag, 20), clip_(p.ad, 20),
      clip_(p.loc, 20)]);
  } finally { lock.releaseLock(); }
}

function logResult_(p) {
  var pin = prop_('AGENT_PIN');                                     // optional: set it to require a PIN
  if (pin && String(p.pin || '') !== pin) return json_({ ok: false, error: 'pin' });
  var result = String(p.result || '').toUpperCase();
  if (RESULTS.indexOf(result) === -1) return json_({ ok: false, error: 'result' });
  var ago = Math.max(0, Math.min(600, parseInt(p.ago, 10) || 0));
  var when = Utilities.formatDate(new Date(Date.now() - ago * 60000), 'America/New_York', 'yyyy-MM-dd HH:mm');
  var notes = '[' + clip_(p.provider, 20) + '] ' + clip_(p.notes, 400) + ' (agent page)';
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    tab_(RESULTS_TAB, RESULTS_HEADERS).appendRow([when, '', 'ET', clip_(String(p.phone || '').replace(/\D/g, ''), 10),
      clip_(p.zip, 20), result === 'SALE' ? 'YES' : result, clip_(p.order, 40), clip_(p.agent, 40), notes, '']);
  } finally { lock.releaseLock(); }
  return json_({ ok: true });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  if (p.website) return json_({ ok: true });                       // honeypot
  if (p.kind === 'tap' || p.kind === 'visit' || p.kind === 'leave') { logActivity_(p); return json_({ ok: true }); }
  if (p.kind === 'result') return logResult_(p);
  var phone = String(p.phone || '').replace(/\D/g, '');
  if (phone.length === 11 && phone.charAt(0) === '1') phone = phone.slice(1);
  if (phone.length !== 10 || !p.name) return json_({ ok: false });
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ts = now_();
    var pretty = '(' + phone.slice(0, 3) + ') ' + phone.slice(3, 6) + '-' + phone.slice(6);
    var sh = sheet_();
    sh.appendRow([ts, p.provider || '', p.name || '', pretty, p.address || '', p.zip || '', p.time || '', p.page || '', p.gclid || '', p.ua || '']);
    MailApp.sendEmail({
      to: NOTIFY,
      subject: 'CALL BACK NOW: ' + (p.provider || 'Fiber') + ' lead, ' + p.name + ' ' + pretty,
      body: 'New call-back request (' + ts + ' ET)\n\n' +
            'Provider: ' + (p.provider || '') + '\nName: ' + p.name + '\nPhone: ' + pretty +
            '\nAddress: ' + (p.address || '') + '\nZIP: ' + (p.zip || '') + '\nBest time: ' + (p.time || '') +
            '\nPage: ' + (p.page || '') + '\n\nAll leads: ' + sh.getParent().getUrl()
    });
  } finally { lock.releaseLock(); }
  return json_({ ok: true });
}

// Rows from the last `days` days (first column is an ET date or date-time); header row first.
function recent_(sh, days) {
  var values = sh.getDataRange().getDisplayValues();
  var cutoff = Utilities.formatDate(new Date(Date.now() - days * 864e5), 'America/New_York', 'yyyy-MM-dd');
  return [values[0]].concat(values.slice(1).filter(function (r) {
    var d = String(r[0]);
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10) >= cutoff;
    var t = new Date(d);
    return isNaN(t) ? false : Utilities.formatDate(t, 'America/New_York', 'yyyy-MM-dd') >= cutoff;
  }));
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.key || !prop_('REPORT_KEY') || p.key !== prop_('REPORT_KEY')) return json_({ ok: true, service: 'Home Fiber Check leads' });
  var days = Math.max(1, Math.min(120, parseInt(p.days, 10) || 14));
  var ss = sheet_().getParent();
  var out = { ok: true, generated: now_() };
  var taps = ss.getSheetByName(ACTIVITY_TAB), res = ss.getSheetByName(RESULTS_TAB);
  out.taps = taps ? recent_(taps, days) : [];
  out.results = res ? recent_(res, days) : [];
  out.leads = recent_(sheet_(), days);
  return json_(out);
}

/** Run once from the editor to create the Sheet and grant permissions. */
function setup() { sheet_(); }
