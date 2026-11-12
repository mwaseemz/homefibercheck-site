/* Ad-visit tracker shared by homefibercheck.live, frontiernet.live and imbservices.online/verizon/.
   Logs every ad visitor's arrival, call taps and exits to the "Call taps" tab of the Home Fiber Check Leads Sheet
   (Apps Script web app, version 5 or later). The page sets window.TRACK = { provider: 'Frontier' } (or window.HFC)
   before loading this file.

   One row per event, all tied together by a per-visit id (sent as 'vid': Apps Script rejects requests with 'sid' or 'c'):
     visit  - arrived from an ad (gclid/gbraid/wbraid in the URL)
     tap    - tapped one of our call links: number dialed, whether Google's forwarding number had swapped in,
              which button, seconds after landing
     leave  - page hidden (dialer opened, app switched, tab closed): seconds on page, seconds actually visible,
              deepest scroll, taps, page load time. Fires again with running totals if the visitor comes back.
   Ad details come from the campaign's final URL suffix when it is set:
     kw={keyword}&mt={matchtype}&cmp={campaignid}&ag={adgroupid}&ad={creative}&loc={loc_physical_ms}
   Click ids are joined to keywords later through the Google Ads API (click_view) for Android clicks; iPhone clicks
   (gbraid) carry no keyword, which is why the URL suffix matters. */
(function () {
  var cfg = window.TRACK || window.HFC || {};
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbzitChhtPrnp4EhSJkoOEisLz3gxV9ittmvaFe0qMCtMxXygvwjadlZU2kOcQav22kq/exec';
  var OURS = '8887253056';
  var AD_PARAMS = ['kw', 'mt', 'cmp', 'ag', 'ad', 'loc'];
  if (!window.fetch || !window.URLSearchParams) return;

  function get(k) { try { return sessionStorage.getItem('trk_' + k); } catch (e) { return null; } }
  function set(k, v) { try { sessionStorage.setItem('trk_' + k, v); } catch (e) {} }

  var q = new URLSearchParams(location.search);
  var clickKey = q.get('gclid') ? 'gclid' : q.get('gbraid') ? 'gbraid' : q.get('wbraid') ? 'wbraid' : '';
  if (clickKey) set('click', clickKey + ':' + q.get(clickKey));
  if (!clickKey && !get('sid')) return;                      // only ad visitors, and the rest of their visit
  var firstPage = !get('sid');
  if (firstPage) set('sid', Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6));
  AD_PARAMS.forEach(function (p) { if (q.get(p)) set(p, q.get(p).slice(0, 80)); });

  var t0 = Date.now();
  function secs() { return Math.round((Date.now() - t0) / 1000); }
  function digits(s) { return (s || '').replace(/\D/g, ''); }

  function log(kind, extra) {
    try {
      var body = new URLSearchParams({
        kind: kind, provider: cfg.provider || 'Unknown', page: location.origin + location.pathname,
        gclid: get('click') || '', vid: get('sid') || '', sec: String(secs()), ua: navigator.userAgent.slice(0, 180)
      });
      AD_PARAMS.forEach(function (p) { var v = get(p); if (v) body.append(p, v); });
      for (var k in (extra || {})) body.append(k, extra[k]);
      fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  if (firstPage) log('visit');

  // Which button: its data-track name, else its words, plus the nearest section with an id.
  function label(a) {
    var name = a.getAttribute('data-track') || (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    var sec = a.closest('[id]');
    return name + (sec ? ' @' + sec.id : '');
  }

  var taps = 0;
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="tel:"]:not([data-no-track])') : null;
    if (!a) return;
    taps++;
    var dialed = digits(a.getAttribute('href')).slice(-10);
    log('tap', { dialed: dialed, swapped: dialed === OURS ? 'no' : 'yes', btn: label(a) });
  }, true);

  // Exit: running totals each time the page is hidden.
  var deepest = 0, visibleMs = 0, shownAt = document.visibilityState === 'visible' ? Date.now() : 0, exits = 0;
  function depth() {
    var h = document.documentElement, room = h.scrollHeight - innerHeight;
    return room > 0 ? Math.min(100, Math.round(100 * scrollY / room)) : 100;
  }
  addEventListener('scroll', function () { var d = depth(); if (d > deepest) deepest = d; }, { passive: true });
  function loadMs() {
    try {
      var n = performance.getEntriesByType('navigation')[0];
      return n && n.loadEventStart ? String(Math.round(n.loadEventStart)) : '';
    } catch (e) { return ''; }
  }
  function hidden() {
    if (shownAt) { visibleMs += Date.now() - shownAt; shownAt = 0; }
    exits++;
    var vis = Math.round(visibleMs / 1000);
    log('leave', {
      again: exits > 1 ? 'yes' : '', active: String(vis), scroll: String(deepest), taps: String(taps), load_ms: loadMs(),
      detail: secs() + 's (' + vis + 's visible), scrolled ' + deepest + '%, ' + (taps ? 'tapped call' : 'no tap')
    });
  }
  // Only log when the page goes from visible to hidden (navigating away fires pagehide and visibilitychange both).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { if (shownAt) hidden(); }
    else shownAt = Date.now();
  });
  addEventListener('pagehide', function () { if (shownAt) hidden(); });
})();
