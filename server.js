const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // NEW: Replaces express-basic-auth

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// ==========================================
// 1. CUSTOM COOKIE AUTH MIDDLEWARE
// ==========================================
const adminUsername = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASS || 'supersecret123';

// We create a simple token by encoding the credentials
const expectedToken = Buffer.from(`${adminUsername}:${adminPassword}`).toString('base64');

const requireAuth = (req, res, next) => {
    const { auth_token } = req.cookies;
    
    if (auth_token === expectedToken) {
        return next(); // Authenticated! Let them through.
    }
    
    // If an API route fails auth, return JSON. Otherwise, redirect to the new UI.
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
        await Request.findByIdAndUpdate(req.params.id, { status: req.body.status });
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

// Handle Login Submission
app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === adminUsername && password === adminPassword) {
        // Set an HTTP-Only cookie that expires in 24 hours
        res.cookie('auth_token', expectedToken, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Handle Logout
app.get('/auth/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.redirect('/login');
});

// Serve the Beautiful Login Page
app.get('/login', (req, res) => {
    // If already logged in, skip the login page
    if (req.cookies.auth_token === expectedToken) {
        return res.redirect('/admin');
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Login — ApprovalX</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"/>
<style>
    :root {
        --bg-dark: #06080f; --glass: rgba(255,255,255,0.04); --glass-border: rgba(255,255,255,0.09);
        --accent: #4f8cff; --accent2: #a78bfa; --text-primary: #f0f4ff; --text-muted: #4a5a78;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        height: 100vh; background: var(--bg-dark); color: var(--text-primary);
        font-family: 'DM Sans', sans-serif; display: flex; align-items: center; justify-content: center;
    }
    body::before {
        content: ''; position: fixed; inset: 0; pointer-events: none;
        background: radial-gradient(ellipse 80% 60% at 20% 10%, rgba(79,140,255,0.12) 0%, transparent 60%),
                    radial-gradient(ellipse 60% 50% at 80% 80%, rgba(167,139,250,0.10) 0%, transparent 60%);
    }
    .login-card {
        background: rgba(13,18,33,0.7); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
        border: 1px solid var(--glass-border); border-radius: 24px; padding: 48px 40px;
        width: 100%; max-width: 400px; box-shadow: 0 24px 80px rgba(0,0,0,0.5); position: relative; z-index: 1;
        animation: fadeSlideUp 0.6s ease both; text-align: center;
    }
    .logo-mark {
        width: 54px; height: 54px; background: linear-gradient(135deg, var(--accent), var(--accent2));
        border-radius: 14px; display: flex; align-items: center; justify-content: center;
        font-family: 'Syne', sans-serif; font-weight: 800; font-size: 22px; color: #fff;
        margin: 0 auto 16px; box-shadow: 0 0 24px rgba(79,140,255,0.4);
    }
    h1 { font-family: 'Syne', sans-serif; font-size: 24px; margin-bottom: 8px; }
    p { color: var(--text-muted); font-size: 14px; margin-bottom: 32px; }
    .input-group { margin-bottom: 16px; text-align: left; }
    label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; font-weight: 500; letter-spacing: 1px; }
    input {
        width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border);
        border-radius: 12px; color: var(--text-primary); font-family: 'DM Sans', sans-serif; font-size: 14px;
        outline: none; transition: all 0.2s;
    }
    input:focus { border-color: var(--accent); background: rgba(255,255,255,0.06); }
    button {
        width: 100%; padding: 14px; margin-top: 16px; border: none; border-radius: 12px;
        background: linear-gradient(90deg, var(--accent), var(--accent2)); color: #fff;
        font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(79,140,255,0.3); }
    .error { color: #f87171; font-size: 13px; margin-top: 16px; display: none; }
    @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
</style>
</head>
<body>
    <div class="login-card">
        <div class="logo-mark">AX</div>
        <h1>ApprovalX Admin</h1>
        <p>Sign in to manage client requests.</p>
        
        <div class="input-group">
            <label>Username</label>
            <input type="text" id="user" autocomplete="off" />
        </div>
        <div class="input-group">
            <label>Password</label>
            <input type="password" id="pass" />
        </div>
        
        <div class="error" id="errorMsg">Invalid credentials</div>
        <button onclick="login()">Access Dashboard</button>
    </div>

    <script>
        function login() {
            const u = document.getElementById('user').value;
            const p = document.getElementById('pass').value;
            fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: u, password: p })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    window.location.href = '/admin';
                } else {
                    document.getElementById('errorMsg').style.display = 'block';
                }
            });
        }
        
        // Allow pressing Enter to submit
        document.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') login();
        });
    </script>
