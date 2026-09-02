const express = require('express');
const { signup, login, verifyToken } = require('../services/authService');

const router = express.Router();

// Helper to extract Bearer token
function getBearerToken(req) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    return null;
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body || {};
        const result = await signup({ name, email, password });
        return res.status(201).json({
            ok: true,
            user: result.user,
            token: result.token,
        });
    } catch (error) {
        const isDbError =
            error.message.includes('DATABASE_URL') ||
            error.message.includes('connect ECONNREFUSED') ||
            error.message.includes('Neon');
        const status = isDbError ? 503 : 400;
        const message = isDbError
            ? 'Database is not yet connected. Please configure DATABASE_URL in your environment.'
            : error.message;

        return res.status(status).json({
            ok: false,
            error: message,
        });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const result = await login({ email, password });
        return res.json({
            ok: true,
            user: result.user,
            token: result.token,
        });
    } catch (error) {
        const isDbError =
            error.message.includes('DATABASE_URL') ||
            error.message.includes('connect ECONNREFUSED') ||
            error.message.includes('Neon');
        const status = isDbError ? 503 : 401;
        const message = isDbError
            ? 'Database is not yet connected. Please configure DATABASE_URL in your environment.'
            : error.message;

        return res.status(status).json({
            ok: false,
            error: message,
        });
    }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
    const token = getBearerToken(req);

    if (!token) {
        return res.status(401).json({
            ok: false,
            error: 'No token provided.',
        });
    }

    try {
        const user = await verifyToken(token);
        return res.json({
            ok: true,
            user,
        });
    } catch (error) {
        return res.status(401).json({
            ok: false,
            error: error.message || 'Session expired or invalid.',
        });
    }
});

module.exports = router;
