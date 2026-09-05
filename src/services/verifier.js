/**
 * Self-Check & Verification Engine for UMA
 * Sanitizes outputs to ensure no internal chain-of-thought tokens or reasoning traces leak to the user.
 * Verifies that the answer directly fulfills user constraints and intent.
 */

// Patterns of internal chain-of-thought that must NEVER be exposed to the user
const INTERNAL_LEAK_PATTERNS = [
    /<think>[\s\S]*?<\/think>/gi,
    /\[(?:thinking|internal\s+reasoning|plan|chain\s+of\s+thought)\][\s\S]*?\[\/(?:thinking|internal\s+reasoning|plan|chain\s+of\s+thought)\]/gi,
    /^(?:internal\s+plan|thinking\s+process|my\s+plan):\s*[\s\S]*?(?=\n\n|\n[A-Z])/i,
];

/**
 * Sanitizes and verifies the model output before delivering to user
 * @param {string} text
 * @param {object} intentInfo
 * @returns {string}
 */
function verifyAndSanitizeResponse(text, intentInfo = {}) {
    // 1. Ambiguity check: If user requested an action without necessary details (e.g. "Book a table for me")
    if (intentInfo.intent === 'AMBIGUOUS_ACTION') {
        const safeText = String(text || '');
        if (!/(date|time|how\s+many\s+people|party\s+size|guests|location)/i.test(safeText)) {
            return `To help you book that, could you please share a few quick details?\n\n1. **Location or Restaurant Name**\n2. **Date & Preferred Time**\n3. **Number of Guests**\n\nOnce you let me know, I'll take care of it!`;
        }
        return safeText;
    }

    if (!text || typeof text !== 'string') return '';

    let sanitized = text;

    // 2. Strip any raw internal chain-of-thought leaks
    for (const pattern of INTERNAL_LEAK_PATTERNS) {
        sanitized = sanitized.replace(pattern, '').trim();
    }

    return sanitized.trim();
}

module.exports = {
    verifyAndSanitizeResponse,
};
