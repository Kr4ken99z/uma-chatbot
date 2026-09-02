const { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_MAX_OUTPUT_TOKENS } = require('../utils/config');
const { UMA_SYSTEM_PROMPT } = require('./prompt');

const hasRealApiKey = GEMINI_API_KEY && GEMINI_API_KEY !== 'your_gemini_api_key_here';
const FALLBACK_MODELS = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
];

async function sendMessage(userMessage, history = []) {
    const { response, model } = await fetchGeminiWithFallback('generateContent', userMessage, history);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(formatGeminiError(response.status, errorText, model));
    }

    const data = await response.json();
    const reply = extractReply(data);

    return {
        reply: reply || 'I received your message, but Gemini returned an empty response.',
        isMock: false,
    };
}

async function streamMessage(userMessage, history = [], onChunk) {
    const { response, model } = await fetchGeminiWithFallback('streamGenerateContent', userMessage, history, 'alt=sse');

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(formatGeminiError(response.status, errorText, model));
    }

    await readGeminiStream(response, onChunk);
    return { isMock: false };
}

function getModelCandidates() {
    return [...new Set(['gemini-3.6-flash', GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean))];
}

async function fetchGeminiWithFallback(action, userMessage, history = [], query = '') {
    const models = getModelCandidates();
    let lastResponse = null;
    let lastModel = models[0];

    for (const model of models) {
        lastModel = model;
        const response = await fetchGemini(createGeminiEndpoint(model, action, query), userMessage, history);

        if (response.ok || !shouldRetryWithFallback(response.status)) {
            return { response, model };
        }

        lastResponse = response;
    }

    return {
        response: lastResponse,
        model: lastModel,
    };
}

function shouldRetryWithFallback(status) {
    return status === 429 || status === 503 || status === 404;
}

function formatGeminiError(status, errorText, model) {
    const parsedMessage = parseGeminiErrorMessage(errorText);
    const details = parsedMessage ? ` ${parsedMessage}` : '';
    return `Gemini API error ${status} (${model}):${details}`;
}

function parseGeminiErrorMessage(errorText) {
    try {
        const data = JSON.parse(errorText);
        return data?.error?.message || '';
    } catch {
        return errorText.trim();
    }
}

function createGeminiEndpoint(model, action, query = '') {
    const queryString = query ? `${query}&key=${GEMINI_API_KEY}` : `key=${GEMINI_API_KEY}`;
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}?${queryString}`;
}

function fetchGemini(endpoint, userMessage, history = []) {
    return fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(createGeminiRequest(userMessage, history)),
    });
}

function sanitizeGeminiContents(history, userMessage) {
    const turns = [];

    if (Array.isArray(history)) {
        for (const item of history) {
            const text = String(item.text || '').trim();
            if (!text) continue;
            turns.push({
                role: item.role === 'user' ? 'user' : 'model',
                text,
            });
        }
    }

    turns.push({ role: 'user', text: String(userMessage || '').trim() });

    const contents = [];
    for (const turn of turns) {
        // Gemini contents must begin with a 'user' turn
        if (contents.length === 0 && turn.role === 'model') {
            continue;
        }

        // Collapse consecutive messages with the same role into one turn
        if (contents.length > 0 && contents[contents.length - 1].role === turn.role) {
            contents[contents.length - 1].parts[0].text += `\n\n${turn.text}`;
        } else {
            contents.push({
                role: turn.role,
                parts: [{ text: turn.text }],
            });
        }
    }

    return contents;
}

function createGeminiRequest(userMessage, history = []) {
    const contents = sanitizeGeminiContents(history, userMessage);

    return {
        systemInstruction: {
            parts: [{ text: UMA_SYSTEM_PROMPT }],
        },
        contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        },
    };
}

async function readGeminiStream(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';

        events.forEach(event => {
            processGeminiStreamEvent(event, onChunk);
        });
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
        processGeminiStreamEvent(buffer, onChunk);
    }
}

function processGeminiStreamEvent(event, onChunk) {
    const data = event
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n');

    if (!data || data === '[DONE]') {
        return;
    }

    const chunk = extractReply(JSON.parse(data), false);

    if (chunk) {
        onChunk(chunk);
    }
}

function extractReply(data, shouldTrim = true) {
    const reply = data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text)
        .filter(Boolean)
        .join('\n') || '';

    return shouldTrim ? reply.trim() : reply;
}

function isConfigured() {
    return hasRealApiKey;
}

module.exports = {
    sendMessage,
    streamMessage,
    isConfigured,
};
