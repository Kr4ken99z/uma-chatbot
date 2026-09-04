const { AI_PROVIDER } = require('../utils/config');
const geminiApi = require('./geminiApi');
const groqApi = require('./groqApi');
const { createDemoReply, streamDemoReply } = require('./demo');
const { getLiveContextIfApplicable } = require('./realtimeService');
const { isImageGenerationRequest, generateImageReply, streamImageReply } = require('./imageService');

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
    // Groq provides blazing-fast sub-second token streaming with 0 lag
    if (groqApi.isConfigured()) {
        const order = ['groq'];
        if (geminiApi.isConfigured()) order.push('gemini');
        return order;
    }

    if (geminiApi.isConfigured()) {
        return ['gemini'];
    }

    return [];
}

async function sendMessage(userMessage, history = []) {
    if (isImageGenerationRequest(userMessage, history)) {
        return await generateImageReply(userMessage, history);
    }

    const liveContext = await getLiveContextIfApplicable(userMessage);
    const enrichedMessage = liveContext ? `${liveContext}\n\nUser Question: ${userMessage}` : userMessage;

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
            return await getProvider(providerName).sendMessage(enrichedMessage, history);
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

async function streamMessage(userMessage, history = [], onChunk) {
    if (isImageGenerationRequest(userMessage, history)) {
        return await streamImageReply(userMessage, history, onChunk);
    }

    const liveContext = await getLiveContextIfApplicable(userMessage);
    const enrichedMessage = liveContext ? `${liveContext}\n\nUser Question: ${userMessage}` : userMessage;

    const providerOrder = getProviderOrder();

    if (!providerOrder.length) {
        await streamDemoReply(userMessage, onChunk);
        return { isMock: true };
    }

    let lastError = null;

    for (const providerName of providerOrder) {
        try {
            return await getProvider(providerName).streamMessage(enrichedMessage, history, onChunk);
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
    const hasNextProvider = providerOrder.indexOf(providerName) < providerOrder.length - 1;
    return hasNextProvider;
}

module.exports = {
    sendMessage,
    streamMessage,
    getActiveProviderName,
};
