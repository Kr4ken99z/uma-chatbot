const express = require('express');
const { verifyToken } = require('../services/authService');
const { getSQL, initDB } = require('../utils/db');

const router = express.Router();

// Helper to extract Bearer token
function getBearerToken(req) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    return null;
}

// Authentication Middleware
async function requireAuth(req, res, next) {
    const token = getBearerToken(req);

    if (!token) {
        return res.status(401).json({
            ok: false,
            error: 'Authentication required. No token provided.',
        });
    }

    try {
        await initDB();
        const user = await verifyToken(token);
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            ok: false,
            error: error.message || 'Invalid or expired session token.',
        });
    }
}

// All conversation routes require authentication
router.use(requireAuth);

// GET /api/conversations — Fetch all conversations for the authenticated user
router.get('/', async (req, res) => {
    try {
        const sql = getSQL();
        const rows = await sql`
            SELECT client_chat_id AS id, title, messages, updated_at
            FROM conversations
            WHERE user_id = ${req.user.id}
            ORDER BY updated_at DESC;
        `;

        const formatted = rows.map(r => ({
            id: r.id,
            title: r.title,
            messages: typeof r.messages === 'string' ? JSON.parse(r.messages) : (r.messages || []),
            updatedAt: new Date(r.updated_at).getTime(),
        }));

        return res.json({
            ok: true,
            conversations: formatted,
        });
    } catch (error) {
        console.error('Fetch conversations error:', error);
        return res.status(500).json({
            ok: false,
            error: 'Failed to fetch conversations from database.',
        });
    }
});

// POST /api/conversations — Create or update a conversation
router.post('/', async (req, res) => {
    try {
        const { id, title, messages } = req.body || {};

        if (!id) {
            return res.status(400).json({
                ok: false,
                error: 'Conversation id is required.',
            });
        }

        const sql = getSQL();
        const validMessages = Array.isArray(messages) ? messages : [];
        const messagesJson = JSON.stringify(validMessages);
        const cleanTitle = String(title || 'New chat').trim();

        const rows = await sql`
            INSERT INTO conversations (user_id, client_chat_id, title, messages, updated_at)
            VALUES (${req.user.id}, ${String(id)}, ${cleanTitle}, ${messagesJson}::jsonb, NOW())
            ON CONFLICT (user_id, client_chat_id)
            DO UPDATE SET 
                title = ${cleanTitle},
                messages = ${messagesJson}::jsonb,
                updated_at = NOW()
            RETURNING client_chat_id AS id, title, messages, updated_at;
        `;

        const updated = rows[0];

        return res.json({
            ok: true,
            conversation: {
                id: updated.id,
                title: updated.title,
                messages: typeof updated.messages === 'string' ? JSON.parse(updated.messages) : (updated.messages || []),
                updatedAt: new Date(updated.updated_at).getTime(),
            },
        });
    } catch (error) {
        console.error('Save conversation error:', error);
        return res.status(500).json({
            ok: false,
            error: 'Failed to save conversation to database.',
        });
    }
});

// DELETE /api/conversations/:id — Delete a single conversation
router.delete('/:id', async (req, res) => {
    try {
        const sql = getSQL();
        await sql`
            DELETE FROM conversations 
            WHERE user_id = ${req.user.id} AND client_chat_id = ${req.params.id};
        `;
        return res.json({ ok: true, message: 'Conversation deleted.' });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'Failed to delete conversation.' });
    }
});

// DELETE /api/conversations — Delete all conversations for current user
router.delete('/', async (req, res) => {
    try {
        const sql = getSQL();
        await sql`
            DELETE FROM conversations 
            WHERE user_id = ${req.user.id};
        `;
        return res.json({ ok: true, message: 'All conversations deleted.' });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'Failed to clear conversations.' });
    }
});

module.exports = router;
