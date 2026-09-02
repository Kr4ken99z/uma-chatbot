const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { connectDB } = require('../utils/db');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'uma-chatbot-secret-key-2026-auth';
const JWT_EXPIRES_IN = '7d';

function createToken(user) {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            name: user.name,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

async function signup({ name, email, password }) {
    await connectDB();

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

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
        throw new Error('An account with this email already exists.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
        name: cleanName,
        email: cleanEmail,
        password: hashedPassword,
    });

    const token = createToken(user);

    return {
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt,
        },
        token,
    };
}

async function login({ email, password }) {
    await connectDB();

    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !password) {
        throw new Error('Please provide both email and password.');
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
        throw new Error('Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new Error('Invalid email or password.');
    }

    const token = createToken(user);

    return {
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt,
        },
        token,
    };
}

async function verifyToken(token) {
    if (!token) {
        throw new Error('No authentication token provided.');
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    await connectDB();

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
        throw new Error('User no longer exists.');
    }

    return {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
    };
}

module.exports = {
    signup,
    login,
    verifyToken,
};
