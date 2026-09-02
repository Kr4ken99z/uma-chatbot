const express = require('express');
const { verifyToken } = require('../services/authService');
const Conversation = require('../models/Conversation');
const { connectDB } = require('../utils/db');

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
        await connectDB();
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
        const conversations = await Conversation.find({ userId: req.user.id })
            .sort({ updatedAt: -1 })
            .lean();

        // Format for frontend
        const formatted = conversations.map(c => ({
            id: c.clientChatId,
            title: c.title,
            messages: c.messages || [],
            updatedAt: new Date(c.updatedAt).getTime(),
        }));

        return res.json({
            ok: true,
            conversations: formatted,
        });
    } catch (error) {
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

        const validMessages = Array.isArray(messages)
            ? messages.map(m => ({
                  role: m.role === 'user' ? 'user' : 'bot',
                  text: String(m.text || ''),
                  createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
              }))
            : [];

        const updated = await Conversation.findOneAndUpdate(
            { userId: req.user.id, clientChatId: String(id) },
            {
                userId: req.user.id,
                clientChatId: String(id),
                title: String(title || 'New chat').trim(),
                messages: validMessages,
                updatedAt: new Date(),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.json({
            ok: true,
            conversation: {
                id: updated.clientChatId,
                title: updated.title,
                messages: updated.messages,
                updatedAt: new Date(updated.updatedAt).getTime(),
            },
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: 'Failed to save conversation to database.',
        });
    }
});

// DELETE /api/conversations/:id — Delete a single conversation
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Conversation.findOneAndDelete({ userId: req.user.id, clientChatId: id });
        return res.json({ ok: true, message: 'Conversation deleted.' });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'Failed to delete conversation.' });
    }
});

// DELETE /api/conversations — Delete all conversations for current user
router.delete('/', async (req, res) => {
    try {
        await Conversation.deleteMany({ userId: req.user.id });
        return res.json({ ok: true, message: 'All conversations deleted.' });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'Failed to clear conversations.' });
    }
});

module.exports = router;