</body>
</html>`;
    res.send(html);
});

// ==========================================
// 6. WEB UI: SUPERCHARGED ADMIN PANEL (PROTECTED)
// ==========================================
app.get('/admin', requireAuth, async (req, res) => {
    try {
        const requests = await Request.find().sort({ createdAt: -1 });

        const totalRequests = requests.length;
        const pending = requests.filter(r => r.status === 'Pending').length;
        const approved = requests.filter(r => r.status === 'Approved').length;
        const processing = requests.filter(r => r.status === 'Processing').length;
        const rejected = requests.filter(r => r.status === 'Rejected').length;

        const statusBadge = (status) => {
            const map = {
                'Pending':    { icon: '⏳', cls: 'badge-pending' },
                'Processing': { icon: '⚙️', cls: 'badge-processing' },
                'Approved':   { icon: '✅', cls: 'badge-approved' },
                'Rejected':   { icon: '❌', cls: 'badge-rejected' },
            };
            const s = map[status] || { icon: '•', cls: 'badge-pending' };
            return `<span class="badge ${s.cls}">${s.icon} ${status}</span>`;
        };

        let rowsHtml = '';
        requests.forEach((r, i) => {
            const date = new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            rowsHtml += `
            <tr class="request-row" style="animation-delay:${i * 40}ms">
                <td>
                    <span class="date-chip">${date}</span>
                </td>
                <td class="searchable">
                    <div class="client-cell">
                        <div class="avatar">${(r.name || '?')[0].toUpperCase()}</div>
                        <div>
                            <div class="client-name">${r.name || '—'}</div>
                            <div class="client-phone">📞 ${r.phone || '—'}</div>
                        </div>
                    </div>
                </td>
                <td class="searchable">
                    <div class="service-label">${r.service || '—'}</div>
                    <div class="service-meta">🏠 ${r.propertyType || '—'}</div>
                    <div class="service-meta">📍 ${[r.address, r.city, r.state].filter(Boolean).join(', ') || '—'}</div>
                    <div class="service-notes">${r.description || ''}</div>
                </td>
                <td>
                    ${statusBadge(r.status)}
                    <div class="action-row">
                        <select onchange="updateStatus('${r._id}', this.value)" class="status-select" data-current="${r.status}">
                            <option value="Pending"    ${r.status === 'Pending'    ? 'selected' : ''}>⏳ Pending</option>
                            <option value="Processing" ${r.status === 'Processing' ? 'selected' : ''}>⚙️ Processing</option>
                            <option value="Approved"   ${r.status === 'Approved'   ? 'selected' : ''}>✅ Approved</option>
                            <option value="Rejected"   ${r.status === 'Rejected'   ? 'selected' : ''}>❌ Rejected</option>
                        </select>
                        <button onclick="deleteReq('${r._id}', this)" class="delete-btn" title="Delete">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
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
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap" rel="stylesheet"/>
<style>
    /* ... YOUR EXISTING CSS (UNCHANGED) ... */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
        --bg-dark: #06080f; --bg-mid: #0d1221; --glass: rgba(255,255,255,0.04); --glass-border: rgba(255,255,255,0.09);
        --glass-hover: rgba(255,255,255,0.08); --accent: #4f8cff; --accent2: #a78bfa; --accent-glow: rgba(79,140,255,0.35);
        --green: #34d399; --yellow: #fbbf24; --red: #f87171; --purple: #a78bfa;
        --text-primary: #f0f4ff; --text-secondary: #8898b8; --text-muted: #4a5a78;
        --radius-card: 20px; --radius-sm: 10px;
    }
    html, body { height: 100%; background: var(--bg-dark); color: var(--text-primary); font-family: 'DM Sans', sans-serif; font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
    body::before { content: ''; position: fixed; inset: 0; background: radial-gradient(ellipse 80% 60% at 20% 10%, rgba(79,140,255,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 80%, rgba(167,139,250,0.10) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 60% 40%, rgba(52,211,153,0.06) 0%, transparent 55%); z-index: 0; pointer-events: none; }
    body::after { content: ''; position: fixed; inset: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E"); z-index: 0; pointer-events: none; opacity: 0.6; }
    #app { position: relative; z-index: 1; min-height: 100vh; }
    .header { display: flex; align-items: center; justify-content: space-between; padding: 22px 40px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); background: rgba(13,18,33,0.6); border-bottom: 1px solid var(--glass-border); position: sticky; top: 0; z-index: 100; }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-mark { width: 38px; height: 38px; background: linear-gradient(135deg, var(--accent), var(--accent2)); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 16px; color: #fff; box-shadow: 0 0 20px var(--accent-glow); letter-spacing: -0.5px; }
    .logo-text { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 18px; color: var(--text-primary); letter-spacing: -0.3px; }
    .logo-text span { color: var(--accent); }
    .header-right { display: flex; align-items: center; gap: 16px; }
    .live-dot { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text-secondary); background: var(--glass); border: 1px solid var(--glass-border); padding: 6px 14px; border-radius: 100px; backdrop-filter: blur(10px); }
    .live-dot::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 6px var(--green); animation: pulse-dot 2s infinite; flex-shrink: 0; }
    @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }
    .admin-badge { font-size: 12px; color: var(--text-secondary); background: var(--glass); border: 1px solid var(--glass-border); padding: 6px 14px; border-radius: 100px; text-decoration: none; transition: background 0.2s; display: inline-block; cursor: pointer; }
    .admin-badge:hover { background: rgba(248,113,113,0.15); color: #f87171; border-color: rgba(248,113,113,0.3); } /* Logout Hover */
    .main { padding: 36px 40px; max-width: 1400px; margin: 0 auto; }
    .page-title { font-family: 'Syne', sans-serif; font-size: 28px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.5px; margin-bottom: 4px; }
    .page-subtitle { color: var(--text-secondary); font-size: 14px; margin-bottom: 32px; }
    .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 32px; }
    .stat-card { background: var(--glass); border: 1px solid var(--glass-border); border-radius: var(--radius-card); padding: 22px 20px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); transition: all 0.3s ease; position: relative; overflow: hidden; animation: fadeSlideUp 0.5s ease both; }
    .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; border-radius: 2px; opacity: 0.8; }
    .stat-card.total::before { background: linear-gradient(90deg, var(--accent), var(--accent2)); }
    .stat-card.pending::before { background: var(--yellow); }
    .stat-card.proc::before { background: var(--accent); }
    .stat-card.approved::before { background: var(--green); }
    .stat-card.rejected::before { background: var(--red); }
    .stat-card:hover { background: var(--glass-hover); transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
    .stat-icon { font-size: 22px; margin-bottom: 10px; }
    .stat-number { font-family: 'Syne', sans-serif; font-size: 32px; font-weight: 800; letter-spacing: -1px; color: var(--text-primary); line-height: 1; }
    .stat-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 500; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; gap: 16px; flex-wrap: wrap; }
    .search-wrap { position: relative; flex: 1; max-width: 360px; }
    .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
    .search-input { width: 100%; padding: 11px 16px 11px 42px; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 12px; color: var(--text-primary); font-family: 'DM Sans', sans-serif; font-size: 14px; backdrop-filter: blur(12px); outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
    .search-input::placeholder { color: var(--text-muted); }
    .search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,140,255,0.15); }
    .result-count { font-size: 13px; color: var(--text-secondary); background: var(--glass); border: 1px solid var(--glass-border); padding: 10px 18px; border-radius: 12px; backdrop-filter: blur(12px); white-space: nowrap; }
    .table-wrap { background: var(--glass); border: 1px solid var(--glass-border); border-radius: var(--radius-card); overflow: hidden; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 24px 80px rgba(0,0,0,0.4); }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--glass-border); }
    th { padding: 14px 20px; text-align: left; font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-muted); }
    .request-row { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.2s; animation: fadeSlideUp 0.4s ease both; }
    .request-row:last-child { border-bottom: none; }
    .request-row:hover { background: rgba(255,255,255,0.03); }
    td { padding: 16px 20px; vertical-align: middle; }
    .date-chip { font-size: 12px; color: var(--text-secondary); background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 100px; white-space: nowrap; }
    .client-cell { display: flex; align-items: center; gap: 12px; }
    .avatar { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; color: #fff; flex-shrink: 0; box-shadow: 0 4px 12px rgba(79,140,255,0.3); }
    .client-name { font-weight: 500; color: var(--text-primary); font-size: 14px; }
    .client-phone { font-size: 12px; color: var(--text-secondary); margin-top: 1px; }
    .service-label { font-weight: 500; color: var(--text-primary); font-size: 14px; margin-bottom: 3px; }
    .service-meta { font-size: 12px; color: var(--text-secondary); margin-top: 1px; }
    .service-notes { font-size: 11px; color: var(--text-muted); font-style: italic; margin-top: 3px; }
    .badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 500; margin-bottom: 10px; border: 1px solid; }
    .badge-pending { background: rgba(251,191,36,0.12); color: #fbbf24; border-color: rgba(251,191,36,0.25); }
    .badge-processing { background: rgba(79,140,255,0.12); color: #60a5fa; border-color: rgba(79,140,255,0.25); }
    .badge-approved { background: rgba(52,211,153,0.12); color: #34d399; border-color: rgba(52,211,153,0.25); }
    .badge-rejected { background: rgba(248,113,113,0.12); color: #f87171; border-color: rgba(248,113,113,0.25); }
    .action-row { display: flex; align-items: center; gap: 8px; }
    .status-select { flex: 1; padding: 8px 12px; background: rgba(255,255,255,0.06); border: 1px solid var(--glass-border); border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s; appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238898b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; }
    .status-select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,140,255,0.15); }
    .status-select option { background: #1a2035; }
    .delete-btn { flex-shrink: 0; width: 36px; height: 36px; border-radius: 10px; background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.2); color: var(--red); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; }
    .delete-btn:hover { background: rgba(248,113,113,0.25); border-color: rgba(248,113,113,0.4); transform: scale(1.05); }
    #toast { position: fixed; bottom: 30px; right: 30px; padding: 14px 22px; border-radius: 14px; font-size: 14px; font-weight: 500; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid; z-index: 9999; transform: translateY(80px); opacity: 0; transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); pointer-events: none; display: flex; align-items: center; gap: 10px; }
    #toast.show { transform: translateY(0); opacity: 1; }
    #toast.success { background: rgba(52,211,153,0.15); border-color: rgba(52,211,153,0.3); color: var(--green); }
    #toast.error { background: rgba(248,113,113,0.15); border-color: rgba(248,113,113,0.3); color: var(--red); }
    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-secondary); }
    .empty-state .empty-icon { font-size: 48px; margin-bottom: 16px; filter: grayscale(0.5); }
    .empty-state h3 { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
    .row-flash { animation: rowFlash 0.6s ease; }
    @keyframes rowFlash { 0% { background: rgba(79,140,255,0.12); } 100% { background: transparent; } }
    .row-deleting { animation: rowDelete 0.4s ease forwards; }
    @keyframes rowDelete { to { opacity: 0; transform: translateX(30px); max-height: 0; } }
    @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    .stats-grid .stat-card:nth-child(1) { animation-delay: 0ms; }
    .stats-grid .stat-card:nth-child(2) { animation-delay: 60ms; }
    .stats-grid .stat-card:nth-child(3) { animation-delay: 120ms; }
    .stats-grid .stat-card:nth-child(4) { animation-delay: 180ms; }
    .stats-grid .stat-card:nth-child(5) { animation-delay: 240ms; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
    @media (max-width: 900px) { .main { padding: 24px 16px; } .header { padding: 16px 20px; } .stats-grid { grid-template-columns: repeat(2, 1fr); } table { display: block; overflow-x: auto; } }
</style>
</head>
<body>
<div id="app">

    <header class="header">
        <div class="logo">
            <div class="logo-mark">AX</div>
            <div class="logo-text">Approval<span>X</span></div>
        </div>
        <div class="header-right">
            <div class="live-dot">Live Dashboard</div>
            <a href="/auth/logout" class="admin-badge">🚪 Logout</a>
        </div>
    </header>

    <main class="main">
        <div class="page-title">Request Dashboard</div>
        <div class="page-subtitle">Monitor, manage, and update all client service requests.</div>

        <div class="stats-grid">
            <div class="stat-card total">
                <div class="stat-icon">📋</div>
                <div class="stat-number">${totalRequests}</div>
                <div class="stat-label">Total Requests</div>
            </div>
            <div class="stat-card pending">
                <div class="stat-icon">⏳</div>
                <div class="stat-number">${pending}</div>
                <div class="stat-label">Pending</div>
            </div>
            <div class="stat-card proc">
                <div class="stat-icon">⚙️</div>
                <div class="stat-number">${processing}</div>
                <div class="stat-label">Processing</div>
            </div>
            <div class="stat-card approved">
                <div class="stat-icon">✅</div>
                <div class="stat-number">${approved}</div>
                <div class="stat-label">Approved</div>
            </div>
            <div class="stat-card rejected">
                <div class="stat-icon">❌</div>
                <div class="stat-number">${rejected}</div>
                <div class="stat-label">Rejected</div>
            </div>
        </div>

        <div class="toolbar">
            <div class="search-wrap">
                <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" class="search-input" id="searchInput" onkeyup="filterTable()" placeholder="Search by name, phone, service…">
            </div>
            <div class="result-count" id="resultCount">${totalRequests} request${totalRequests !== 1 ? 's' : ''} total</div>
        </div>

        <div class="table-wrap">
            ${totalRequests === 0 ? `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No requests yet</h3>
                <p>New requests submitted via the app will appear here.</p>
            </div>` : `
            <table id="requestsTable">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Client</th>
                        <th>Service &amp; Location</th>
                        <th>Status / Actions</th>
                    </tr>
                </thead>
                <tbody id="tableBody">
                    ${rowsHtml}
                </tbody>
            </table>`}
        </div>
    </main>

</div>

<div id="toast"></div>

<script>
    // ── Toast helper ──
    function showToast(msg, type = 'success') {
        const t = document.getElementById('toast');
        t.className = type;
        t.innerHTML = (type === 'success' ? '✅ ' : '❌ ') + msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }

    // ── Update Status ── (original logic preserved)
    function updateStatus(id, newStatus) {
        fetch('/api/requests/' + id + '/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Update badge in the same row
                const select = document.querySelector('select[onchange*="' + id + '"]');
                if (select) {
                    const row = select.closest('tr');
                    const badgeMap = {
                        'Pending':    '<span class="badge badge-pending">⏳ Pending</span>',
                        'Processing': '<span class="badge badge-processing">⚙️ Processing</span>',
                        'Approved':   '<span class="badge badge-approved">✅ Approved</span>',
                        'Rejected':   '<span class="badge badge-rejected">❌ Rejected</span>',
                    };
                    const badgeEl = row.querySelector('.badge');
                    if (badgeEl) badgeEl.outerHTML = badgeMap[newStatus] || '';
                    row.classList.remove('row-flash');
                    void row.offsetWidth; // reflow for re-trigger
                    row.classList.add('row-flash');
                }
                showToast('Status updated to ' + newStatus);
            } else {
                // If token expired, redirect to login
                if(data.error === 'Unauthorized') window.location.href = '/login';
                else showToast('Failed to update status', 'error');
            }
        })
        .catch(() => showToast('Network error', 'error'));
    }

    // ── Delete Request ── (original logic preserved)
    function deleteReq(id, btn) {
        if (confirm('Delete this request permanently?')) {
            fetch('/api/requests/' + id, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const row = btn.closest('tr');
                    row.classList.add('row-deleting');
                    setTimeout(() => {
                        row.remove();
                        updateCountDisplay();
                        showToast('Request deleted successfully');
                    }, 400);
                } else {
                    if(data.error === 'Unauthorized') window.location.href = '/login';
                    else showToast('Failed to delete', 'error');
                }
            })
            .catch(() => showToast('Network error', 'error'));
        }
    }

    // ── Live Search Filter ── (original logic preserved + count update)
    function filterTable() {
        let input = document.getElementById('searchInput').value.toUpperCase();
        let tr = document.getElementsByClassName('request-row');
        let visible = 0;

        for (let i = 0; i < tr.length; i++) {
            let cells = tr[i].getElementsByClassName('searchable');
            let text = Array.from(cells).map(c => c.innerText).join(' ');
            if (text.toUpperCase().indexOf(input) > -1) {
                tr[i].style.display = '';
                visible++;
            } else {
                tr[i].style.display = 'none';
            }
        }
        document.getElementById('resultCount').textContent = visible + ' result' + (visible !== 1 ? 's' : '');
    }

    function updateCountDisplay() {
        const rows = document.querySelectorAll('.request-row:not([style*="display: none"])');
        const rc = document.getElementById('resultCount');
        if (rc) rc.textContent = rows.length + ' result' + (rows.length !== 1 ? 's' : '');
    }
</script>
</body>
</html>`;

        res.send(html);
    } catch (err) {
        res.status(500).send("Error loading dashboard data.");
    }
});

// Redirect root to admin (which redirects to login if needed)
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
