/**
 * In-Memory & Session Memory Service for UMA
 * Stores user preferences, project details, tech stacks, and user facts.
 * Seamlessly retrieves relevant memory context for upcoming queries without bloat.
 */

// In-memory store: Map<sessionId, Array<{ key: string, value: string, timestamp: number }>>
const memoryStore = new Map();

// Patterns to detect explicit memory instructions
const MEMORY_WRITE_PATTERNS = [
    /^\s*(?:please\s+)?(?:remember|note|keep\s+in\s+mind|save)\s+(?:that\s+)?(.*)/i,
    /^\s*(?:my\s+name\s+is|i\s+am\s+called)\s+([A-Za-z0-9_\-\s]+)/i,
    /^\s*(?:my\s+project|my\s+app|my\s+codebase)\s+(?:is\s+called|is\s+named|uses|is\s+built\s+with)\s+(.*)/i,
    /^\s*i\s+(?:work\s+with|am\s+using|prefer|always\s+use)\s+(.*)/i,
];

/**
 * Checks if a message is an explicit request to remember a fact
 * @param {string} text
 * @returns {{ isMemory: boolean, fact: string|null }}
 */
function checkMemoryIntent(text) {
    if (!text || typeof text !== 'string') return { isMemory: false, fact: null };
    const trimmed = text.trim();

    for (const pattern of MEMORY_WRITE_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
            return { isMemory: true, fact: match[1].trim() };
        }
    }

    return { isMemory: false, fact: null };
}

/**
 * Stores a fact for a given session / default user
 * @param {string} fact
 * @param {string} [sessionId='global']
 * @returns {string} Confirmation message
 */
function rememberFact(fact, sessionId = 'global') {
    if (!memoryStore.has(sessionId)) {
        memoryStore.set(sessionId, []);
    }

    const facts = memoryStore.get(sessionId);
    // Avoid duplicate facts
    const cleanedFact = fact.replace(/^that\s+/i, '').trim();
    if (!facts.some(f => f.value.toLowerCase() === cleanedFact.toLowerCase())) {
        facts.push({
            value: cleanedFact,
            timestamp: Date.now(),
        });
    }

    return `Got it! I will remember that ${cleanedFact}.`;
}

/**
 * Retrieves relevant stored memories for a given query
 * @param {string} userMessage
 * @param {string} [sessionId='global']
 * @returns {string|null}
 */
function getRelevantMemories(userMessage, sessionId = 'global') {
    const facts = memoryStore.get(sessionId);
    if (!facts || facts.length === 0) return null;

    const queryLower = userMessage.toLowerCase();
    
    // Always include project/tech stack memories if query relates to coding, architecture, database, or "it"
    const relevant = facts.filter(f => {
        const factLower = f.value.toLowerCase();
        // Check for keyword overlap
        const words = factLower.split(/\s+/).filter(w => w.length > 3);
        const hasOverlap = words.some(w => queryLower.includes(w));
        const isContextualFollowup = /\b(it|this|the\s+project|the\s+app|the\s+database|auth|schema|api)\b/i.test(userMessage);
        
        return hasOverlap || isContextualFollowup;
    });

    if (relevant.length === 0) return null;

    const memoryBullets = relevant.map(r => `- ${r.value}`).join('\n');
    return `[ACTIVE RELEVANT MEMORY]:\n${memoryBullets}\n(Use this context to tailor your response accurately and seamlessly!)`;
}

/**
 * Clears memory for a session (useful for tests)
 * @param {string} [sessionId='global']
 */
function clearMemories(sessionId = 'global') {
    memoryStore.delete(sessionId);
}

module.exports = {
    checkMemoryIntent,
    rememberFact,
    getRelevantMemories,
    clearMemories,
};
