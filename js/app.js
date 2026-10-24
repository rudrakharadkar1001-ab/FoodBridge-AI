/* FoodBridge AI - website logic */
(function () {
  'use strict';

  var E = window.FBEngine;
  var app = document.getElementById('app');
  var userbox = document.getElementById('userbox');
  var modalRoot = document.getElementById('modal-root');
  var toastBox = document.getElementById('toast');
  var dbstate = document.getElementById('dbstate');

  var MODE = 'cloud';
  var S = {
    view: 'home', role: null, authTab: 'login', user: null, tab: null,
    foods: [], requests: [], filter: 'all', search: '', pred: null, err: ''
  };

  var STATE_LABEL = { available: 'Available', booked: 'Booked', picked: 'Picked up', expired: 'Expired' };
  var REQ_LABEL = { pending: 'Waiting for donor', accepted: 'Accepted', declined: 'Declined', rejected: 'Food booked by another NGO' };

  /* ---------- small helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(iso) {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function left(iso) {
    var ms = Date.parse(iso) - Date.now();
    if (ms <= 0) return 'Expired';
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return (h ? h + 'h ' : '') + m + 'm left';
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toast(msg, bad) {
    var d = document.createElement('div');
    d.className = 'toast' + (bad ? ' bad' : '');
    d.textContent = msg;
    toastBox.appendChild(d);
    setTimeout(function () { d.remove(); }, 3600);
  }
  function tokenKey() { return 'fb_token_' + MODE; }

  /* ---------- talk to backend (or demo mode) ---------- */
  async function api(action, payload) {
    payload = Object.assign({}, payload || {});
    payload.token = localStorage.getItem(tokenKey()) || '';
    if (MODE === 'cloud') {
      var res = await fetch('/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action: action }, payload))
      });
      var j;
      try { j = await res.json(); } catch (e) { throw new Error('Server problem. Please try again.'); }
      if (!res.ok) throw new Error(j.error || 'Something went wrong.');
      return j.data;
    }
    var db = JSON.parse(localStorage.getItem('fb_db') || 'null') || E.emptyDb();
    var r = await E.handle(db, action, payload);
    if (r.changed) localStorage.setItem('fb_db', JSON.stringify(r.db));
    return r.data;
  }
  async function run(fn) {
    try { return await fn(); }
    catch (e) {
      if (e && e.message === 'Please login again.') { forceLogout(); }
      toast(e && e.message ? e.message : 'Something went wrong.', true);
    }
  }
  async function loadData() {
    var d = await api('refresh');
    S.foods = d.foods;
    S.requests = d.requests;
  }

  /* ---------- top bar ---------- */
  function renderUserbox() {
    if (!S.user) { userbox.innerHTML = ''; return; }
    userbox.innerHTML =
      '<span class="pill">' + (S.user.role === 'donor' ? 'Donor' : 'NGO') + '</span>' +
      '<b>' + esc(S.user.name) + '</b>' +
      '<button class="btn ghost small" data-act="logout">Logout</button>';
  }

  /* ---------- pages ---------- */
  function render() {
    renderUserbox();
    if (S.view === 'home') return renderHome();
    if (S.view === 'auth') return renderAuth();
    return renderDash();
  }

  function renderHome() {
    app.innerHTML =
      '<section class="hero">' +
      '<img src="assets/logo.png" alt="FoodBridge AI - Predictive Food Surplus Exchange">' +
      '<h1>Turn surplus food into <span>meals</span></h1>' +
      '<p>FoodBridge AI connects donors who have extra food with NGOs who can feed people - fast, safe and smart.</p>' +
      '</section>' +
      '<div class="role-grid">' +
      '<button class="role-card" data-act="role" data-id="donor"><div class="ico">🍱</div><h2>I am a Donor</h2>' +
      '<p>Restaurant, hotel, caterer, hostel or home with extra food? Post it in one minute.</p><span class="cta">Continue as Donor &rarr;</span></button>' +
      '<button class="role-card" data-act="role" data-id="ngo"><div class="ico">🤝</div><h2>I am an NGO</h2>' +
      '<p>See available food, request donation and get AI predictions of upcoming surplus.</p><span class="cta">Continue as NGO &rarr;</span></button>' +
      '</div>' +
      '<div class="steps">' +
      '<div class="step"><b>1</b><p>Donor posts the food with quantity, place and time.</p></div>' +
      '<div class="step"><b>2</b><p>NGOs see it instantly and send a request.</p></div>' +
      '<div class="step"><b>3</b><p>Donor accepts one NGO. Food is marked Booked.</p></div>' +
      '<div class="step"><b>4</b><p>NGO gets the details and collects the food.</p></div>' +
      '</div>';
  }

  function renderAuth() {
    var isNgo = S.role === 'ngo';
    var reg = S.authTab === 'register';
    var h = '<div class="card auth">' +
      '<button class="back" data-act="home">&larr; Back</button>' +
      '<h2>' + (isNgo ? '🤝 NGO' : '🍱 Donor') + ' ' + (reg ? 'Create account' : 'Login') + '</h2>' +
      '<div class="tabs2"><button class="' + (!reg ? 'on' : '') + '" data-act="authTab" data-id="login">Login</button>' +
      '<button class="' + (reg ? 'on' : '') + '" data-act="authTab" data-id="register">Create account</button></div>' +
      '<form data-form="' + (reg ? 'register' : 'login') + '" autocomplete="off">';
    h += '<label>' + (isNgo ? 'NGO Name' : 'Name') + '</label><input name="name" required maxlength="60" placeholder="' + (isNgo ? 'Example: Helping Hands Trust' : 'Example: Hotel Annapurna') + '">';
    if (reg && isNgo) {
      h += '<label>Contact number of NGO head</label><input name="phone" required inputmode="tel" maxlength="15" placeholder="10 digit mobile number">';
      h += '<label>NGO Location</label><input name="location" required maxlength="120" placeholder="Area, City">';
    }
    h += '<label>Password</label><input name="password" type="password" required minlength="4" placeholder="' + (reg ? 'Set a password (min 4 characters)' : 'Your password') + '">';
    if (reg) h += '<label>Confirm password</label><input name="password2" type="password" required minlength="4" placeholder="Type the password again">';
    h += '<label class="showpw"><input type="checkbox" data-showpw> Show password</label>';
    h += '<div class="err" id="autherr" style="display:none"></div>';
    h += '<button class="btn block" style="margin-top:16px" type="submit">' + (reg ? 'Create account' : 'Login') + '</button>';
    h += '</form></div>';
    app.innerHTML = h;
  }

  /* ---------- dashboard ---------- */
  function renderDash() {
    var u = S.user;
    var prof;
    if (u.role === 'ngo') {
      prof = '<div class="profile"><div><small>NGO</small><h2>' + esc(u.name) + '</h2></div>' +
        '<div class="meta"><div><small>Contact number of NGO head</small><b>' + esc(u.phone) + '</b></div>' +
        '<div><small>Location</small><b>' + esc(u.location) + '</b></div></div></div>';
    } else {
      prof = '<div class="profile"><div><small>Donor</small><h2>' + esc(u.name) + '</h2></div>' +
        '<div class="meta"><div><small>Thank you for sharing food</small><b>Post surplus food in one minute</b></div></div></div>';
    }
    app.innerHTML = '<div class="dash">' + prof + '<div id="bannerBox"></div><div class="tabs" id="tabs"></div><div id="content"></div></div>';
    renderTabs();
    renderBanner();
    renderContent();
  }

  function tabList() {
    var pend = S.requests.filter(function (r) { return r.status === 'pending'; }).length;
    var acc = S.requests.filter(function (r) { return r.status === 'accepted' && !r.seen; }).length;
    if (S.user.role === 'donor') {
      return [
        ['donate', '➕ Donate Food', 0],
        ['available', '🍱 Available Food', 0],
        ['requests', '📩 Requests', pend],
        ['stats', '📊 Statistics', 0]
      ];
    }
    return [
      ['available', '🍱 Available Food', 0],
      ['ai', '🤖 AI Surplus Prediction', 0],
      ['myreq', '📋 My Requests', acc],
      ['stats', '📊 Statistics', 0]
    ];
  }
  function renderTabs() {
    var box = document.getElementById('tabs');
    if (!box) return;
    box.innerHTML = tabList().map(function (t) {
      return '<button class="' + (S.tab === t[0] ? 'on' : '') + '" data-act="tab" data-id="' + t[0] + '">' + t[1] +
        (t[2] ? '<span class="badge">' + t[2] + '</span>' : '') + '</button>';
    }).join('');
  }
  function renderBanner() {
    var box = document.getElementById('bannerBox');
    if (!box) return;
    if (S.user.role !== 'ngo') { box.innerHTML = ''; return; }
    box.innerHTML = S.requests.filter(function (r) { return r.status === 'accepted' && !r.seen; }).map(function (r) {
      return '<div class="banner"><div>🎉 <b>Your request was accepted!</b> ' + esc(r.food.foodName) + ' (' + esc(r.food.quantity) + ' ' + esc(r.food.unit) + ') from <b>' +
        esc(r.donor.name) + '</b>. Call <a href="tel:' + esc(r.donor.phone) + '">' + esc(r.donor.phone) + '</a> to arrange the pickup.</div>' +
        '<button class="btn small" data-act="ack" data-id="' + esc(r.id) + '">Got it</button></div>';
    }).join('');
  }

  function renderContent() {
    var box = document.getElementById('content');
    if (!box) return;
    var t = S.tab;
    if (t === 'donate') box.innerHTML = donateForm();
    else if (t === 'available') {
      box.innerHTML =
        '<div class="toolbar"><input id="search" placeholder="Search food, donor or place" value="' + esc(S.search) + '">' +
        '<select id="filter"><option value="all"' + (S.filter === 'all' ? ' selected' : '') + '>All food</option>' +
        '<option value="available"' + (S.filter === 'available' ? ' selected' : '') + '>Only available</option></select></div>' +
        '<div id="foodGrid"></div>';
      renderGrid();
    }
    else if (t === 'requests') box.innerHTML = donorRequests();
    else if (t === 'myreq') box.innerHTML = ngoRequests();
    else if (t === 'ai') { box.innerHTML = aiView(); if (!S.pred) loadPrediction(); }
    else if (t === 'stats') { box.innerHTML = statsView(); }
  }

  /* ----- food list ----- */
  function isNear(f) {
    if (S.user.role !== 'ngo') return false;
    var toks = (S.user.location || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (x) { return x.length > 2; });
    var fl = (f.location || '').toLowerCase();
    return toks.some(function (x) { return fl.indexOf(x) >= 0; });
  }
  function renderGrid() {
    var grid = document.getElementById('foodGrid');
    if (!grid) return;
    var q = S.search.trim().toLowerCase();
    var list = S.foods.filter(function (f) {
      if (S.filter === 'available' && f.state !== 'available') return false;
      if (!q) return true;
      return (f.foodName + ' ' + f.donorName + ' ' + f.location).toLowerCase().indexOf(q) >= 0;
    });
    var rank = { available: 0, booked: 1, picked: 2, expired: 3 };
    list.sort(function (a, b) {
      if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
      if (a.state === 'available') {
        var na = isNear(a) ? 0 : 1, nb = isNear(b) ? 0 : 1;
        if (na !== nb) return na - nb;
        return Date.parse(a.expiresAt) - Date.parse(b.expiresAt);
      }
      return a.createdAt < b.createdAt ? 1 : -1;
    });
    if (!list.length) {
      grid.className = '';
      grid.innerHTML = '<div class="empty">🍽️<p>No food in the list yet.' +
        (S.user.role === 'donor' ? ' Use "Donate Food" to post the first one.' : ' New donations will appear here automatically.') + '</p></div>';
      return;
    }
    grid.className = 'grid';
    grid.innerHTML = list.map(foodCard).join('');
  }

  function foodCard(f) {
    var u = S.user;
    var tags = '<span class="tag ' + f.state + '">' + STATE_LABEL[f.state] + '</span>' +
      '<span class="tag ' + (f.foodType === 'Veg' ? 'veg' : 'nonveg') + '">' + esc(f.foodType) + '</span>' +
      (f.state === 'available' && isNear(f) ? '<span class="tag near">Near you</span>' : '');
    var acts = '<button class="btn ghost small" data-act="details" data-id="' + esc(f.id) + '">View details</button>';
    if (u.role === 'ngo') {
      if (f.state === 'available') {
        if (f.myRequest === 'pending') acts += '<button class="btn small" disabled>Requested - waiting</button>';
        else acts += '<button class="btn small" data-act="request" data-id="' + esc(f.id) + '">Request Donation</button>';
        if (f.myRequest === 'declined') acts += '<span class="tag declined">Earlier request declined</span>';
      } else if (f.state === 'booked' || f.state === 'picked') {
        acts += f.bookedForMe ? '<span class="tag accepted">Booked for you ✓</span>' : '<span class="tag booked">Already booked</span>';
      }
    } else if (f.isOwner) {
      if (f.pendingCount) acts += '<button class="btn warn small" data-act="gotoReq">' + f.pendingCount + ' request' + (f.pendingCount > 1 ? 's' : '') + '</button>';
      if (f.state === 'booked') acts += '<button class="btn small" data-act="picked" data-id="' + esc(f.id) + '">Mark picked up</button>';
      if (f.state === 'available' || f.state === 'expired') acts += '<button class="btn danger small" data-act="remove" data-id="' + esc(f.id) + '">Remove</button>';
    }
    return '<div class="food ' + f.state + '">' +
      '<div>' + tags + '</div>' +
      '<h3>' + esc(f.foodName) + '</h3>' +
      '<div class="by">by ' + esc(f.donorName) + (f.isOwner ? ' (you)' : '') + '</div>' +
      '<div class="line">🍽️ <b>' + esc(f.quantity) + ' ' + esc(f.unit) + '</b></div>' +
      '<div class="line">📍 ' + esc(f.location) + '</div>' +
      '<div class="line">🕒 Available: ' + fmt(f.availableAt) + '</div>' +
      '<div class="line">🛡️ Safe to eat until ' + fmt(f.expiresAt) + (f.state === 'available' ? ' <span class="hint">(' + left(f.expiresAt) + ')</span>' : '') + '</div>' +
      (f.state === 'booked' && f.isOwner && f.bookedByName ? '<div class="line">✅ Booked by <b>' + esc(f.bookedByName) + '</b></div>' : '') +
      '<div class="actions">' + acts + '</div></div>';
  }

  function detailsHtml(f) {
    var contact;
    if (f.phone) {
      contact = '<dt>Contact number</dt><dd><a href="tel:' + esc(f.phone) + '">' + esc(f.phone) + '</a></dd>' +
        '<dt>Email</dt><dd><a href="mailto:' + esc(f.email) + '">' + esc(f.email) + '</a></dd>';
    } else {
      contact = '<dt>Contact</dt><dd class="hint">Donor contact number and email are shown after the donor accepts your request.</dd>';
    }
    return '<h2>' + esc(f.foodName) + '</h2>' +
      '<span class="tag ' + f.state + '">' + STATE_LABEL[f.state] + '</span><span class="tag ' + (f.foodType === 'Veg' ? 'veg' : 'nonveg') + '">' + esc(f.foodType) + '</span>' +
      '<dl><dt>Donor name</dt><dd>' + esc(f.donorName) + '</dd>' +
      '<dt>Quantity</dt><dd>' + esc(f.quantity) + ' ' + esc(f.unit) + '</dd>' +
      '<dt>Pickup location</dt><dd>' + esc(f.location) + '</dd>' +
      '<dt>Available from</dt><dd>' + fmt(f.availableAt) + '</dd>' +
      '<dt>Safe to eat until</dt><dd>' + fmt(f.expiresAt) + ' (' + esc(f.safeHours) + ' hours after available time)</dd>' +
      contact + '</dl>' +
      '<button class="btn ghost block" data-act="closeModal">Close</button>';
  }

  /* ----- donate form ----- */
  function donateForm() {
    var d = new Date(Date.now() + 3600000);
    var date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    var time = pad(d.getHours()) + ':00';
    return '<div class="card"><h2>➕ Donate Food</h2><p class="hint">Fill the details. After you submit, the food is visible to all NGOs.</p>' +
      '<form data-form="food" autocomplete="off">' +
      '<div class="row"><div><label>Donor Name</label><input name="donorName" required maxlength="60" value="' + esc(S.user.name) + '"></div>' +
      '<div><label>Food Name</label><input name="foodName" required maxlength="80" placeholder="Example: Veg Biryani"></div></div>' +
      '<div class="row3"><div><label>Quantity</label><input name="quantity" type="number" min="1" max="100000" required placeholder="Example: 50"></div>' +
      '<div><label>Unit</label><select name="unit"><option>plates</option><option>packets</option><option>boxes</option><option>kg</option></select></div></div>' +
      '<label>Location (pickup address)</label><input name="location" required maxlength="160" placeholder="Area, City">' +
      '<div class="row"><div><label>Available date</label><input name="date" type="date" required value="' + date + '"></div>' +
      '<div><label>Available time</label><input name="time" type="time" required value="' + time + '"></div></div>' +
      '<div class="row"><div><label>Contact number</label><input name="phone" required inputmode="tel" maxlength="15" placeholder="10 digit mobile number"></div>' +
      '<div><label>Email</label><input name="email" type="email" required maxlength="80" placeholder="name@example.com"></div></div>' +
      '<div class="row"><div><label>Food type</label><select name="foodType"><option>Veg</option><option>Non-Veg</option></select></div>' +
      '<div><label>Safe to eat for (after available time)</label><select name="safeHours"><option value="2">2 hours</option><option value="3">3 hours</option><option value="4" selected>4 hours</option><option value="6">6 hours</option><option value="8">8 hours</option><option value="12">12 hours</option></select></div></div>' +
      '<label class="check"><input type="checkbox" name="safetyOk"> <span>Food safety: I confirm this food is freshly cooked, covered and stored hygienically, and safe to eat for the time selected above.</span></label>' +
      '<div class="err" id="fooderr" style="display:none"></div>' +
      '<button class="btn block" style="margin-top:16px" type="submit">Submit</button></form></div>';
  }

  /* ----- requests ----- */
  function donorRequests() {
    if (!S.requests.length) return '<div class="empty">📩<p>No requests yet. When an NGO requests your food, it will show here.</p></div>';
    var order = { pending: 0, accepted: 1, declined: 2, rejected: 3 };
    var list = S.requests.slice().sort(function (a, b) { return order[a.status] - order[b.status]; });
    return '<div class="list">' + list.map(function (r) {
      var btns = r.status === 'pending'
        ? '<div><button class="btn small" data-act="accept" data-id="' + esc(r.id) + '">Accept</button> <button class="btn danger small" data-act="decline" data-id="' + esc(r.id) + '">Decline</button></div>'
        : '';
      return '<div class="req"><div class="info"><span class="tag ' + r.status + '">' + REQ_LABEL[r.status] + '</span>' +
        '<h3>' + esc(r.ngo.name) + ' wants your food</h3>' +
        '<p>🍽️ ' + esc(r.food.foodName) + ' - ' + esc(r.food.quantity) + ' ' + esc(r.food.unit) + '</p>' +
        '<p>📞 <a href="tel:' + esc(r.ngo.phone) + '">' + esc(r.ngo.phone) + '</a> (NGO head) &nbsp; 📍 ' + esc(r.ngo.location) + '</p>' +
        '<p class="hint">Requested ' + fmt(r.createdAt) + '</p></div>' + btns + '</div>';
    }).join('') + '</div>';
  }
  function ngoRequests() {
    if (!S.requests.length) return '<div class="empty">📋<p>You have not requested any food yet. Go to "Available Food" and click "Request Donation".</p></div>';
    return '<div class="list">' + S.requests.map(function (r) {
      var extra = '';
      if (r.status === 'accepted' && r.donor) {
        extra = '<p><b>Donor:</b> ' + esc(r.donor.name) + '</p>' +
          '<p>📞 <a href="tel:' + esc(r.donor.phone) + '">' + esc(r.donor.phone) + '</a> &nbsp; ✉️ <a href="mailto:' + esc(r.donor.email) + '">' + esc(r.donor.email) + '</a></p>' +
          '<p>📍 ' + esc(r.food.location) + ' &nbsp; 🕒 ' + fmt(r.food.availableAt) + '</p>' +
          '<p class="hint">Please call the donor and arrange the pickup.</p>';
      }
      return '<div class="req"><div class="info"><span class="tag ' + r.status + '">' + REQ_LABEL[r.status] + '</span>' +
        '<h3>' + esc(r.food.foodName) + '</h3>' +
        '<p>🍽️ ' + esc(r.food.quantity) + ' ' + esc(r.food.unit) + ' &nbsp; ' + esc(r.food.foodType) + '</p>' + extra +
        '<p class="hint">Requested ' + fmt(r.createdAt) + '</p></div></div>';
    }).join('') + '</div>';
  }

  /* ----- AI Surplus Prediction ----- */
  function aiView() {
    var h = '<div class="card" style="margin-bottom:14px"><h2>🤖 AI Surplus Prediction</h2>' +
      '<p class="hint" style="margin:0">Which donors are likely to have extra food in the next 24 hours, how many meals, and how sure the AI is. ' +
      'It learns from each donor\'s past donations (and weekend patterns). Sample donors are demo data until more real donations are posted.</p>' +
      '<div style="margin-top:12px"><button class="btn small" data-act="refreshPred">Refresh prediction</button></div></div>';
    if (!S.pred) return h + '<div class="empty">Calculating...</div>';
    h += '<div class="list">' + S.pred.map(function (p) {
      var cls = p.confidence >= 80 ? '' : ' mid';
      return '<div class="pred"><div><h3>' + esc(p.donorName) + '</h3><div class="hint">' + esc(p.donorType) + ' &middot; likely time: ' + esc(p.window) + '</div></div>' +
        '<div><div class="big">' + esc(p.meals) + '</div><div class="hint">expected meals</div></div>' +
        '<div><b>' + esc(p.confidence) + '% confidence</b><div class="bar' + cls + '"><i style="width:' + esc(p.confidence) + '%"></i></div></div></div>';
    }).join('') + '</div>';
    return h;
  }
  async function loadPrediction() {
    await run(async function () {
      var d = await api('predict');
      S.pred = d.items;
      if (S.tab === 'ai') renderContent();
    });
  }

  /* ----- Statistics ----- */
  function statsView() {
    var st = E.STATS;
    var nf = function (n) { return n.toLocaleString('en-IN'); };
    return '<div class="stats">' +
      '<div class="stat"><small>Total Donations on this platform</small><div class="num">' + nf(st.totalDonations) + '</div></div>' +
      '<div class="stat"><small>Estimated Meals Saved</small><div class="num">' + nf(st.mealsSaved) + '</div></div>' +
      '<div class="stat"><small>Completed Pickups</small><div class="num">' + nf(st.pickups) + '</div></div></div>' +
      '<div class="card chart"><h2>Donations per month</h2><p class="hint" style="margin-top:0">Last 6 months</p>' + chartSvg(st.monthly) +
      '<table class="mt"><tr><th>Month</th><th>Donations</th></tr>' +
      st.monthly.map(function (m) { return '<tr><td>' + m.month + '</td><td>' + m.value + '</td></tr>'; }).join('') + '</table></div>';
  }
  function chartSvg(data) {
    var W = 640, H = 320, pl = 44, pr = 16, pt = 30, pb = 40, iw = W - pl - pr, ih = H - pt - pb, max = 300;
    var gap = iw / data.length, bw = gap * 0.56;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Donations per month for the last 6 months">' +
      '<defs><linearGradient id="barg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs>';
    [0, 100, 200, 300].forEach(function (v) {
      var y = pt + ih - ih * v / max;
      s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" stroke="#e5e7eb"/>' +
        '<text x="' + (pl - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="12" fill="#6b7280">' + v + '</text>';
    });
    var pts = [];
    data.forEach(function (d, i) {
      var x = pl + gap * i + (gap - bw) / 2, h = ih * d.value / max, y = pt + ih - h, cx = x + bw / 2;
      pts.push(cx + ',' + y);
      s += '<rect class="bar-rect" style="animation-delay:' + (i * 0.08) + 's" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="8"><title>' + d.month + ': ' + d.value + '</title></rect>' +
        '<text x="' + cx + '" y="' + (y - 8) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#14532d">' + d.value + '</text>' +
        '<text x="' + cx + '" y="' + (H - 14) + '" text-anchor="middle" font-size="13" fill="#374151">' + d.month.slice(0, 3) + '</text>';
    });
    s += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach(function (p) {
      var a = p.split(',');
      s += '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="5" fill="#fff" stroke="#f59e0b" stroke-width="3"/>';
    });
    return s + '</svg>';
  }

  /* ---------- actions ---------- */
  function showModal(html) {
    modalRoot.innerHTML = '<div class="overlay"><div class="modal">' + html + '</div></div>';
  }
  function closeModal() { modalRoot.innerHTML = ''; }

  function setUser(data) {
    localStorage.setItem(tokenKey(), data.token);
    S.user = data.user;
    S.view = 'dash';
    S.tab = data.user.role === 'donor' ? 'donate' : 'available';
    S.pred = null; S.foods = []; S.requests = [];
  }
  function forceLogout() {
    localStorage.removeItem(tokenKey());
    S.user = null; S.view = 'home'; S.role = null;
    render();
  }
  async function refreshAll() {
    await loadData();
    renderTabs(); renderBanner();
    if (S.tab === 'available') renderGrid();
    else if (S.tab !== 'donate' && S.tab !== 'ai' && S.tab !== 'stats') renderContent();
  }

  var H = {
    home: function () { S.view = 'home'; S.err = ''; render(); },
    role: function (id) { S.role = id; S.authTab = 'login'; S.view = 'auth'; render(); },
    authTab: function (id) { S.authTab = id; render(); },
    logout: async function () {
      try { await api('logout'); } catch (e) { }
      forceLogout();
    },
    tab: async function (id) {
      S.tab = id;
      renderTabs();
      renderContent();
      if (id === 'available' || id === 'requests' || id === 'myreq') await run(refreshAll);
    },
    gotoReq: function () { H.tab('requests'); },
    details: function (id) {
      var f = S.foods.find(function (x) { return x.id === id; });
      if (f) showModal(detailsHtml(f));
    },
    closeModal: closeModal,
    request: function (id) {
      return run(async function () {
        await api('requestFood', { foodId: id });
        toast('Request sent to the donor.');
        await refreshAll();
      });
    },
    accept: function (id) {
      return run(async function () {
        await api('respond', { requestId: id, decision: 'accept' });
        toast('Accepted. The food is now marked as Booked.');
        await refreshAll();
      });
    },
    decline: function (id) {
      return run(async function () {
        await api('respond', { requestId: id, decision: 'decline' });
        toast('Request declined.');
        await refreshAll();
      });
    },
    picked: function (id) {
      return run(async function () {
        await api('markPicked', { foodId: id });
        toast('Marked as picked up. Thank you!');
        await refreshAll();
      });
    },
    remove: function (id) {
      if (!confirm('Remove this food from the list?')) return;
      return run(async function () {
        await api('removeFood', { foodId: id });
        toast('Food removed.');
        await refreshAll();
      });
    },
    ack: function (id) {
      return run(async function () {
        await api('ack', { requestId: id });
        await refreshAll();
      });
    },
    refreshPred: function () {
      S.pred = null;
      renderContent();
    }
  };

  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('overlay')) { closeModal(); return; }
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (H[act]) H[act](el.getAttribute('data-id'), el);
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'search') { S.search = e.target.value; renderGrid(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'filter') { S.filter = e.target.value; renderGrid(); }
    if (e.target.hasAttribute && e.target.hasAttribute('data-showpw')) {
      var form = e.target.closest('form');
      form.querySelectorAll('input[name^="password"]').forEach(function (i) { i.type = e.target.checked ? 'text' : 'password'; });
    }
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var kind = form.getAttribute('data-form');
    var fd = new FormData(form);
    var btn = form.querySelector('button[type="submit"]');
    function showErr(id, msg) { var b = document.getElementById(id); if (b) { b.textContent = msg; b.style.display = 'block'; } }
    function busy(v) { if (btn) btn.disabled = v; }

    if (kind === 'login' || kind === 'register') {
      var errId = 'autherr';
      if (kind === 'register' && fd.get('password') !== fd.get('password2')) return showErr(errId, 'Passwords do not match.');
      busy(true);
      api(kind, {
        role: S.role, name: fd.get('name'), password: fd.get('password'),
        phone: fd.get('phone'), location: fd.get('location')
      }).then(async function (data) {
        setUser(data);
        render();
        await run(refreshAll);
      }).catch(function (err) {
        showErr(errId, err.message || 'Something went wrong.');
      }).then(function () { busy(false); });
      return;
    }

    if (kind === 'food') {
      var dt = new Date(fd.get('date') + 'T' + fd.get('time'));
      if (isNaN(dt.getTime())) return showErr('fooderr', 'Please choose the available date and time.');
      busy(true);
      api('addFood', {
        donorName: fd.get('donorName'), foodName: fd.get('foodName'), quantity: fd.get('quantity'), unit: fd.get('unit'),
        location: fd.get('location'), availableAt: dt.toISOString(), phone: fd.get('phone'), email: fd.get('email'),
        foodType: fd.get('foodType'), safeHours: fd.get('safeHours'), safetyOk: fd.get('safetyOk') === 'on'
      }).then(async function () {
        toast('Food posted! It is now visible to all NGOs.');
        S.tab = 'available';
        renderTabs(); renderContent();
        await run(refreshAll);
      }).catch(function (err) {
        showErr('fooderr', err.message || 'Something went wrong.');
        busy(false);
      });
    }
  });

  /* ---------- start ---------- */
  async function init() {
    try {
      var r = await fetch('/api', { cache: 'no-store' });
      var j = await r.json();
      if (!r.ok || !j.ok) throw new Error('no backend');
      MODE = 'cloud';
      dbstate.innerHTML = '<span class="dbstate ok">● Cloud database connected</span>';
    } catch (e) {
      MODE = 'local';
      dbstate.innerHTML = '<span class="dbstate demo">● Demo mode - data is saved only in this browser</span>';
    }
    if (localStorage.getItem(tokenKey())) {
      try {
        var me = await api('me');
        S.user = me.user; S.view = 'dash';
        S.tab = S.user.role === 'donor' ? 'donate' : 'available';
      } catch (e) { localStorage.removeItem(tokenKey()); }
    }
    render();
    if (S.user) await run(refreshAll);

    setInterval(async function () {
      if (S.view !== 'dash' || document.hidden || modalRoot.firstChild) return;
      try { await refreshAll(); } catch (e) { }
    }, 8000);
  }
  init();
})();
