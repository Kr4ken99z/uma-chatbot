/**
 * Context Resolver for UMA
 * Resolves anaphoric pronouns ("he", "she", "it", "they", "that", "this")
 * and handles conversational follow-ups (e.g. "Make it black" after an image of a BMW M5).
 */

const PRONOUN_REGEX = /\b(he|him|his|she|her|it|its|they|them|their|that|this)\b/i;
const IMAGE_FOLLOWUP_MODIFIER_REGEX = /^\s*(?:make|change|show|turn|render|paint|recolor)\s+(?:it|this|the\s+image|the\s+car|the\s+subject)\s+(.*)/i;

/**
 * Extracts key entities and image subjects from conversation history
 * @param {Array} history
 * @returns {{ lastImageSubject: string|null, lastAssistantSubject: string|null, lastUserSubject: string|null }}
 */
function extractHistoryContext(history = []) {
    let lastImageSubject = null;
    let lastAssistantSubject = null;
    let lastUserSubject = null;

    if (!Array.isArray(history) || history.length === 0) {
        return { lastImageSubject, lastAssistantSubject, lastUserSubject };
    }

    for (let i = history.length - 1; i >= 0; i--) {
        const item = history[i];
        const text = String(item.text || '').trim();

        // 1. Check for image in markdown: ![caption](url)
        if (!lastImageSubject) {
            const imgMatch = text.match(/!\[(.*?)\]\((.*?)\)/);
            if (imgMatch && imgMatch[1]) {
                lastImageSubject = imgMatch[1].replace(/,.*$/, '').trim();
            }
        }

        // 2. Check for assistant entity / subject mention
        if (!lastAssistantSubject && item.role === 'assistant') {
            // Check for bold names or titles, e.g. **James Gosling**
            const boldMatch = text.match(/\*\*([^*]+)\*\*/);
            if (boldMatch && boldMatch[1] && boldMatch[1].length < 40) {
                lastAssistantSubject = boldMatch[1].trim();
            } else {
                // First sentence subject
                const firstSentence = text.split(/[.\n]/)[0];
                const entityMatch = firstSentence.match(/^(?:([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))/);
                if (entityMatch && entityMatch[1]) {
                    lastAssistantSubject = entityMatch[1].trim();
                }
            }
        }

        // 3. Check for user subject
        if (!lastUserSubject && item.role === 'user') {
            lastUserSubject = text;
        }

        if (lastImageSubject && lastAssistantSubject) break;
    }

    return { lastImageSubject, lastAssistantSubject, lastUserSubject };
}

/**
 * Resolves pronouns and follow-up requests against conversation history
 * @param {string} userMessage
 * @param {Array} history
 * @returns {{
 *   resolvedMessage: string,
 *   isImageFollowup: boolean,
 *   imageSubject: string|null,
 *   referent: string|null
 * }}
 */
function resolveContext(userMessage, history = []) {
    const raw = String(userMessage || '').trim();
    const { lastImageSubject, lastAssistantSubject } = extractHistoryContext(history);

    // Case 1: Image follow-up modification (e.g. "Make it black", "Change it to red", "Show it at night")
    if (lastImageSubject) {
        const cleanBase = lastImageSubject.replace(/[.,!?;:]/g, '').trim();

        // Direct modifier check: "make it black", "change it to red"
        const modMatch = raw.match(IMAGE_FOLLOWUP_MODIFIER_REGEX);
        if (modMatch && modMatch[1]) {
            const modification = modMatch[1].replace(/[.,!?;:]/g, '').trim();
            const combinedSubject = `${modification} ${cleanBase}`.trim();
            return {
                resolvedMessage: `generate an image of ${combinedSubject}`,
                isImageFollowup: true,
                imageSubject: combinedSubject,
                referent: cleanBase,
            };
        }

        // Short color/style modifier if very short (e.g. "black", "in red", "in Tokyo at night")
        if (/^(?:in\s+)?(black|red|blue|white|silver|gold|yellow|green|purple)(?:\s+color)?\.?$/i.test(raw)) {
            const color = raw.replace(/[.,!?;:]/g, '').replace(/\b(in|color)\b/gi, '').trim();
            const combinedSubject = `${color} ${cleanBase}`.trim();
            return {
                resolvedMessage: `generate an image of ${combinedSubject}`,
                isImageFollowup: true,
                imageSubject: combinedSubject,
                referent: cleanBase,
            };
        }

        if (/^(?:in|at)\s+[A-Za-z0-9\s]+\.?$/i.test(raw)) {
            const location = raw.replace(/[.,!?;:]/g, '').trim();
            const combinedSubject = `${cleanBase} ${location}`.trim();
            return {
                resolvedMessage: `generate an image of ${combinedSubject}`,
                isImageFollowup: true,
                imageSubject: combinedSubject,
                referent: cleanBase,
            };
        }
    }

    // Case 2: Conversational pronoun resolution (e.g. "Where did he work?" -> refers to James Gosling)
    if (lastAssistantSubject && PRONOUN_REGEX.test(raw)) {
        // Build resolved context note for the model
        const resolvedMessage = `${raw}\n\n[Context: In this question, pronouns like "he", "she", "it", or "they" refer to "${lastAssistantSubject}"]`;
        return {
            resolvedMessage,
            isImageFollowup: false,
            imageSubject: null,
            referent: lastAssistantSubject,
        };
    }

    return {
        resolvedMessage: raw,
        isImageFollowup: false,
        imageSubject: null,
        referent: null,
    };
}

module.exports = {
    resolveContext,
    extractHistoryContext,
};
