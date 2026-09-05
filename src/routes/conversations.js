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

const crypto = require('crypto');

// Public shared conversation endpoint (unauthenticated)
router.get('/shared/:token', async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!token || token.length < 10) {
            return res.status(400).json({ ok: false, error: 'Invalid share token.' });
        }

        await initDB();
        const sql = getSQL();
        const rows = await sql`
            SELECT COALESCE(client_chat_id, CAST(id AS TEXT)) AS id, title, messages, updated_at, share_token
            FROM conversations
            WHERE share_token = ${token}
            LIMIT 1;
        `;

        if (!rows.length) {
            return res.status(404).json({ ok: false, error: 'Shared conversation not found or expired.' });
        }

        const chat = rows[0];
        const messages = typeof chat.messages === 'string' ? JSON.parse(chat.messages) : (chat.messages || []);
        const conversation = {
            id: chat.id,
            title: chat.title,
            messages,
            updatedAt: new Date(chat.updated_at).getTime(),
            shareToken: chat.share_token,
        };
        return res.json({
            ok: true,
            conversation,
            title: chat.title,
            messages,
            updatedAt: conversation.updatedAt,
        });
    } catch (error) {
        console.error('Fetch shared conversation error:', error.message);
        return res.status(500).json({ ok: false, error: 'Failed to load shared conversation.' });
    }
});

// All routes below require authentication
router.use(requireAuth);

// GET /api/conversations — Fetch all conversations for the authenticated user
router.get('/', async (req, res) => {
    try {
        const sql = getSQL();
        const rows = await sql`
            SELECT 
                client_chat_id AS id, 
                title, 
                messages, 
                is_pinned, 
                is_archived, 
                project_id, 
                share_token, 
                updated_at
            FROM conversations
            WHERE user_id = ${req.user.id}
            ORDER BY is_pinned DESC, updated_at DESC;
        `;

        const formatted = rows.map(r => ({
            id: r.id,
            title: r.title,
            messages: typeof r.messages === 'string' ? JSON.parse(r.messages) : (r.messages || []),
            isPinned: Boolean(r.is_pinned),
            isArchived: Boolean(r.is_archived),
            projectId: r.project_id || null,
            shareToken: r.share_token || null,
            updatedAt: new Date(r.updated_at).getTime(),
        }));

        return res.json({
            ok: true,
            conversations: formatted,
        });
    } catch (error) {
        console.error('Fetch conversations error:', error.message);
        return res.status(500).json({
            ok: false,
            error: 'Failed to fetch conversations from database.',
        });
    }
});

// POST /api/conversations — Create or update a conversation
router.post('/', async (req, res) => {
    try {
        const { id, title, messages, isPinned, isArchived, projectId } = req.body || {};

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
        const pinVal = isPinned !== undefined ? Boolean(isPinned) : false;
        const archiveVal = isArchived !== undefined ? Boolean(isArchived) : false;
        const projectVal = projectId ? parseInt(projectId, 10) : null;

        const rows = await sql`
            INSERT INTO conversations (user_id, client_chat_id, title, messages, is_pinned, is_archived, project_id, updated_at)
            VALUES (${req.user.id}, ${String(id)}, ${cleanTitle}, ${messagesJson}::jsonb, ${pinVal}, ${archiveVal}, ${projectVal}, NOW())
            ON CONFLICT (user_id, client_chat_id)
            DO UPDATE SET 
                title = ${cleanTitle},
                messages = ${messagesJson}::jsonb,
                is_pinned = COALESCE(${isPinned !== undefined ? pinVal : null}, conversations.is_pinned),
                is_archived = COALESCE(${isArchived !== undefined ? archiveVal : null}, conversations.is_archived),
                project_id = COALESCE(${projectVal}, conversations.project_id),
                updated_at = NOW()
            RETURNING client_chat_id AS id, title, messages, is_pinned, is_archived, project_id, share_token, updated_at;
        `;

        const updated = rows[0];

        return res.json({
            ok: true,
            conversation: {
                id: updated.id,
                title: updated.title,
                messages: typeof updated.messages === 'string' ? JSON.parse(updated.messages) : (updated.messages || []),
                isPinned: Boolean(updated.is_pinned),
                isArchived: Boolean(updated.is_archived),
                projectId: updated.project_id || null,
                shareToken: updated.share_token || null,
                updatedAt: new Date(updated.updated_at).getTime(),
            },
        });
    } catch (error) {
        console.error('Save conversation error:', error.message);
        return res.status(500).json({
            ok: false,
            error: 'Failed to save conversation to database.',
        });
    }
});

