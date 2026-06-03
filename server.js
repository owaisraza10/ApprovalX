const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const admin = require('firebase-admin'); // 1. IMPORT FIREBASE ADMIN

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// ==========================================
// 0. FIREBASE ADMIN SETUP
// ==========================================
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

// ==========================================
// 1. CUSTOM COOKIE AUTH MIDDLEWARE
// ==========================================
const adminUsername = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASS || '6374283164'; // Use strong pass in production

const expectedToken = Buffer.from(`${adminUsername}:${adminPassword}`).toString('base64');

const requireAuth = (req, res, next) => {
    const { auth_token } = req.cookies;
    if (auth_token === expectedToken) return next();
    if (req.path.startsWith('/api')) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    } else {
        return res.redirect('/login');
    }
};

// ==========================================
// 2. DATABASE CONNECTION
// ==========================================
const dbURI = process.env.MONGODB_URI || 'mongodb+srv://approval_db_user:Approval@cluster0.wn4xkbz.mongodb.net/?appName=Cluster0';
mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to MongoDB Cloud!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const requestSchema = new mongoose.Schema({
    name: String,
    phone: String,
    service: String,
    propertyType: String,
    description: String,
    state: String,
    city: String,
    address: String,
    fcmToken: String, // RESTORED: Needed for push notifications
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});

const Request = mongoose.model('Request', requestSchema);

// ==========================================
// 3. ANDROID APP APIs (UNPROTECTED)
// ==========================================
app.post('/api/requests', async (req, res) => {
    try {
        console.log("📥 New request incoming:", req.body);
        const newRequest = new Request(req.body);
        await newRequest.save();
        res.status(200).json({ success: true, message: "Request saved to database!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to save to database" });
    }
});

app.get('/api/requests/user/:phone', async (req, res) => {
    try {
        const userPhone = req.params.phone;
        const userRequests = await Request.find({ phone: userPhone }).sort({ createdAt: -1 });
        res.status(200).json(userRequests);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch user requests" });
    }
});

