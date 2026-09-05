const { GROQ_API_KEY, GROQ_MODEL, GROQ_MAX_OUTPUT_TOKENS } = require('../utils/config');
const { UMA_SYSTEM_PROMPT } = require('./prompt');

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

const hasRealApiKey = GROQ_API_KEY && GROQ_API_KEY !== 'your_groq_api_key_here';

async function sendMessage(userMessage, history = []) {
    const response = await fetchGroqWithFallback(userMessage, history, false);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(formatGroqError(response.status, errorText));
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || '';

    return {
        reply: reply || 'I received your message, but Groq returned an empty response.',
        isMock: false,
    };
}

async function streamMessage(userMessage, history = [], onChunk) {
    const response = await fetchGroqWithFallback(userMessage, history, true);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(formatGroqError(response.status, errorText));
    }

    await readGroqStream(response, onChunk);
    return { isMock: false };
}

function buildGroqMessages(userMessage, history = []) {
    const messages = [{ role: 'system', content: UMA_SYSTEM_PROMPT }];

    if (Array.isArray(history)) {
        for (const item of history) {
            const text = String(item.text || '').trim();
            if (!text) continue;
            messages.push({
                role: item.role === 'user' ? 'user' : 'assistant',
                content: text,
            });
        }
    }

    messages.push({ role: 'user', content: String(userMessage || '').trim() });
    return messages;
}

async function fetchGroqWithFallback(userMessage, history = [], stream = false) {
    const models = [...new Set([GROQ_MODEL, 'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-120b'])].filter(Boolean);
    let lastResponse = null;

    for (const model of models) {
        lastResponse = await fetch(GROQ_CHAT_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: buildGroqMessages(userMessage, history),
                temperature: 0.7,
                max_tokens: GROQ_MAX_OUTPUT_TOKENS,
                stream,
            }),
        });

        if (lastResponse.ok) {
            return lastResponse;
        }

        if (lastResponse.status === 429 || lastResponse.status === 404) {
            console.warn(`Groq model ${model} returned ${lastResponse.status}, trying fallback model...`);
            continue;
        }

        break;
    }

    return lastResponse;
}

async function readGroqStream(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        lines.forEach(line => {
            processGroqStreamLine(line, onChunk);
        });
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
        buffer.split(/\r?\n/).forEach(line => {
            processGroqStreamLine(line, onChunk);
        });
    }
}

function processGroqStreamLine(line, onChunk) {
    const trimmedLine = line.trim();

    if (!trimmedLine.startsWith('data:')) {
        return;
    }

    const data = trimmedLine.slice(5).trimStart();

    if (!data || data === '[DONE]') {
        return;
    }

    const chunk = JSON.parse(data)?.choices?.[0]?.delta?.content;

    if (chunk) {
        onChunk(chunk);
    }
}

function formatGroqError(status, errorText) {
    const parsedMessage = parseGroqErrorMessage(errorText);
    const details = parsedMessage ? ` ${parsedMessage}` : '';
    return `Groq API error ${status} (${GROQ_MODEL}):${details}`;
}

function parseGroqErrorMessage(errorText) {
    try {
        const data = JSON.parse(errorText);
        return data?.error?.message || '';
    } catch {
        return errorText.trim();
    }
}

function isConfigured() {
    return hasRealApiKey;
}

module.exports = {
    sendMessage,
    streamMessage,
    isConfigured,
};