// PATCH /api/conversations/:id — Partial update (rename, pin/unpin, archive/unarchive, move to project)
router.patch('/:id', async (req, res) => {
    try {
        const chatId = String(req.params.id);
        const { title, isPinned, isArchived, projectId } = req.body || {};

        const sql = getSQL();

        const titleVal = title !== undefined ? String(title).trim() : null;
        const pinVal = isPinned !== undefined ? Boolean(isPinned) : null;
        const archiveVal = isArchived !== undefined ? Boolean(isArchived) : null;
        // projectId can explicitly be null to remove chat from project
        const projectVal = projectId !== undefined ? (projectId ? parseInt(projectId, 10) : null) : undefined;

        let rows;
        if (projectVal !== undefined) {
            rows = await sql`
                UPDATE conversations
                SET 
                    title = COALESCE(${titleVal}, title),
                    is_pinned = COALESCE(${pinVal}, is_pinned),
                    is_archived = COALESCE(${archiveVal}, is_archived),
                    project_id = ${projectVal},
                    updated_at = NOW()
                WHERE user_id = ${req.user.id} AND client_chat_id = ${chatId}
                RETURNING client_chat_id AS id, title, is_pinned, is_archived, project_id, share_token, updated_at;
            `;
        } else {
            rows = await sql`
                UPDATE conversations
                SET 
                    title = COALESCE(${titleVal}, title),
                    is_pinned = COALESCE(${pinVal}, is_pinned),
                    is_archived = COALESCE(${archiveVal}, is_archived),
                    updated_at = NOW()
                WHERE user_id = ${req.user.id} AND client_chat_id = ${chatId}
                RETURNING client_chat_id AS id, title, is_pinned, is_archived, project_id, share_token, updated_at;
            `;
        }

        if (!rows.length) {
            return res.status(404).json({ ok: false, error: 'Conversation not found.' });
        }

        const r = rows[0];
        return res.json({
            ok: true,
            conversation: {
                id: r.id,
                title: r.title,
                isPinned: Boolean(r.is_pinned),
                isArchived: Boolean(r.is_archived),
                projectId: r.project_id || null,
                shareToken: r.share_token || null,
                updatedAt: new Date(r.updated_at).getTime(),
            }
        });
    } catch (error) {
        console.error('Patch conversation error:', error.message);
        return res.status(500).json({ ok: false, error: 'Failed to update conversation.' });
    }
});

// POST /api/conversations/:id/share — Generate or retrieve share token
router.post('/:id/share', async (req, res) => {
    try {
        const chatId = String(req.params.id);
        const sql = getSQL();

        // 1. Check if token already exists
        const existing = await sql`
            SELECT share_token
            FROM conversations
            WHERE user_id = ${req.user.id} AND client_chat_id = ${chatId};
        `;

        if (!existing.length) {
            return res.status(404).json({ ok: false, error: 'Conversation not found.' });
        }

        let token = existing[0].share_token;
        if (!token) {
            token = crypto.randomBytes(16).toString('hex');
            await sql`
                UPDATE conversations
                SET share_token = ${token}
                WHERE user_id = ${req.user.id} AND client_chat_id = ${chatId};
            `;
        }

        const host = req.get('host') || 'uma-chatbot.vercel.app';
        const protocol = req.protocol === 'http' && host.includes('localhost') ? 'http' : 'https';
        const shareUrl = `${protocol}://${host}/?share=${token}`;

        return res.json({
            ok: true,
            shareToken: token,
            shareUrl,
        });
    } catch (error) {
        console.error('Share conversation error:', error.message);
        return res.status(500).json({ ok: false, error: 'Failed to generate share link.' });
    }
});

// DELETE /api/conversations/:id — Delete a single conversation
router.delete('/:id', async (req, res) => {
    try {
        const sql = getSQL();
        const rows = await sql`
            DELETE FROM conversations 
            WHERE user_id = ${req.user.id} AND client_chat_id = ${req.params.id}
            RETURNING client_chat_id AS id;
        `;

        if (!rows.length) {
            return res.status(404).json({ ok: false, error: 'Conversation not found.' });
        }

        return res.json({ ok: true, deletedId: req.params.id, message: 'Conversation deleted.' });
    } catch (error) {
        console.error('Delete conversation error:', error.message);
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
        console.error('Clear conversations error:', error.message);
        return res.status(500).json({ ok: false, error: 'Failed to clear conversations.' });
    }
});

module.exports = router;
