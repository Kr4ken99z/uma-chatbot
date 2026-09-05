/**
 * Central Reasoning & Orchestration Layer for UMA
 * Coordinates:
 *   1. Context Resolution (pronoun resolution, image follow-ups)
 *   2. Memory Storage & Recall
 *   3. Intent & Task Classification
 *   4. Tool Selection & Execution
 *   5. Task Planning & Adaptive Depth
 *   6. Output Verification & Sanitization
 */

const { resolveContext } = require('./contextResolver');
const { rememberFact, getRelevantMemories } = require('./memoryService');
const { classifyIntent, TASK_INTENTS, COMPLEXITY_LEVELS } = require('./intentClassifier');
const { getLiveContextIfApplicable } = require('./realtimeService');
const { generateImageReply, streamImageReply } = require('./imageService');
const { verifyAndSanitizeResponse } = require('./verifier');
const groqApi = require('./groqApi');
const geminiApi = require('./geminiApi');
const { createDemoReply, streamDemoReply } = require('./demo');

const providers = {
    groq: groqApi,
    gemini: geminiApi,
};

function getProviderOrder() {
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

/**
 * Builds task-specific system guidance to adapt response depth and structure
 * @param {object} classification
 * @returns {string}
 */
function buildTaskGuidance(classification) {
    switch (classification.intent) {
        case TASK_INTENTS.GENERAL_KNOWLEDGE:
            if (classification.complexity === COMPLEXITY_LEVELS.SIMPLE) {
                return '\n[TASK GUIDANCE: Be direct, accurate, and concise. State the answer clearly without unnecessary filler.]';
            }
            return '\n[TASK GUIDANCE: Provide a clear, well-structured explanation with relevant facts.]';

        case TASK_INTENTS.EDUCATIONAL_EXPLANATION:
            return '\n[TASK GUIDANCE: Explain this concept simply and intuitively. Use a relatable real-world analogy and a minimal, clear example to make it immediately understandable.]';

        case TASK_INTENTS.KNOWLEDGE_COMPARISON:
            return '\n[TASK GUIDANCE: Provide a structured comparison. Highlight key trade-offs (syntax, performance, learning curve, primary use cases) and conclude with a practical recommendation.]';

        case TASK_INTENTS.CODING_DEBUGGING:
            return '\n[TASK GUIDANCE: Identify any bugs or requirements, provide a clean, complete, and directly runnable code snippet in a fenced code block with the language tag, and briefly explain how the solution works.]';

        case TASK_INTENTS.COMPLEX_MULTI_STEP:
            return '\n[TASK GUIDANCE: Internally plan the necessary steps. Present a well-structured, comprehensive architectural blueprint with clear headings, core requirements, and implementation steps.]';

        case TASK_INTENTS.WRITING_TRANSFORMATION:
            return '\n[TASK GUIDANCE: Provide a polished, professional, and well-written version while strictly preserving the author’s original intent.]';

        case TASK_INTENTS.LOCATION_REQUEST:
            return '\n[TASK GUIDANCE: The user is seeking a nearby venue (cafe, restaurant, place). Explain gently that without device GPS coordinates, you protect their privacy, but can immediately pinpoint top recommendations if they specify their city or neighborhood. Provide a direct, clickable Markdown link to explore nearby: [Explore Nearby Places on Google Maps](https://www.google.com/maps/search/cafes+near+me), and share helpful criteria for selecting top-rated spots.]';

        default:
            return '';
    }
}

/**
 * Main reasoning orchestration for standard synchronous message execution
 * @param {string} userMessage
 * @param {Array} history
 * @returns {Promise<{ reply: string, isMock?: boolean, imageUrl?: string }>}
 */
async function processMessage(userMessage, history = []) {
    const raw = String(userMessage || '').trim();

    // 1. CONTEXT RESOLUTION (Pronoun resolution & image follow-ups like "Make it black")
    const contextResolution = resolveContext(raw, history);
    const activeMessage = contextResolution.resolvedMessage;

    // 2. INTENT & TASK CLASSIFICATION
    const classification = classifyIntent(activeMessage, history);

    // 3. BRANCH: Explicit Memory Storage ("remember that my project uses MongoDB")
    if (classification.intent === TASK_INTENTS.MEMORY_REQUEST) {
        const fact = classification.meta.fact;
        const confirmation = rememberFact(fact);
        return { reply: confirmation, isMock: false };
    }

    // 4. BRANCH: Image Generation (Direct or context follow-up)
    if (classification.intent === TASK_INTENTS.IMAGE_GENERATION || contextResolution.isImageFollowup) {
        const imagePrompt = contextResolution.isImageFollowup ? contextResolution.imageSubject : activeMessage;
        return await generateImageReply(imagePrompt, history);
    }

    // 5. BRANCH: Ambiguous Action Requests ("Book a table for me")
    if (classification.intent === TASK_INTENTS.AMBIGUOUS_ACTION) {
        const clarification = verifyAndSanitizeResponse('', classification);
        return { reply: clarification, isMock: false };
    }

    // 6. ENRICH CONTEXT WITH RELEVANT MEMORY & REAL-TIME TELEMETRY
    let contextEnrichments = [];

    // Relevant long-term memory
    const relevantMemory = getRelevantMemories(raw);
    if (relevantMemory) {
        contextEnrichments.push(relevantMemory);
    }

    // Real-time tool telemetry (weather/time)
    if (classification.intent === TASK_INTENTS.REALTIME_TOOL) {
        const liveContext = await getLiveContextIfApplicable(raw);
        if (liveContext) {
            contextEnrichments.push(liveContext);
        }
    }

    // Adaptive task guidance
    const guidance = buildTaskGuidance(classification);
    if (guidance) {
        contextEnrichments.push(guidance);
    }

    const finalEnrichedMessage = contextEnrichments.length > 0
        ? `${contextEnrichments.join('\n\n')}\n\nUser Question: ${activeMessage}`
        : activeMessage;

    // 7. EXECUTE VIA ACTIVE LLM PROVIDER
    const providerOrder = getProviderOrder();
    if (!providerOrder.length) {
        return {
            reply: createDemoReply(activeMessage),
            isMock: true,
        };
    }

    let lastError = null;
    for (const providerName of providerOrder) {
        try {
            const result = await providers[providerName].sendMessage(finalEnrichedMessage, history);
            const verifiedReply = verifyAndSanitizeResponse(result.reply, classification);
            return {
                ...result,
                reply: verifiedReply,
            };
        } catch (err) {
            lastError = err;
            console.warn(`Provider ${providerName} failed:`, err.message);
        }
    }

    throw lastError || new Error('All AI providers failed to respond.');
}

/**
 * Main reasoning orchestration for streaming response execution
 * @param {string} userMessage
 * @param {Array} history
 * @param {function} onChunk
 */
async function processStreamMessage(userMessage, history = [], onChunk) {
    const raw = String(userMessage || '').trim();

    // 1. CONTEXT RESOLUTION
    const contextResolution = resolveContext(raw, history);
    const activeMessage = contextResolution.resolvedMessage;

    // 2. INTENT & TASK CLASSIFICATION
    const classification = classifyIntent(activeMessage, history);

    // 3. BRANCH: Explicit Memory Storage
    if (classification.intent === TASK_INTENTS.MEMORY_REQUEST) {
        const confirmation = rememberFact(classification.meta.fact);
        onChunk(confirmation);
        return { isMock: false };
    }

    // 4. BRANCH: Image Generation
    if (classification.intent === TASK_INTENTS.IMAGE_GENERATION || contextResolution.isImageFollowup) {
        const imagePrompt = contextResolution.isImageFollowup ? contextResolution.imageSubject : activeMessage;
        return await streamImageReply(imagePrompt, history, onChunk);
    }

    // 5. BRANCH: Ambiguous Action Requests
    if (classification.intent === TASK_INTENTS.AMBIGUOUS_ACTION) {
        const clarification = verifyAndSanitizeResponse('', classification);
        onChunk(clarification);
        return { isMock: false };
    }

    // 6. ENRICH CONTEXT
    let contextEnrichments = [];

    const relevantMemory = getRelevantMemories(raw);
    if (relevantMemory) {
        contextEnrichments.push(relevantMemory);
    }

    if (classification.intent === TASK_INTENTS.REALTIME_TOOL) {
        const liveContext = await getLiveContextIfApplicable(raw);
        if (liveContext) {
            contextEnrichments.push(liveContext);
        }
    }

    const guidance = buildTaskGuidance(classification);
    if (guidance) {
        contextEnrichments.push(guidance);
    }

    const finalEnrichedMessage = contextEnrichments.length > 0
        ? `${contextEnrichments.join('\n\n')}\n\nUser Question: ${activeMessage}`
        : activeMessage;

/**
 * Creates a stream chunk filter to strip internal reasoning or <think> tags on the fly
 * @param {function} onChunk
 * @returns {function}
 */
function createStreamingSanitizer(onChunk) {
    let inThinkTag = false;
    let thinkBuffer = '';

    return function (chunk) {
        if (!chunk) return;
        let text = chunk;

        if (inThinkTag) {
            thinkBuffer += text;
            const endIdx = thinkBuffer.indexOf('</think>');
            if (endIdx !== -1) {
                inThinkTag = false;
                const remainder = thinkBuffer.slice(endIdx + 8);
                thinkBuffer = '';
                if (remainder) {
                    onChunk(remainder);
                }
            }
            return;
        }

        if (text.includes('<think>')) {
            const startIdx = text.indexOf('<think>');
            const prefix = text.slice(0, startIdx);
            if (prefix) {
                onChunk(prefix);
            }
            const afterStart = text.slice(startIdx);
            const endIdx = afterStart.indexOf('</think>');
            if (endIdx !== -1) {
                const remainder = afterStart.slice(endIdx + 8);
                if (remainder) {
                    onChunk(remainder);
                }
            } else {
                inThinkTag = true;
                thinkBuffer = afterStart;
            }
            return;
        }

        onChunk(text);
    };
}

    // 7. STREAM VIA ACTIVE LLM PROVIDER
    const providerOrder = getProviderOrder();
    if (!providerOrder.length) {
        await streamDemoReply(activeMessage, onChunk);
        return { isMock: true };
    }

    const safeChunkHandler = createStreamingSanitizer(onChunk);

    let lastError = null;
    for (const providerName of providerOrder) {
        try {
            return await providers[providerName].streamMessage(finalEnrichedMessage, history, safeChunkHandler);
        } catch (err) {
            lastError = err;
            console.warn(`Provider ${providerName} stream failed:`, err.message);
        }
    }

    throw lastError || new Error('All AI providers failed to stream.');
}

module.exports = {
    processMessage,
    processStreamMessage,
};
