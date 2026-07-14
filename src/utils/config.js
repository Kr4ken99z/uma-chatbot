require('dotenv').config();

module.exports = {
    AI_PROVIDER: (process.env.AI_PROVIDER || 'groq').toLowerCase(),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    GEMINI_MAX_OUTPUT_TOKENS: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 2048,
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    GROQ_MAX_OUTPUT_TOKENS: Number(process.env.GROQ_MAX_OUTPUT_TOKENS) || 2048,
};
