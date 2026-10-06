/* Home Fiber Check: call tracking helpers + "call me back" lead form.
   Page sets window.HFC = { provider: 'Kinetic', formSendTo: 'AW-.../label' } before this script.
   LEAD_ENDPOINT comes from assets/lead-config.js (Google Apps Script web app that logs to a Sheet + emails). */
(function () {
  var HFC = window.HFC || {};
  var DAY = 864e5;

  // Keep the Google click id for 90 days so a lead can be matched to the ad click later.
  function saveGclid() {
    try {
      var m = location.search.match(/[?&](gclid|gbraid|wbraid)=([^&]+)/);
      if (m) localStorage.setItem('hfc_click', JSON.stringify({ k: m[1], v: decodeURIComponent(m[2]), t: Date.now() }));
    } catch (e) {}
  }
  function getGclid() {
    try {
      var c = JSON.parse(localStorage.getItem('hfc_click') || 'null');
      if (c && Date.now() - c.t < 90 * DAY) return c.k + ':' + c.v;
    } catch (e) {}
    var ck = document.cookie.match(/_gcl_aw=([^;]+)/);
    return ck ? '_gcl_aw:' + ck[1] : '';
  }
  saveGclid();

  function digits(s) { return (s || '').replace(/\D/g, ''); }

  function wire(form) {
    var msg = form.querySelector('.form-msg');
    var btn = form.querySelector('button[type=submit]');
    // Clear a field's error outline as soon as the visitor edits it.
    form.addEventListener('input', function (e) { if (e.target.removeAttribute) e.target.removeAttribute('aria-invalid'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      if (f.website && f.website.value) return;              // honeypot
      var phone = digits(f.phone.value);
      if (phone.length === 11 && phone[0] === '1') phone = phone.slice(1);
      // Name each bad field (autofill often drops in a non-US number), outline it and scroll to it,
      // because on phones the message under the button can sit below the screen.
      var bad = [];
      function check(el, ok, why) {
        if (ok) { el.removeAttribute('aria-invalid'); return; }
        el.setAttribute('aria-invalid', 'true'); bad.push({ el: el, why: why });
      }
      check(f.name, !!f.name.value.trim(), 'your name');
      check(f.phone, phone.length === 10, /^\s*\+(?!1)/.test(f.phone.value)
        ? 'a US phone number (10 digits, e.g. 555-123-4567); we can only call US numbers'
        : 'a 10-digit phone number');
      check(f.address, !!f.address.value.trim(), 'your street address');
      check(f.zip, digits(f.zip.value).length === 5, 'a 5-digit ZIP code');
      if (bad.length) {
        var whys = bad.map(function (b) { return b.why; });
        msg.className = 'form-msg err';
        msg.textContent = 'Please enter ' + (whys.length > 1 ? whys.slice(0, -1).join(', ') + ' and ' + whys[whys.length - 1] : whys[0]) + '.';
        bad[0].el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        bad[0].el.focus({ preventScroll: true });
        return;
      }
      var endpoint = window.LEAD_ENDPOINT || '';
      if (!endpoint) {
        msg.className = 'form-msg err';
        msg.textContent = 'Online requests are temporarily unavailable. Please call ' + (HFC.display || '(888) 725-3056') + '.';
        return;
      }
      var body = new URLSearchParams({
        provider: HFC.provider || 'Unknown',
        name: f.name.value.trim(),
        phone: phone,
        address: f.address.value.trim(),
        zip: digits(f.zip.value).slice(0, 5),
        time: f.time ? f.time.value : '',
        page: location.href.split('#')[0],
        gclid: getGclid(),
        ua: navigator.userAgent.slice(0, 180)
      });
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch(endpoint, { method: 'POST', mode: 'no-cors', body: body }).then(function () {
        form.classList.add('sent');
        msg.className = 'form-msg ok';
        msg.textContent = 'Thanks! An agent will call you shortly (Mon–Fri, 10:30am–7:30pm ET). Need help now? Call ' + (HFC.display || '(888) 725-3056') + '.';
        if (window.gtag) {
          if (HFC.formSendTo) gtag('event', 'conversion', { send_to: HFC.formSendTo });
          gtag('event', 'generate_lead', { provider: HFC.provider });
        }
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Call me back';
        msg.className = 'form-msg err';
        msg.textContent = 'Something went wrong. Please call ' + (HFC.display || '(888) 725-3056') + '.';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    [].forEach.call(document.querySelectorAll('form.lead'), wire);
    // Hours badge: "Agents available now" during Mon-Fri 10:30am-7:30pm Eastern.
    var el = document.getElementById('open-status');
    if (el && window.Intl) {
      try {
        var o = {};
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false })
          .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
        var mins = (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10);
        var open = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(o.weekday) !== -1 && mins >= 630 && mins < 1170;
        el.className = 'status' + (open ? ' on' : '');
        el.textContent = open ? 'Agents available now' : 'Agents available Mon–Fri, 10:30am–7:30pm ET';
      } catch (e) {}
    }
  });
})();
