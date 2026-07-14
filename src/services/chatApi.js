const { AI_PROVIDER } = require('../utils/config');
const geminiApi = require('./geminiApi');
const groqApi = require('./groqApi');
const { createDemoReply, streamDemoReply } = require('./demo');

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

function getProvider(name) {
    return providers[name];
}

function getProviderOrder() {
    const active = getActiveProviderName();

    if (active === 'demo') {
        return [];
    }

    const fallback = active === 'groq' ? 'gemini' : 'groq';
    const order = [active];

    if (providers[fallback]?.isConfigured?.()) {
        order.push(fallback);
    }

    return order;
}

async function sendMessage(userMessage) {
    const providerOrder = getProviderOrder();

    if (!providerOrder.length) {
        return {
            reply: createDemoReply(userMessage),
            isMock: true,
        };
    }

    let lastError = null;

    for (const providerName of providerOrder) {
        try {
            return await getProvider(providerName).sendMessage(userMessage);
        } catch (error) {
            lastError = error;

            if (!shouldTryNextProvider(error, providerOrder, providerName)) {
                throw error;
            }

            console.warn(`${providerName} failed, trying next provider:`, error.message);
        }
    }

    throw lastError || new Error('No AI provider could respond.');
}

async function streamMessage(userMessage, onChunk) {
    const providerOrder = getProviderOrder();

    if (!providerOrder.length) {
        await streamDemoReply(userMessage, onChunk);
        return { isMock: true };
    }

    let lastError = null;

    for (const providerName of providerOrder) {
        try {
            return await getProvider(providerName).streamMessage(userMessage, onChunk);
        } catch (error) {
            lastError = error;

            if (!shouldTryNextProvider(error, providerOrder, providerName)) {
                throw error;
            }

            console.warn(`${providerName} stream failed, trying next provider:`, error.message);
        }
    }

    throw lastError || new Error('No AI provider could respond.');
}

function shouldTryNextProvider(error, providerOrder, providerName) {
    const message = String(error?.message || '');
    const hasNextProvider = providerOrder.indexOf(providerName) < providerOrder.length - 1;
    const isRetryable = message.includes('429') || message.includes('503');

    return hasNextProvider && isRetryable;
}

module.exports = {
    sendMessage,
    streamMessage,
    getActiveProviderName,
};
