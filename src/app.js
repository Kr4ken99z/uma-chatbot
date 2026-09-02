const express = require('express');
const path = require('path');
require('dotenv').config();

const { sendMessage, streamMessage, getActiveProviderName } = require('./services/chatApi');
const authRouter = require('./routes/auth');
const conversationsRouter = require('./routes/conversations');
const { initDB, checkDB, hasDBConfig } = require('./utils/db');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./services/authService');

const app = express();
const PORT = process.env.PORT || 3002;

// In-memory guest chat limiter (5 messages per guest session/IP)
const guestChatCounts = new Map();
const GUEST_MESSAGE_LIMIT = 5;

function checkGuestLimit(req) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        try {
            jwt.verify(token, JWT_SECRET);
            return { isGuest: false, allowed: true }; // Logged-in: Unlimited
        } catch {
            // Invalid token -> proceed with guest check
        }
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const count = (guestChatCounts.get(ip) || 0) + 1;
    guestChatCounts.set(ip, count);

    if (count > GUEST_MESSAGE_LIMIT) {
        return {
            isGuest: true,
            allowed: false,
            remaining: 0,
            error: 'You have reached the free guest limit (5 chats). Please sign in or create an account to continue unlimited conversations!'
        };
    }

    return { isGuest: true, allowed: true, remaining: GUEST_MESSAGE_LIMIT - count };
}

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json({ limit: '1mb' }));

// Mount auth and conversation routes
app.use('/api/auth', authRouter);
app.use('/api/conversations', conversationsRouter);

app.get('/api/health', async (req, res) => {
    const mode = getActiveProviderName();
    let dbStatus = 'not_configured';

    if (hasDBConfig()) {
        try {
            await initDB();
            const isAlive = await checkDB();
            dbStatus = isAlive ? 'connected' : 'error';
        } catch {
            dbStatus = 'error';
        }
    }

    res.json({
        ok: true,
        service: 'Uma Chatbot',
        mode,
        database: dbStatus,
    });
});

app.post('/api/chat', async (req, res) => {
    const message = String(req.body?.message || '').trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    const guestCheck = checkGuestLimit(req);
    if (!guestCheck.allowed) {
        return res.status(403).json({
            error: guestCheck.error,
            guestLimitReached: true,
        });
    }

    try {
        const result = await sendMessage(message, history);
        return res.json(result);
    } catch (error) {
        console.error('Chat API error:', error.message);
        return res.status(500).json({
            error: getUserFacingError(error),
        });
    }
});

app.post('/api/chat/stream', async (req, res) => {
    const message = String(req.body?.message || '').trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    const guestCheck = checkGuestLimit(req);
    if (!guestCheck.allowed) {
        return res.status(403).json({
            error: guestCheck.error,
            guestLimitReached: true,
        });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let reply = '';
    let streamClosed = false;

    res.on('close', () => {
        streamClosed = true;
    });

    const writeEvent = (event, payload) => {
        if (streamClosed || res.writableEnded) {
            return;
        }

        res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
        const result = await streamMessage(message, history, chunk => {
            reply += chunk;
            writeEvent('chunk', { chunk });
        });

        writeEvent('done', {
            reply,
            isMock: result.isMock,
        });
    } catch (error) {
        console.error('Chat stream error:', error.message);
        writeEvent('error', {
            error: getUserFacingError(error),
        });
    } finally {
        if (!streamClosed && !res.writableEnded) {
            res.end();
        }
    }
});

if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`Uma chatbot is running at http://localhost:${PORT}`);

        if (hasDBConfig()) {
            initDB().catch(err => {
                console.warn('Neon DB connection error on startup:', err.message);
            });
        }
    });

    server.on('error', error => {
        if (error.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use. Set PORT to a free port in .env.`);
        } else {
            console.error('Unable to start Uma chatbot:', error.message);
        }

        process.exit(1);
    });
}

function getUserFacingError(error) {
    const message = String(error?.message || '');

    if (message.includes('503')) {
        return 'The AI provider is temporarily overloaded. Uma tried alternate models/providers; please try again in a moment.';
    }

    if (message.includes('429')) {
        return 'Your AI API quota is exhausted. Check billing/limits in your provider dashboard, or try again later.';
    }

    if (message.includes('403') || message.includes('401') || message.includes('API key')) {
        return 'The AI provider rejected the API key. Verify your key in the .env file.';
    }

    return 'Unable to get a response from Uma right now.';
}

module.exports = app;
