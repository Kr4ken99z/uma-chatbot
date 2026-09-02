const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getSQL, initDB } = require('../utils/db');

const JWT_SECRET = process.env.JWT_SECRET || 'uma-chatbot-secret-key-2026-auth';
const JWT_EXPIRES_IN = '7d';

function createToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            name: user.name,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

async function signup({ name, email, password }) {
    await initDB();
    const sql = getSQL();

    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanName) {
        throw new Error('Name is required.');
    }

    if (!cleanEmail) {
        throw new Error('Email is required.');
    }

    if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
    }

    const existing = await sql`
        SELECT id FROM users WHERE email = ${cleanEmail} LIMIT 1;
    `;
    if (existing && existing.length > 0) {
        throw new Error('An account with this email already exists.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const inserted = await sql`
        INSERT INTO users (name, email, password)
        VALUES (${cleanName}, ${cleanEmail}, ${hashedPassword})
        RETURNING id, name, email, created_at;
    `;

    const user = inserted[0];
    const token = createToken(user);

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.created_at,
        },
        token,
    };
}

async function login({ email, password }) {
    await initDB();
    const sql = getSQL();

    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !password) {
        throw new Error('Please provide both email and password.');
    }

    const users = await sql`
        SELECT id, name, email, password, created_at
        FROM users
        WHERE email = ${cleanEmail}
        LIMIT 1;
    `;

    if (!users || users.length === 0) {
        throw new Error('Invalid email or password.');
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new Error('Invalid email or password.');
    }

    const token = createToken(user);

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.created_at,
        },
        token,
    };
}

async function verifyToken(token) {
    if (!token) {
        throw new Error('No authentication token provided.');
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    await initDB();
    const sql = getSQL();

    const users = await sql`
        SELECT id, name, email, created_at
        FROM users
        WHERE id = ${decoded.id}
        LIMIT 1;
    `;

    if (!users || users.length === 0) {
        throw new Error('User no longer exists.');
    }

    const user = users[0];
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.created_at,
    };
}

module.exports = {
    signup,
    login,
    verifyToken,
};
