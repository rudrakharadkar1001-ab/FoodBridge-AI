/* FoodBridge AI - engine (all rules live here)
   Used by the Netlify backend (netlify/functions/api.mjs) and by the browser demo mode. */
(function (root) {
  'use strict';

  var wc = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
    ? globalThis.crypto
    : (typeof require === 'function' ? require('crypto').webcrypto : null);

  function UserError(message) {
    var e = new Error(message);
    e.userError = true;
    return e;
  }
  var ue = UserError;

  async function sha256(text) {
    var buf = await wc.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function rid(n) {
    var a = new Uint8Array(n || 12);
    wc.getRandomValues(a);
    return Array.from(a).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
  }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 100); }

  var PHONE = /^[0-9+\-\s]{10,15}$/;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var UNITS = ['plates', 'packets', 'boxes', 'kg'];

  /* Numbers shown on the Statistics page (as given in the problem statement) */
  var STATS = {
    totalDonations: 1248,
    mealsSaved: 18760,
    pickups: 1102,
    monthly: [
      { month: 'May', value: 120 },
      { month: 'June', value: 180 },
      { month: 'July', value: 210 },
      { month: 'August', value: 260 },
      { month: 'September', value: 230 },
      { month: 'October', value: 248 }
    ]
  };

  /* Sample donor history used by the AI Surplus Prediction (demo data) */
  var SEED_DONORS = [
    { name: 'Hotel Annapurna', type: 'Hotel', hist: [78, 92, 85, 88, 80, 95], window: '9:30 PM - 11:00 PM' },
    { name: 'Shree Sai Caterers', type: 'Caterer', hist: [140, 95, 160, 120, 185, 110], window: '3:00 PM - 5:00 PM' },
    { name: 'Green Leaf Restaurant', type: 'Restaurant', hist: [42, 38, 45, 40, 47, 41], window: '10:00 PM - 11:30 PM' },
    { name: 'Royal Wedding Hall', type: 'Banquet hall', hist: [210, 320, 180, 350, 260, 300], window: '11:00 PM - 12:30 AM' },
    { name: 'City Engineering Mess', type: 'College mess', hist: [65, 70, 62, 68, 72, 66], window: '2:30 PM - 4:00 PM' },
    { name: 'Tech Park Canteen', type: 'Corporate canteen', hist: [55, 60, 48, 58, 52, 57], window: '3:30 PM - 5:00 PM' }
  ];

  function emptyDb() { return { users: [], foods: [], requests: [], sessions: {} }; }

  function pub(u) { return { id: u.id, role: u.role, name: u.name, phone: u.phone || '', location: u.location || '' }; }

  function mealsOf(f) {
    var q = Number(f.quantity) || 0;
    if (f.unit === 'boxes') return q * 10;
    if (f.unit === 'kg') return q * 4;
    return q;
  }

  function stateOf(f, now) {
    if (f.status === 'picked') return 'picked';
    if (f.status === 'booked') return 'booked';
    if (now > Date.parse(f.expiresAt)) return 'expired';
    return 'available';
  }

  function pubFood(f, viewer, db, now) {
    var state = stateOf(f, now);
    var out = {
      id: f.id, donorId: f.donorId, donorName: f.donorName, foodName: f.foodName,
      quantity: f.quantity, unit: f.unit, location: f.location, availableAt: f.availableAt,
      expiresAt: f.expiresAt, safeHours: f.safeHours, foodType: f.foodType,
      createdAt: f.createdAt, state: state
    };
    var isOwner = viewer.role === 'donor' && viewer.id === f.donorId;
    var mine = null;
    if (viewer.role === 'ngo') {
      var list = db.requests.filter(function (r) { return r.foodId === f.id && r.ngoId === viewer.id; });
      list.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
      mine = list[0] || null;
    }
    out.isOwner = isOwner;
    out.myRequest = mine ? mine.status : null;
    out.bookedForMe = !!(mine && mine.status === 'accepted');
    if (isOwner || (mine && mine.status === 'accepted')) { out.phone = f.phone; out.email = f.email; }
    if (isOwner) {
      out.pendingCount = db.requests.filter(function (r) { return r.foodId === f.id && r.status === 'pending'; }).length;
      if (f.bookedByName) out.bookedByName = f.bookedByName;
    }
    return out;
  }

  function forecast(name, type, hist, windowText, weekend, dayKey) {
    var h = hist.slice(-8), n = h.length, est, mean;
    if (n) {
      var w = 0, s = 0;
      h.forEach(function (v, i) { w += i + 1; s += v * (i + 1); });
      est = s / w;
      mean = h.reduce(function (a, b) { return a + b; }, 0) / n;
    } else { est = 40; mean = 40; }
    var sd = n > 1 ? Math.sqrt(h.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / n) : mean * 0.5;
    var cv = Math.min(sd / (mean || 1), 1);
    var conf = n ? 52 + Math.min(n, 8) * 3 + (1 - cv) * 18 : 46;
    var jitter = ((hash(name + dayKey) % 11) - 5) / 100;
    var meals = Math.max(5, Math.round(est * (weekend ? 1.12 : 1) * (1 + jitter)));
    conf = Math.round(Math.max(45, Math.min(96, conf + ((hash(name + dayKey + 'c') % 5) - 2))));
    return { donorName: name, donorType: type, meals: meals, confidence: conf, window: windowText, samples: n };
  }

  function predict(db, now) {
    var d = new Date(now), day = d.getUTCDay(), weekend = (day === 0 || day === 6);
    var dayKey = d.toISOString().slice(0, 10);
    var out = SEED_DONORS.map(function (s) { return forecast(s.name, s.type, s.hist, s.window, weekend, dayKey); });
    db.users.filter(function (u) { return u.role === 'donor'; }).forEach(function (u) {
      var h = db.foods.filter(function (f) { return f.donorId === u.id; }).map(mealsOf);
      if (!h.length) return;
      out.push(forecast(u.name, 'Registered donor', h, 'Usually evening', weekend, dayKey));
    });
    out.sort(function (a, b) { return b.confidence - a.confidence; });
    return out;
  }

  async function handle(db, action, p) {
    p = p || {};
    var now = Date.now();
    var changed = false;

    function ret(data) { return { db: db, data: data, changed: changed }; }

    function auth(role) {
      var s = db.sessions[p.token];
      var u = s && db.users.find(function (x) { return x.id === s.userId; });
      if (!u) throw ue('Please login again.');
      if (role && u.role !== role) throw ue('This action is only for ' + (role === 'donor' ? 'donors' : 'NGOs') + '.');
      return u;
    }

    function newSession(user) {
      var cutoff = now - 30 * 24 * 3600 * 1000;
      Object.keys(db.sessions).forEach(function (k) { if (db.sessions[k].at < cutoff) delete db.sessions[k]; });
      var token = rid(24);
      db.sessions[token] = { userId: user.id, at: now };
      changed = true;
      return token;
    }

    switch (action) {

      case 'register': {
        var role = p.role;
        if (role !== 'donor' && role !== 'ngo') throw ue('Please choose Donor or NGO.');
        var name = clean(p.name, 60);
        if (name.length < 2) throw ue(role === 'ngo' ? 'Please enter the NGO name.' : 'Please enter your name.');
        var password = String(p.password || '');
        if (password.length < 4) throw ue('Password must be at least 4 characters.');
        var phone = '', location = '';
        if (role === 'ngo') {
          phone = clean(p.phone, 20);
          location = clean(p.location, 120);
          if (!PHONE.test(phone)) throw ue('Please enter a valid contact number of the NGO head.');
          if (location.length < 3) throw ue('Please enter the NGO location.');
        }
        var taken = db.users.some(function (u) { return u.role === role && u.name.toLowerCase() === name.toLowerCase(); });
        if (taken) throw ue('This name is already used. Please login, or choose another name.');
        var salt = rid(8);
        var user = { id: rid(8), role: role, name: name, phone: phone, location: location, salt: salt, hash: await sha256(salt + password), createdAt: new Date(now).toISOString() };
        db.users.push(user);
        var token = newSession(user);
        return ret({ token: token, user: pub(user) });
      }

      case 'login': {
        var lname = clean(p.name, 60).toLowerCase();
        var u = db.users.find(function (x) { return x.role === p.role && x.name.toLowerCase() === lname; });
        if (!u || (await sha256(u.salt + String(p.password || ''))) !== u.hash) throw ue('Wrong name or password.');
        var tk = newSession(u);
        return ret({ token: tk, user: pub(u) });
      }

      case 'me': {
        return ret({ user: pub(auth()) });
      }

      case 'logout': {
        if (db.sessions[p.token]) { delete db.sessions[p.token]; changed = true; }
        return ret({ ok: true });
      }

      case 'refresh': {
        var me = auth();
        var foods = db.foods
          .filter(function (f) {
            return !(stateOf(f, now) === 'expired' && now - Date.parse(f.expiresAt) > 12 * 3600 * 1000);
          })
          .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
          .map(function (f) { return pubFood(f, me, db, now); });

        var reqs = [];
        if (me.role === 'donor') {
          db.requests.forEach(function (r) {
            var f = db.foods.find(function (x) { return x.id === r.foodId; });
            if (!f || f.donorId !== me.id) return;
            reqs.push({
              id: r.id, status: r.status, createdAt: r.createdAt,
              food: { id: f.id, foodName: f.foodName, quantity: f.quantity, unit: f.unit, location: f.location, availableAt: f.availableAt },
              ngo: { name: r.ngoName, phone: r.ngoPhone, location: r.ngoLocation }
            });
          });
        } else {
          db.requests.forEach(function (r) {
            if (r.ngoId !== me.id) return;
            var f = db.foods.find(function (x) { return x.id === r.foodId; });
            if (!f) return;
            var item = {
              id: r.id, status: r.status, seen: !!r.seen, createdAt: r.createdAt,
              food: { id: f.id, foodName: f.foodName, quantity: f.quantity, unit: f.unit, location: f.location, availableAt: f.availableAt, foodType: f.foodType }
            };
            if (r.status === 'accepted') item.donor = { name: f.donorName, phone: f.phone, email: f.email };
            reqs.push(item);
          });
        }
        reqs.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
        return ret({ foods: foods, requests: reqs });
      }

      case 'addFood': {
        var d = auth('donor');
        var donorName = clean(p.donorName, 60);
        var foodName = clean(p.foodName, 80);
        var quantity = Math.round(Number(p.quantity));
        var unit = UNITS.indexOf(p.unit) >= 0 ? p.unit : 'plates';
        var loc = clean(p.location, 160);
        var phone2 = clean(p.phone, 20);
        var email = clean(p.email, 80);
        var foodType = p.foodType === 'Non-Veg' ? 'Non-Veg' : 'Veg';
        var safeHours = Math.max(1, Math.min(12, Number(p.safeHours) || 4));
        var at = Date.parse(p.availableAt);
        if (donorName.length < 2) throw ue('Please enter the donor name.');
        if (foodName.length < 2) throw ue('Please enter the food name.');
        if (!(quantity > 0 && quantity <= 100000)) throw ue('Please enter a valid quantity.');
        if (loc.length < 3) throw ue('Please enter the pickup location.');
        if (isNaN(at)) throw ue('Please choose the available date and time.');
        if (!PHONE.test(phone2)) throw ue('Please enter a valid contact number.');
        if (!EMAIL.test(email)) throw ue('Please enter a valid email.');
        if (!p.safetyOk) throw ue('Please tick the food safety box to confirm the food is fresh and safe.');
        var expiresAt = at + safeHours * 3600 * 1000;
        if (expiresAt <= now) throw ue('This time has already passed. Please choose a later time.');
        var food = {
          id: rid(8), donorId: d.id, donorName: donorName, foodName: foodName, quantity: quantity, unit: unit,
          location: loc, availableAt: new Date(at).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
          safeHours: safeHours, foodType: foodType, phone: phone2, email: email, status: 'available',
          createdAt: new Date(now).toISOString()
        };
        db.foods.push(food);
        changed = true;
        return ret({ id: food.id });
      }

      case 'removeFood': {
        var d2 = auth('donor');
        var f2 = db.foods.find(function (x) { return x.id === p.foodId && x.donorId === d2.id; });
        if (!f2) throw ue('Food not found.');
        if (f2.status === 'booked' || f2.status === 'picked') throw ue('A booked food cannot be removed.');
        db.foods = db.foods.filter(function (x) { return x.id !== f2.id; });
        db.requests = db.requests.filter(function (r) { return r.foodId !== f2.id; });
        changed = true;
        return ret({ ok: true });
      }

      case 'markPicked': {
        var d3 = auth('donor');
        var f3 = db.foods.find(function (x) { return x.id === p.foodId && x.donorId === d3.id; });
        if (!f3 || f3.status !== 'booked') throw ue('Only a booked food can be marked as picked up.');
        f3.status = 'picked';
        f3.pickedAt = new Date(now).toISOString();
        changed = true;
        return ret({ ok: true });
      }

      case 'requestFood': {
        var n = auth('ngo');
        var f4 = db.foods.find(function (x) { return x.id === p.foodId; });
        if (!f4) throw ue('Food not found.');
        var st = stateOf(f4, now);
        if (st === 'booked' || st === 'picked') throw ue('Sorry, this food is already booked.');
        if (st === 'expired') throw ue('This food is expired for safety and cannot be requested.');
        var dup = db.requests.some(function (r) { return r.foodId === f4.id && r.ngoId === n.id && (r.status === 'pending' || r.status === 'accepted'); });
        if (dup) throw ue('You already requested this food.');
        db.requests.push({
          id: rid(8), foodId: f4.id, ngoId: n.id, ngoName: n.name, ngoPhone: n.phone, ngoLocation: n.location,
          status: 'pending', seen: false, createdAt: new Date(now).toISOString()
        });
        changed = true;
        return ret({ ok: true });
      }

      case 'respond': {
        var d4 = auth('donor');
        var r = db.requests.find(function (x) { return x.id === p.requestId; });
        var f5 = r && db.foods.find(function (x) { return x.id === r.foodId && x.donorId === d4.id; });
        if (!r || !f5) throw ue('Request not found.');
        if (r.status !== 'pending') throw ue('This request is already answered.');
        if (p.decision === 'accept') {
          var st2 = stateOf(f5, now);
          if (st2 !== 'available') throw ue(st2 === 'expired' ? 'This food has expired.' : 'This food is already booked.');
          r.status = 'accepted';
          r.seen = false;
          f5.status = 'booked';
          f5.bookedByNgoId = r.ngoId;
          f5.bookedByName = r.ngoName;
          f5.bookedAt = new Date(now).toISOString();
          db.requests.forEach(function (o) {
            if (o.foodId === f5.id && o.id !== r.id && o.status === 'pending') o.status = 'rejected';
          });
        } else if (p.decision === 'decline') {
          r.status = 'declined';
        } else {
          throw ue('Unknown choice.');
        }
        changed = true;
        return ret({ ok: true });
      }

      case 'ack': {
        var n2 = auth('ngo');
        var r2 = db.requests.find(function (x) { return x.id === p.requestId && x.ngoId === n2.id; });
        if (r2 && !r2.seen) { r2.seen = true; changed = true; }
        return ret({ ok: true });
      }

      case 'predict': {
        auth('ngo');
        return ret({ items: predict(db, now) });
      }

      default:
        throw ue('Unknown action.');
    }
  }

  var api = { emptyDb: emptyDb, handle: handle, UserError: UserError, STATS: STATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FBEngine = api;
})(typeof self !== 'undefined' ? self : globalThis);
