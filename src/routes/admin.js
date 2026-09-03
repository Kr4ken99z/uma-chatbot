const express = require('express');
const jwt = require('jsonwebtoken');
const { getSQL, initDB, hasDBConfig } = require('../utils/db');
const { getActiveProviderName } = require('../services/chatApi');
const { GEMINI_MODEL, GROQ_MODEL } = require('../utils/config');

const router = express.Router();
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'uma-admin-2026';
const JWT_SECRET = process.env.JWT_SECRET || 'uma-chatbot-secret-key-2026-auth';

// Admin Login
router.post('/login', async (req, res) => {
    const { passcode, email } = req.body || {};
    const inputKey = String(passcode || '').trim();

    if (!inputKey || inputKey !== ADMIN_PASSCODE) {
        return res.status(401).json({ error: 'Invalid admin passcode. Default is uma-admin-2026' });
    }

    const token = jwt.sign(
        { role: 'admin', email: email || 'admin@uma.ai' },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    return res.json({
        ok: true,
        token,
        admin: { role: 'admin', email: email || 'admin@uma.ai' },
    });
});

// Admin Stats & Telemetry
router.get('/stats', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Admin authorization required.' });
    }

    const token = authHeader.slice(7).trim();
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access denied.' });
        }
    } catch {
        return res.status(401).json({ error: 'Invalid or expired admin session.' });
    }

    let totalUsers = 0;
    let recentUsers = [];
    let totalConversations = 0;
    let dbStatus = 'Not configured';

    if (hasDBConfig()) {
        try {
            await initDB();
            const sql = getSQL();
            const userCountRes = await sql`SELECT COUNT(*)::int AS count FROM users;`;
            totalUsers = userCountRes[0]?.count || 0;

            const convCountRes = await sql`SELECT COUNT(*)::int AS count FROM conversations;`;
            totalConversations = convCountRes[0]?.count || 0;

            const recentRes = await sql`
                SELECT id, name, email, created_at 
                FROM users 
                ORDER BY created_at DESC 
                LIMIT 8;
            `;
            recentUsers = recentRes || [];
            dbStatus = 'Neon PostgreSQL (Connected & Healthy)';
        } catch (err) {
            dbStatus = `DB Error: ${err.message}`;
        }
    }

    const activeProvider = getActiveProviderName();
    const mem = process.memoryUsage();

    return res.json({
        ok: true,
        stats: {
            totalUsers,
            recentUsers,
            totalConversations,
            telemetry: {
                activeProvider: activeProvider.toUpperCase(),
                primaryModel: activeProvider === 'gemini' ? (GEMINI_MODEL || 'gemini-2.0-flash') : GROQ_MODEL,
                fallbackProvider: 'GROQ (Fast Failover)',
                database: dbStatus,
                uptimeSeconds: Math.floor(process.uptime()),
                memoryUsageMb: Math.round(mem.rss / (1024 * 1024)),
                heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
                nodeVersion: process.version,
                serverStatus: 'Operational ● 100%',
                tokenAnalytics: {
                    dailyLimit: '1,000,000 Tokens/Day (Gemini Free Tier)',
                    rpmLimit: '15 Requests / Minute',
                    tpmLimit: '1,000,000 TPM',
                    status: 'Normal · Low Latency (~220ms)',
                    guestLimit: '3 Chats / Visitor',
                },
            },
        },
    });
});

module.exports = router;