// ==========================================
// 4. ADMIN DASHBOARD APIs (PROTECTED)
// ==========================================
app.post('/api/requests/:id/status', requireAuth, async (req, res) => {
    try {
        // RESTORED: { returnDocument: 'after' } to get the updated document
        const updatedRequest = await Request.findByIdAndUpdate(
            req.params.id, 
            { status: req.body.status },
            { returnDocument: 'after' } 
        );

        // RESTORED: Trigger Push Notification
        if (updatedRequest && updatedRequest.fcmToken) {
            const message = {
                notification: {
                    title: 'ApprovalX Status Update',
                    body: `Good news! Your ${updatedRequest.service} is now: ${updatedRequest.status}`
                },
                token: updatedRequest.fcmToken
            };
            
            try {
                await admin.messaging().send(message);
                console.log("🔔 Push notification fired successfully!");
            } catch (notiErr) {
                console.error("❌ Failed to send notification:", notiErr);
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update status" });
    }
});

app.delete('/api/requests/:id', requireAuth, async (req, res) => {
    try {
        await Request.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Request deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete request" });
    }
});

// ==========================================
// 5. CUSTOM LOGIN UI & AUTH ROUTES
// ==========================================
app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === adminUsername && password === adminPassword) {
        res.cookie('auth_token', expectedToken, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.get('/auth/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    if (req.cookies.auth_token === expectedToken) return res.redirect('/admin');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Login — ApprovalX</title>
<style>
/* --- PERFORMANCE: system font stack, zero network ---*/
:root {
    --bg:      #07090f;
    --card:    #111827;
    --border:  #1f2d45;
    --accent:  #4f8cff;
    --accent2: #a78bfa;
    --text:    #e8eeff;
    --muted:   #4a5a78;
    --green:   #34d399;
    --red:     #f87171;
    --font:    'Segoe UI', system-ui, -apple-system, sans-serif;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    -webkit-font-smoothing: antialiased;
    /* PERF: single gradient, GPU-composited, no repaints */
    background-image: radial-gradient(ellipse 70% 50% at 30% 20%, rgba(79,140,255,0.09), transparent 60%),
                      radial-gradient(ellipse 50% 40% at 75% 75%, rgba(167,139,250,0.07), transparent 55%);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
}
.card {
    width: 100%;
    max-width: 400px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 22px;
    padding: 44px 38px;
    box-shadow: 0 32px 80px rgba(0,0,0,0.55);
    will-change: transform;
    animation: popIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
    text-align: center;
    position: relative;
    z-index: 1;
}
@keyframes popIn {
    from { opacity: 0; transform: translateY(18px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
.logo {
    width: 52px; height: 52px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 20px; color: #fff;
    margin: 0 auto 18px;
    letter-spacing: -0.5px;
    box-shadow: 0 0 0 6px rgba(79,140,255,0.1), 0 8px 24px rgba(79,140,255,0.25);
}
h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.4px; margin-bottom: 6px; }
.sub { color: var(--muted); font-size: 13.5px; margin-bottom: 30px; }
.field { margin-bottom: 14px; text-align: left; }
label  { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.9px; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
input  {
    width: 100%; padding: 13px 15px;
    background: #0d1424; border: 1px solid var(--border);
    border-radius: 11px; color: var(--text);
    font-family: var(--font); font-size: 14px; outline: none;
    transition: border-color 0.18s;
}
input:focus { border-color: var(--accent); }
.btn {
    width: 100%; padding: 14px; margin-top: 18px;
    border: none; border-radius: 11px;
    background: linear-gradient(90deg, var(--accent) 0%, var(--accent2) 100%);
    color: #fff; font-family: var(--font); font-weight: 700; font-size: 15px;
    cursor: pointer; letter-spacing: 0.2px;
    transition: transform 0.15s, opacity 0.15s;
    position: relative; overflow: hidden;
}
.btn:hover { transform: translateY(-2px); }
.btn:active { transform: translateY(0); opacity: 0.9; }
.btn.loading { opacity: 0.7; pointer-events: none; }
.btn.loading::after {
    content: '';
    position: absolute; inset: 0;
    background: rgba(255,255,255,0.08);
    animation: shimmer 0.9s infinite;
}
@keyframes shimmer {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}
.error-msg {
    margin-top: 14px; padding: 10px 14px;
    background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.2);
    border-radius: 9px; color: var(--red); font-size: 13px;
    display: none;
}
.error-msg.show { display: block; animation: shake 0.35s ease; }
@keyframes shake {
    0%,100% { transform: translateX(0); }
    25%      { transform: translateX(-6px); }
    75%      { transform: translateX(6px); }
}
.card { isolation: isolate; }
</style>
</head>
<body>
<div class="card">
    <div class="logo">AX</div>
    <h1>ApprovalX Admin</h1>
    <p class="sub">Sign in to manage client requests.</p>

    <div class="field">
        <label>Username</label>
        <input type="text" id="user" autocomplete="username" autofocus/>
    </div>
    <div class="field">
        <label>Password</label>
        <input type="password" id="pass" autocomplete="current-password"/>
    </div>

    <div class="error-msg" id="err">Invalid credentials. Please try again.</div>
    <button class="btn" id="loginBtn" onclick="login()">Access Dashboard</button>
</div>

<script>
    const btn = document.getElementById('loginBtn');
    const errEl = document.getElementById('err');

    function login() {
        const u = document.getElementById('user').value.trim();
        const p = document.getElementById('pass').value;
        if (!u || !p) { showError('Please fill in both fields.'); return; }

        btn.textContent = 'Signing in…';
        btn.classList.add('loading');
        errEl.classList.remove('show');

        fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                window.location.href = '/admin';
            } else {
                btn.textContent = 'Access Dashboard';
                btn.classList.remove('loading');
                showError('Invalid credentials. Please try again.');
            }
        })
        .catch(() => {
            btn.textContent = 'Access Dashboard';
            btn.classList.remove('loading');
            showError('Network error. Please try again.');
        });
    }

    function showError(msg) {
        errEl.textContent = msg;
        errEl.classList.remove('show');
        void errEl.offsetWidth; // reflow to retrigger shake
        errEl.classList.add('show');
    }

    document.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
</script>
</body>
</html>`;
    res.send(html);
});

// ==========================================
// 6. ADMIN PANEL (PROTECTED)
// ==========================================
app.get('/admin', requireAuth, async (req, res) => {
    try {
        const requests = await Request.find().sort({ createdAt: -1 });

        const totalRequests = requests.length;
        const pending    = requests.filter(r => r.status === 'Pending').length;
        const approved   = requests.filter(r => r.status === 'Approved').length;
        const processing = requests.filter(r => r.status === 'Processing').length;
        const rejected   = requests.filter(r => r.status === 'Rejected').length;

        const badgeMap = {
            Pending:    `<span class="badge bp">⏳ Pending</span>`,
            Processing: `<span class="badge bc">⚙️ Processing</span>`,
            Approved:   `<span class="badge ba">✅ Approved</span>`,
            Rejected:   `<span class="badge br">❌ Rejected</span>`,
        };

        const avatarColors = ['#2563eb','#7c3aed','#0891b2','#059669','#d97706','#dc2626'];
        const colorFor = (name) => avatarColors[(name || 'A').charCodeAt(0) % avatarColors.length];

        let rowsHtml = '';
        requests.forEach((r) => {
            const date     = new Date(r.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
            const initial  = (r.name || '?')[0].toUpperCase();
            const bgColor  = colorFor(r.name);
            const location = [r.address, r.city, r.state].filter(Boolean).join(', ') || '—';
            const badge    = badgeMap[r.status] || badgeMap.Pending;
            const id       = r._id.toString();

            rowsHtml += `<tr class="row" data-search="${(r.name||'') + ' ' + (r.phone||'') + ' ' + (r.service||'')}">
<td><span class="chip">${date}</span></td>
<td>
  <div class="cl">
    <div class="av" style="background:${bgColor}">${initial}</div>
    <div><div class="cn">${r.name||'—'}</div><div class="cp">📞 ${r.phone||'—'}</div></div>
  </div>
</td>
<td>
  <div class="sl">${r.service||'—'}</div>
  <div class="sm">🏠 ${r.propertyType||'—'}</div>
  <div class="sm">📍 ${location}</div>
  ${r.description ? `<div class="sn">${r.description}</div>` : ''}
</td>
<td>
  ${badge}
  <div class="ar">
    <select onchange="updateStatus('${id}',this)" class="ss">
      <option value="Pending"    ${r.status==='Pending'    ?'selected':''}>⏳ Pending</option>
      <option value="Processing" ${r.status==='Processing' ?'selected':''}>⚙️ Processing</option>
      <option value="Approved"   ${r.status==='Approved'   ?'selected':''}>✅ Approved</option>
      <option value="Rejected"   ${r.status==='Rejected'   ?'selected':''}>❌ Rejected</option>
    </select>
    <button onclick="deleteReq('${id}',this)" class="db" title="Delete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
    </button>
  </div>
</td>
</tr>`;
        });

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>ApprovalX — Admin</title>
<style>
:root {
    --bg:      #07090f;
    --surface: #0f1724;
    --surface2:#131e30;
    --border:  #1a2640;
    --border2: #223050;
    --accent:  #4f8cff;
    --accent2: #a78bfa;
    --green:   #34d399;
    --yellow:  #fbbf24;
    --red:     #f87171;
    --blue:    #60a5fa;
    --text:    #e8eeff;
    --text2:   #7a8fad;
    --text3:   #3a4d6a;
    --radius:  18px;
    --font:    'Segoe UI', system-ui, -apple-system, sans-serif;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
    min-height: 100vh;
    background: var(--bg);
    background-image: radial-gradient(ellipse 80% 55% at 15% 5%, rgba(79,140,255,0.08), transparent 60%),
                      radial-gradient(ellipse 55% 45% at 85% 85%, rgba(167,139,250,0.07), transparent 55%);
    color: var(--text);
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
}
.header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 36px;
    background: rgba(10,14,24,0.88);
    will-change: transform;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 100;
}
.logo { display: flex; align-items: center; gap: 11px; }
.lm {
    width: 36px; height: 36px; border-radius: 9px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 14px; color: #fff; letter-spacing: -0.5px;
    box-shadow: 0 4px 16px rgba(79,140,255,0.3);
}
.lt { font-weight: 700; font-size: 17px; letter-spacing: -0.3px; }
.lt span { color: var(--accent); }
.hr { display: flex; align-items: center; gap: 12px; }
.pill {
    display: flex; align-items: center; gap: 7px;
    padding: 6px 14px; border-radius: 100px;
    border: 1px solid var(--border2);
    background: var(--surface);
    font-size: 12px; color: var(--text2);
    text-decoration: none; transition: background 0.15s, color 0.15s;
}
.pill.live::before {
    content: '';
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--green);
    animation: blink 2.2s ease infinite;
    flex-shrink: 0;
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
.pill:hover { background: rgba(248,113,113,0.12); color: var(--red); border-color: rgba(248,113,113,0.25); }

.main { padding: 32px 36px; max-width: 1380px; margin: 0 auto; }
.ptitle { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 3px; }
.psub   { color: var(--text2); font-size: 13.5px; margin-bottom: 28px; }

.grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 14px; margin-bottom: 28px;
}
.sc {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 18px;
    position: relative; overflow: hidden;
    transition: transform 0.2s, border-color 0.2s;
    contain: layout style;
}
.sc::after {
    content: ''; position: absolute;
    top: 0; left: 0; right: 0; height: 2px;
}
.sc.total::after  { background: linear-gradient(90deg, var(--accent), var(--accent2)); }
.sc.pend::after   { background: var(--yellow); }
.sc.proc::after   { background: var(--blue); }
.sc.appr::after   { background: var(--green); }
.sc.rej::after    { background: var(--red); }
.sc:hover { transform: translateY(-2px); border-color: var(--border2); }
.si { font-size: 20px; margin-bottom: 8px; }
.sn { font-size: 30px; font-weight: 800; letter-spacing: -1px; line-height: 1; }
.sl { font-size: 11px; color: var(--text2); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.8px; }
.grid .sc { animation: fadeUp 0.4s ease both; }
.grid .sc:nth-child(1){animation-delay:.00s}
.grid .sc:nth-child(2){animation-delay:.05s}
.grid .sc:nth-child(3){animation-delay:.10s}
.grid .sc:nth-child(4){animation-delay:.15s}
.grid .sc:nth-child(5){animation-delay:.20s}
@keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }

.tb { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.sw { position: relative; flex: 1; max-width: 340px; }
.si2 { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--text3); pointer-events: none; }
.si-input {
    width: 100%; padding: 10px 14px 10px 40px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 11px; color: var(--text);
    font-family: var(--font); font-size: 14px; outline: none;
    transition: border-color 0.15s;
}
.si-input::placeholder { color: var(--text3); }
.si-input:focus { border-color: var(--accent); }
.rc { font-size: 13px; color: var(--text2); background: var(--surface); border: 1px solid var(--border); padding: 9px 16px; border-radius: 11px; white-space: nowrap; }

.tw {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: 0 8px 40px rgba(0,0,0,0.35);
    animation: fadeUp 0.35s 0.2s ease both;
}
table { width: 100%; border-collapse: collapse; }
thead tr { background: var(--surface2); border-bottom: 1px solid var(--border); }
th {
    padding: 13px 18px; text-align: left;
    font-size: 10.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1.1px; color: var(--text3);
}
.row { border-bottom: 1px solid rgba(255,255,255,0.035); contain: layout style; transition: background 0.12s; }
.row:last-child { border-bottom: none; }
.row:hover { background: rgba(255,255,255,0.025); }
td { padding: 14px 18px; vertical-align: middle; }

.chip { font-size: 11.5px; color: var(--text2); background: var(--surface2); padding: 3px 9px; border-radius: 100px; white-space: nowrap; }
.cl { display: flex; align-items: center; gap: 11px; }
.av { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: #fff; flex-shrink: 0; }
.cn { font-weight: 500; font-size: 14px; }
.cp { font-size: 12px; color: var(--text2); }
.service-label,.sl2 { font-weight: 500; font-size: 13.5px; margin-bottom: 2px; }
.sm { font-size: 12px; color: var(--text2); margin-top: 1px; }
.sn-note { font-size: 11px; color: var(--text3); font-style: italic; margin-top: 2px; }

.badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 100px; font-size: 12px; font-weight: 600; margin-bottom: 9px; border: 1px solid; }
.bp { background: rgba(251,191,36,.1);  color: var(--yellow); border-color: rgba(251,191,36,.2); }
.bc { background: rgba(96,165,250,.1);  color: var(--blue);   border-color: rgba(96,165,250,.2); }
.ba { background: rgba(52,211,153,.1);  color: var(--green);  border-color: rgba(52,211,153,.2); }
.br { background: rgba(248,113,113,.1); color: var(--red);    border-color: rgba(248,113,113,.2); }

.ar { display: flex; align-items: center; gap: 8px; }
.ss {
    flex: 1; padding: 7px 28px 7px 10px;
    background: var(--surface2); border: 1px solid var(--border2);
    border-radius: 9px; color: var(--text);
    font-family: var(--font); font-size: 13px; outline: none; cursor: pointer;
    appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%233a4d6a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 9px center;
    transition: border-color 0.15s;
}
.ss:focus { border-color: var(--accent); }
.ss option { background: #111827; }
.db {
    flex-shrink: 0; width: 34px; height: 34px; border-radius: 9px;
    background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.18);
    color: var(--red); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, transform 0.15s;
}
.db:hover { background: rgba(248,113,113,0.2); transform: scale(1.06); }
.db:active { transform: scale(0.96); }

#toast {
    position: fixed; bottom: 28px; right: 28px;
    padding: 13px 20px; border-radius: 13px;
    font-size: 13.5px; font-weight: 500;
    border: 1px solid; z-index: 9999;
    opacity: 0; pointer-events: none;
    transform: translateY(24px) scale(0.97);
    transition: opacity 0.25s, transform 0.28s cubic-bezier(0.22,1,0.36,1);
    will-change: transform, opacity;
    display: flex; align-items: center; gap: 9px;
    white-space: nowrap;
}
#toast.show { opacity: 1; transform: none; }
#toast.ok  { background: rgba(52,211,153,0.13); border-color: rgba(52,211,153,0.25); color: var(--green); }
#toast.err { background: rgba(248,113,113,0.13); border-color: rgba(248,113,113,0.25); color: var(--red); }

.flash { animation: rowFlash 0.55s ease; }
@keyframes rowFlash { 0%{background:rgba(79,140,255,.1)} 100%{background:transparent} }
.removing { transition: opacity 0.3s, transform 0.3s; opacity: 0; transform: translateX(20px); }

.empty { text-align: center; padding: 56px 20px; color: var(--text2); }
.empty .ei { font-size: 44px; margin-bottom: 14px; }
.empty h3 { font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 5px; }

::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

@media (max-width: 880px) {
    .main { padding: 20px 14px; }
    .header { padding: 14px 18px; }
    .grid { grid-template-columns: repeat(2, 1fr); }
    table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
}

#app { isolation: isolate; }
</style>
</head>
<body>
<div id="app">

<header class="header">
    <div class="logo">
        <div class="lm">AX</div>
        <div class="lt">Approval<span>X</span></div>
    </div>
    <div class="hr">
        <span class="pill live">Live Dashboard</span>
        <a href="/auth/logout" class="pill">🚪 Logout</a>
    </div>
</header>

<main class="main">
    <div class="ptitle">Request Dashboard</div>
    <div class="psub">Monitor, manage, and update all client service requests.</div>

    <div class="grid">
        <div class="sc total"><div class="si">📋</div><div class="sn">${totalRequests}</div><div class="sl">Total</div></div>
        <div class="sc pend"> <div class="si">⏳</div><div class="sn">${pending}</div>   <div class="sl">Pending</div></div>
        <div class="sc proc"> <div class="si">⚙️</div><div class="sn">${processing}</div><div class="sl">Processing</div></div>
        <div class="sc appr"> <div class="si">✅</div><div class="sn">${approved}</div>  <div class="sl">Approved</div></div>
        <div class="sc rej">  <div class="si">❌</div><div class="sn">${rejected}</div>  <div class="sl">Rejected</div></div>
    </div>

    <div class="tb">
        <div class="sw">
            <svg class="si2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" class="si-input" id="searchInput" placeholder="Search by name, phone, service…">
        </div>
        <div class="rc" id="rc">${totalRequests} request${totalRequests !== 1 ? 's' : ''} total</div>
    </div>

    <div class="tw">
        ${totalRequests === 0 ? `
        <div class="empty">
            <div class="ei">📭</div>
            <h3>No requests yet</h3>
            <p>New requests submitted via the app will appear here.</p>
        </div>` : `
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Service &amp; Location</th>
                    <th>Status / Actions</th>
                </tr>
            </thead>
            <tbody id="tbody">
                ${rowsHtml}
            </tbody>
        </table>`}
    </div>
</main>
</div>

<div id="toast"></div>

<script>
const toastEl   = document.getElementById('toast');
const rcEl      = document.getElementById('rc');
const searchEl  = document.getElementById('searchInput');

const rows      = Array.from(document.getElementsByClassName('row'));
const rowCache  = rows.map(r => ({
    el:   r,
    text: r.dataset.search.toUpperCase()
}));

let filterTimer;
searchEl && searchEl.addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(filterTable, 60);
});

function filterTable() {
    const q = searchEl.value.toUpperCase();
    let visible = 0;
    for (let i = 0; i < rowCache.length; i++) {
        const hit = !q || rowCache[i].text.includes(q);
        rowCache[i].el.style.display = hit ? '' : 'none';
        if (hit) visible++;
    }
    if (rcEl) rcEl.textContent = visible + ' result' + (visible !== 1 ? 's' : '');
}

let toastTimer;
function showToast(msg, type = 'ok') {
    clearTimeout(toastTimer);
    toastEl.textContent = (type === 'ok' ? '✅  ' : '❌  ') + msg;
    toastEl.className = type;
    requestAnimationFrame(() => requestAnimationFrame(() => toastEl.classList.add('show')));
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

const badgeMap = {
    'Pending':    '<span class="badge bp">⏳ Pending</span>',
    'Processing': '<span class="badge bc">⚙️ Processing</span>',
    'Approved':   '<span class="badge ba">✅ Approved</span>',
    'Rejected':   '<span class="badge br">❌ Rejected</span>',
};

function updateStatus(id, sel) {
    const newStatus = sel.value;
    fetch('/api/requests/' + id + '/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            const row    = sel.closest('tr');
            const badgeEl = row.querySelector('.badge');
            if (badgeEl) {
                const tmp = document.createElement('span');
                tmp.innerHTML = badgeMap[newStatus] || badgeMap.Pending;
                badgeEl.replaceWith(tmp.firstChild);
            }
            row.classList.remove('flash');
            requestAnimationFrame(() => row.classList.add('flash'));
            showToast('Status → ' + newStatus);
        } else {
            if (data.error === 'Unauthorized') location.href = '/login';
            else showToast('Failed to update', 'err');
        }
    })
    .catch(() => showToast('Network error', 'err'));
}

function deleteReq(id, btn) {
    if (!confirm('Delete this request permanently?')) return;
    fetch('/api/requests/' + id, { method: 'DELETE' })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            const row = btn.closest('tr');
            row.classList.add('removing');
            const idx = rowCache.findIndex(rc => rc.el === row);
            if (idx > -1) rowCache.splice(idx, 1);
            setTimeout(() => {
                row.remove();
                updateCount();
                showToast('Request deleted');
            }, 300);
        } else {
            if (data.error === 'Unauthorized') location.href = '/login';
            else showToast('Failed to delete', 'err');
        }
    })
    .catch(() => showToast('Network error', 'err'));
}

function updateCount() {
    const vis = rowCache.filter(r => r.el.style.display !== 'none').length;
    if (rcEl) rcEl.textContent = vis + ' result' + (vis !== 1 ? 's' : '');
}
</script>
</body>
</html>`;

        res.send(html);
    } catch (err) {
        res.status(500).send("Error loading dashboard data.");
    }
});

// Redirect root
app.get('/', (req, res) => res.redirect('/admin'));

// ==========================================
// 7. VERCEL DEPLOYMENT LOGIC
// ==========================================
if (process.env.VERCEL) {
    module.exports = app;
} else {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on all interfaces at port ${PORT}`);
    });
}
