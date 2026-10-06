/**
 * Home Fiber Check: "call me back" lead receiver (Google Apps Script web app).
 * Deploy: Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 * Each POST from homefibercheck.live / brightspeeddealer.online adds a row to the "Home Fiber Check Leads" Sheet
 * and emails the lead to everyone in NOTIFY so an agent can call back fast.
 */
var NOTIFY = 'mwaseemzaheer@gmail.com,usamas002@gmail.com';   // comma-separated; every lead emails all of them
var SHEET_TITLE = 'Home Fiber Check Leads';
var HEADERS = ['Received (ET)', 'Provider', 'Name', 'Phone', 'Address', 'ZIP', 'Best time', 'Page', 'Click ID', 'Device'];

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

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  if (p.website) return json_({ ok: true });                       // honeypot
  var phone = String(p.phone || '').replace(/\D/g, '');
  if (phone.length === 11 && phone.charAt(0) === '1') phone = phone.slice(1);
  if (phone.length !== 10 || !p.name) return json_({ ok: false });
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ts = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd HH:mm:ss');
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

function doGet() { return json_({ ok: true, service: 'Home Fiber Check leads' }); }

/** Run once from the editor to create the Sheet and grant permissions. */
function setup() { sheet_(); }
