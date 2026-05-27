const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// NEW: Import Firebase Admin for Push Notifications
const admin = require('firebase-admin');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// 0. FIREBASE ADMIN SETUP
// ==========================================
// Initializes Firebase securely using Vercel Environment Variables
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // The .replace() is crucial because Vercel sometimes escapes the \n in private keys
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

// ==========================================
// 1. DATABASE CONNECTION
// ==========================================
const dbURI = process.env.MONGODB_URI || 'mongodb+srv://approval_db_user:Approval@cluster0.wn4xkbz.mongodb.net/?appName=Cluster0'; 
mongoose.connect(dbURI, { family: 4 })
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
    fcmToken: String, // NEW: Stores the user's unique phone notification address
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});

const Request = mongoose.model('Request', requestSchema);

// ==========================================
// 2. ANDROID APP APIs
// ==========================================

// Create a new request
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

// Fetch requests for a specific user
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
// 3. ADMIN DASHBOARD APIs
// ==========================================

// UPGRADED: Update Status AND Send Push Notification
app.post('/api/requests/:id/status', async (req, res) => {
    try {
        // Find the request and update it, returning the newly updated document
        const updatedRequest = await Request.findByIdAndUpdate(
            req.params.id, 
            { status: req.body.status },
            { new: true }
        );

        // If we successfully updated it AND the user has an fcmToken on file, send the notification!
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

// Delete a request
app.delete('/api/requests/:id', async (req, res) => {
    try {
        await Request.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Request deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete request" });
    }
});

// ==========================================
// 4. WEB UI: SUPERCHARGED ADMIN PANEL
// ==========================================
app.get('/admin', async (req, res) => {
    try {
        const requests = await Request.find().sort({ createdAt: -1 });
        
        let html = `
            <div style="font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px;">
                
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h1 style="color: #163CA8;">ApprovalX Admin Panel</h1>
                    <input type="text" id="searchInput" onkeyup="filterTable()" placeholder="Search by name, phone, or service..." 
                           style="padding: 10px; width: 300px; border-radius: 8px; border: 1px solid #ccc; font-size: 14px;">
                </div>

                <table id="requestsTable" style="width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); background: white;">
                    <tr style="background-color: #f8f9fa; text-align: left;">
                        <th style="padding: 15px; border-bottom: 2px solid #ddd;">Date</th>
                        <th style="padding: 15px; border-bottom: 2px solid #ddd;">Client Info</th>
                        <th style="padding: 15px; border-bottom: 2px solid #ddd;">Service Details</th>
                        <th style="padding: 15px; border-bottom: 2px solid #ddd;">Status / Actions</th>
                    </tr>
        `;

        requests.forEach(r => {
            const date = new Date(r.createdAt).toLocaleDateString();
            
            html += `
                <tr style="border-bottom: 1px solid #eee;" class="request-row">
                    <td style="padding: 15px;">${date}</td>
                    <td style="padding: 15px;" class="searchable">
                        <strong>${r.name}</strong><br>
                        <span style="color: #666;">📞 ${r.phone}</span>
                    </td>
                    <td style="padding: 15px;" class="searchable">
                        <strong>${r.service}</strong><br>
                        <small style="color: #666;">Type: ${r.propertyType}</small><br>
                        <small style="color: #444;">📍 ${r.address || ''}, ${r.city || ''}, ${r.state || ''}</small><br>
                        <small style="color: #888; font-style: italic;">Notes: ${r.description || 'None'}</small>
                    </td>
                    <td style="padding: 15px;">
                        <select onchange="updateStatus('${r._id}', this.value)" style="padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-weight: bold; margin-bottom: 8px; width: 100%;">
                            <option value="Pending" ${r.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                            <option value="Processing" ${r.status === 'Processing' ? 'selected' : ''}>⚙️ Processing</option>
                            <option value="Approved" ${r.status === 'Approved' ? 'selected' : ''}>✅ Approved</option>
                            <option value="Rejected" ${r.status === 'Rejected' ? 'selected' : ''}>❌ Rejected</option>
                        </select>
                        <br>
                        <button onclick="deleteReq('${r._id}')" style="width: 100%; padding: 8px; background-color: #FEE2E2; color: #DC2626; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                            🗑️ Delete
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                </table>
            </div>

            <script>
                // Function 1: Update Status
                function updateStatus(id, newStatus) {
                    fetch('/api/requests/' + id + '/status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    }).then(res => res.json()).then(data => {
                        if(data.success) {
                            console.log('Status updated to ' + newStatus);
                        }
                    });
                }

                // Function 2: Delete Request
                function deleteReq(id) {
                    if(confirm("Are you sure you want to delete this request permanently?")) {
                        fetch('/api/requests/' + id, { method: 'DELETE' })
                        .then(res => res.json())
                        .then(data => {
                            if(data.success) {
                                location.reload(); // Refresh the page to remove the row
                            }
                        });
                    }
                }

                // Function 3: Live Search Filter
                function filterTable() {
                    let input = document.getElementById("searchInput").value.toUpperCase();
                    let table = document.getElementById("requestsTable");
                    let tr = table.getElementsByClassName("request-row");

                    for (let i = 0; i < tr.length; i++) {
                        let textToSearch = tr[i].getElementsByClassName("searchable")[0].innerText + " " + tr[i].getElementsByClassName("searchable")[1].innerText;
                        if (textToSearch.toUpperCase().indexOf(input) > -1) {
                            tr[i].style.display = "";
                        } else {
                            tr[i].style.display = "none";
                        }
                    }
                }
            </script>
        `;
        res.send(html);
    } catch (err) {
        res.status(500).send("Error loading dashboard data.");
    }
});

app.get('/', (req, res) => res.redirect('/admin'));

// ==========================================
// 5. VERCEL DEPLOYMENT LOGIC
// ==========================================
if (process.env.VERCEL) {
    module.exports = app;
} else {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on all interfaces at port ${PORT}`);
    });
}
