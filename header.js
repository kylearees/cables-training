// Unified Kennecott header — matches the www.kennecotttrainers.com portal header.
// Left: kicker + screen title (pulled from the page's existing badge/h1).
// Right: user name + role, an avatar that opens a profile panel (nickname, recovery
// email, phone, change password), a Home button, and Log Out.
//
// Identity + profile load from the portal via the kt_token Bearer header — cross-origin
// cookie auth is blocked by a global ACAO:* rule on www, so we never rely on the cookie.
// Drop-in: include /header.css + /header.js and (optionally) a <header> with a .badge
// and <h1>. Works on haulage, shovels, and attendance (site name auto-detected).

(function () {
  var AUTH_BASE = 'https://www.kennecotttrainers.com';
  var HOME = 'https://www.kennecotttrainers.com/';
  var SESSION_KEYS = ['ht_team','ht_team_exp','ht_session','ht_session_exp','kt_token','kt_perms',
    'kt_payroll','sh_ok','sh_ok_exp','cb_ok','cb_ok_exp','att_session','att_session_exp','att_user_name','att_user_payroll','att_user_worker_id'];

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function token() { return ls('kt_token'); }
  function hasSession() { return !!(token() || ls('att_session') === 'true' || ls('sh_ok') === '1' || ls('cb_ok') === '1' || ls('ht_team')); }

  function logout() {
    try { SESSION_KEYS.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
    window.location.href = AUTH_BASE + '/logout';
  }
  window.htLogout = logout;

  function siteName() {
    var h = location.hostname;
    if (h.indexOf('haulage') > -1) return 'Haulage Training';
    if (h.indexOf('shovels') > -1) return 'Shovels Training';
    if (h.indexOf('cables') > -1) return 'Cables Training';
    if (h.indexOf('attendance') > -1) return 'Attendance';
    return 'Kennecott Trainers';
  }
  // A "back to this site's home" button (distinct from the portal Home button).
  // Hidden when the user is already on that site's home page.
  function siteHome() {
    var h = location.hostname, p = location.pathname;
    if (h.indexOf('shovels') > -1) {
      if (/^\/(index(\.html)?)?$/.test(p)) return null;
      return { label: 'Shovels Home', href: 'https://shovels.kennecotttrainers.com/' };
    }
    if (h.indexOf('cables') > -1) {
      if (/^\/(index(\.html)?)?$/.test(p)) return null;
      return { label: 'Cables Home', href: 'https://cables.kennecotttrainers.com/' };
    }
    if (h.indexOf('haulage') > -1) {
      if (/^\/signin(\.html)?$/.test(p)) return null;
      return { label: 'Haulage Home', href: 'https://haulage.kennecotttrainers.com/signin' };
    }
    return null;
  }
  function roleLabel(p) {
    if (!p) return '';
    if (p.superadmin || p.admin) return 'Administrator';
    var h = p.haulage || {};
    if (h.access && Array.isArray(h.caps) && h.caps.indexOf('team_management') > -1) return 'Team Trainer';
    if (h.access && Array.isArray(h.caps) && h.caps.indexOf('mentoring') > -1 && (!Array.isArray(h.teams) || h.teams.length === 0)) return 'Mentor';
    if (h.access || (p.shovels && p.shovels.access) || (p.cables && p.cables.access)) return 'Trainer';
    return '';
  }
  function initials(name) {
    var i = String(name || '').trim().split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    return i || '··';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var profile = {};

  function panelHTML() {
    return '<div class="pp-head"><span class="pp-title">My Profile</span><button type="button" class="pp-close" id="htPpClose" aria-label="Close">✕</button></div>' +
      '<div class="pp-display-name" id="htPpName"></div>' +
      '<div class="pp-section"><span class="pp-section-title">Profile</span>' +
        '<label class="pp-label">Goes by (nickname)</label><input class="pp-input" id="htPpNick" type="text" placeholder="e.g. Kyle" autocomplete="nickname">' +
        '<label class="pp-label">Recovery email</label><input class="pp-input" id="htPpEmail" type="email" placeholder="personal@email.com" autocomplete="email">' +
        '<label class="pp-label">Phone (optional)</label><input class="pp-input" id="htPpPhone" type="tel" placeholder="e.g. 801-555-1234" autocomplete="tel">' +
        '<button type="button" class="pp-btn" id="htPpSave">Save</button><div class="pp-status" id="htPpStatus"></div></div>' +
      '<div class="pp-section"><span class="pp-section-title">Change Password</span>' +
        '<div id="htPpCurRow"><label class="pp-label">Current password</label><input class="pp-input" id="htPpCur" type="password" autocomplete="current-password" style="margin-bottom:6px"></div>' +
        '<label class="pp-label">New password</label><input class="pp-input" id="htPpNew" type="password" placeholder="6+ characters" autocomplete="new-password">' +
        '<label class="pp-label">Confirm new password</label><input class="pp-input" id="htPpConf" type="password" autocomplete="new-password">' +
        '<button type="button" class="pp-btn" id="htPpChange">Change Password</button><div class="pp-status" id="htPpPwStatus"></div></div>';
  }

  function build() {
    var hdr = document.querySelector('header');
    if (!hdr) { hdr = document.createElement('header'); document.body.insertBefore(hdr, document.body.firstChild); }

    var kEl = hdr.querySelector('.badge, .kicker, .logo');
    var tEl = hdr.querySelector('h1, .header-title, .screen-title, .app-title');
    var kicker = kEl ? kEl.textContent.trim() : '';
    var title  = tEl ? tEl.textContent.trim() : '';
    if (!kicker) kicker = 'Kennecott Mine · ' + siteName();
    if (!title)  title  = siteName();

    // Preserve page-specific header controls (e.g. font-size toggles); drop only the
    // brand/home/logout, which we re-create in the standard layout.
    var extras = [];
    Array.prototype.slice.call(hdr.querySelectorAll('.fs-toggle, .hdr-group')).forEach(function (g) { extras.push(g); });

    var sh = siteHome();
    var siteBtn = sh ? '<a class="hdr-btn" href="' + sh.href + '">' + esc(sh.label) + '</a>' : '';

    hdr.className = 'app-header';
    hdr.innerHTML =
      '<div class="brand-row"><div><div class="kicker">' + esc(kicker) + '</div><div class="screen-title">' + esc(title) + '</div></div></div>' +
      '<div class="user-row">' +
        '<div class="user-info" id="htUserInfo" style="display:none"><div class="user-name" id="htUserName"></div><div class="user-role-lbl" id="htUserRole"></div></div>' +
        '<div class="avatar-wrap" id="htAvatarWrap" style="display:none"><div class="avatar" id="htAvatar" title="My profile">··</div><div class="profile-panel" id="htPanel" style="display:none"></div></div>' +
        '<span id="htExtras"></span>' +
        siteBtn +
        '<a class="hdr-btn" href="' + HOME + '">Home</a>' +
        '<button type="button" class="hdr-btn" id="htLogout" style="display:none">Log Out</button>' +
      '</div>';

    if (extras.length) { var ex = hdr.querySelector('#htExtras'); extras.forEach(function (g) { ex.appendChild(g); }); }
    hdr.querySelector('#htLogout').addEventListener('click', logout);

    if (hasSession()) hdr.querySelector('#htLogout').style.display = '';
    loadUser(hdr);
  }

  function loadUser(hdr) {
    var t = token();
    if (!t) return;
    fetch(AUTH_BASE + '/auth/me', { headers: { Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) {
        if (!me) return;
        profile = { name: me.name || '', email: me.email || null, preferred_name: me.preferred_name || null, phone: me.phone || null, has_password: !!me.has_password };
        hdr.querySelector('#htUserName').textContent = me.name || '';
        hdr.querySelector('#htUserRole').textContent = roleLabel(me.permissions || {});
        hdr.querySelector('#htUserInfo').style.display = '';
        hdr.querySelector('#htAvatar').textContent = initials(me.name);
        hdr.querySelector('#htAvatarWrap').style.display = '';
        hdr.querySelector('#htLogout').style.display = '';
        wireProfile(hdr);
      })
      .catch(function () {});
  }

  function wireProfile(hdr) {
    var panel = hdr.querySelector('#htPanel');
    var av = hdr.querySelector('#htAvatar');
    function close() { panel.style.display = 'none'; }
    function open() {
      panel.innerHTML = panelHTML();
      hdr.querySelector('#htPpName').textContent = profile.name || '';
      hdr.querySelector('#htPpNick').value = profile.preferred_name || '';
      hdr.querySelector('#htPpEmail').value = profile.email || '';
      hdr.querySelector('#htPpPhone').value = profile.phone || '';
      hdr.querySelector('#htPpCurRow').style.display = profile.has_password ? '' : 'none';
      panel.style.display = 'block';
      hdr.querySelector('#htPpClose').addEventListener('click', close);
      hdr.querySelector('#htPpSave').addEventListener('click', saveProfile);
      hdr.querySelector('#htPpChange').addEventListener('click', changePassword);
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
    }
    av.addEventListener('click', function (e) { e.stopPropagation(); if (panel.style.display === 'block') close(); else open(); });
    document.addEventListener('click', function (e) { if (!hdr.querySelector('#htAvatarWrap').contains(e.target)) close(); });

    function api(body) {
      return fetch(AUTH_BASE + '/auth/update-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify(body)
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }, function () { return { ok: r.ok, d: {} }; }); });
    }
    function saveProfile() {
      var btn = hdr.querySelector('#htPpSave'), st = hdr.querySelector('#htPpStatus');
      var nick = hdr.querySelector('#htPpNick').value.trim(), email = hdr.querySelector('#htPpEmail').value.trim(), phone = hdr.querySelector('#htPpPhone').value.trim();
      btn.disabled = true; st.className = 'pp-status'; st.textContent = 'Saving…';
      api({ preferred_name: nick, email: email, phone: phone }).then(function (res) {
        if (!res.ok) { st.className = 'pp-status err'; st.textContent = (res.d && res.d.error) || 'Error'; }
        else { profile.preferred_name = nick || null; profile.email = email || null; profile.phone = phone || null; st.className = 'pp-status ok'; st.textContent = '✓ Saved'; }
        btn.disabled = false;
      }).catch(function () { st.className = 'pp-status err'; st.textContent = 'Network error'; btn.disabled = false; });
    }
    function changePassword() {
      var btn = hdr.querySelector('#htPpChange'), st = hdr.querySelector('#htPpPwStatus');
      var nw = hdr.querySelector('#htPpNew').value, cf = hdr.querySelector('#htPpConf').value;
      if (nw !== cf) { st.className = 'pp-status err'; st.textContent = 'Passwords do not match.'; return; }
      if (nw.length < 6) { st.className = 'pp-status err'; st.textContent = 'At least 6 characters.'; return; }
      btn.disabled = true; st.className = 'pp-status'; st.textContent = 'Saving…';
      api({ current_password: hdr.querySelector('#htPpCur').value, new_password: nw }).then(function (res) {
        if (!res.ok) { st.className = 'pp-status err'; st.textContent = (res.d && res.d.error) || 'Error'; }
        else { profile.has_password = true; hdr.querySelector('#htPpCurRow').style.display = ''; hdr.querySelector('#htPpCur').value = ''; hdr.querySelector('#htPpNew').value = ''; hdr.querySelector('#htPpConf').value = ''; st.className = 'pp-status ok'; st.textContent = '✓ Password changed'; }
        btn.disabled = false;
      }).catch(function () { st.className = 'pp-status err'; st.textContent = 'Network error'; btn.disabled = false; });
    }
  }

  function run() { try { build(); } catch (e) { /* never let the header break the page */ } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
