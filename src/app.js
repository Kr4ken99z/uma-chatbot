const express = require('express');
const path = require('path');
require('dotenv').config();

const { sendMessage, streamMessage, getActiveProviderName } = require('./services/chatApi');
const authRouter = require('./routes/auth');
const conversationsRouter = require('./routes/conversations');
const { connectDB, isDBConnected } = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json({ limit: '1mb' }));

// Mount auth and conversation routes
app.use('/api/auth', authRouter);
app.use('/api/conversations', conversationsRouter);

app.get('/api/health', async (req, res) => {
    const mode = getActiveProviderName();
    if (process.env.MONGODB_URI && !isDBConnected()) {
        try {
            await connectDB();
        } catch {
            // DB connection attempt failed
        }
    }

    res.json({
        ok: true,
        service: 'Uma Chatbot',
        mode,
        database: isDBConnected() ? 'connected' : (process.env.MONGODB_URI ? 'error' : 'not_configured'),
    });
});

app.post('/api/chat', async (req, res) => {
    const message = String(req.body?.message || '').trim();

    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    try {
        const result = await sendMessage(message);
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

    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
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
        const result = await streamMessage(message, chunk => {
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

        if (process.env.MONGODB_URI) {
            connectDB().catch(err => {
                console.warn('MongoDB connection error on startup:', err.message);
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
