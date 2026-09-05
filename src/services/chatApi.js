const { AI_PROVIDER } = require('../utils/config');
const geminiApi = require('./geminiApi');
const groqApi = require('./groqApi');
const orchestrator = require('./orchestrator');

const providers = {
    gemini: geminiApi,
    groq: groqApi,
};

function getActiveProviderName() {
    const preferred = providers[AI_PROVIDER]?.isConfigured?.() ? AI_PROVIDER : null;

    if (preferred) {
        return preferred;
    }

    if (groqApi.isConfigured()) {
        return 'groq';
    }

    if (geminiApi.isConfigured()) {
        return 'gemini';
    }

    return 'demo';
}

async function sendMessage(userMessage, history = []) {
    return await orchestrator.processMessage(userMessage, history);
}

async function streamMessage(userMessage, history = [], onChunk) {
    return await orchestrator.processStreamMessage(userMessage, history, onChunk);
}

module.exports = {
    sendMessage,
    streamMessage,
    getActiveProviderName,
};
