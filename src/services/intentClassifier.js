/**
 * Intent & Task Classifier for UMA
 * Classifies incoming messages into discrete intents and complexity tiers
 * to drive adaptive reasoning, tool execution, and appropriate answer depth.
 */

const { isImageGenerationRequest } = require('./promptExpander');
const { checkMemoryIntent } = require('./memoryService');

const TASK_INTENTS = {
    IMAGE_GENERATION: 'IMAGE_GENERATION',
    MEMORY_REQUEST: 'MEMORY_REQUEST',
    REALTIME_TOOL: 'REALTIME_TOOL',
    CODING_DEBUGGING: 'CODING_DEBUGGING',
    KNOWLEDGE_COMPARISON: 'KNOWLEDGE_COMPARISON',
    EDUCATIONAL_EXPLANATION: 'EDUCATIONAL_EXPLANATION',
    WRITING_TRANSFORMATION: 'WRITING_TRANSFORMATION',
    AMBIGUOUS_ACTION: 'AMBIGUOUS_ACTION',
    COMPLEX_MULTI_STEP: 'COMPLEX_MULTI_STEP',
    GENERAL_KNOWLEDGE: 'GENERAL_KNOWLEDGE',
};

const COMPLEXITY_LEVELS = {
    SIMPLE: 'SIMPLE',
    MODERATE: 'MODERATE',
    COMPLEX: 'COMPLEX',
    TOOL: 'TOOL',
};

// Patterns for specific intents
const REALTIME_REGEX = /\b(weather|temperature|temp|climate|forecast|current\s+time|what\s+time\s+is\s+it|clock\s+in)\b/i;
const CODING_REGEX = /\b(code|function|algorithm|debug|fix\s+(?:this|the|my)?\s*code|syntax|error|exception|bug|java|python|javascript|typescript|c\+\+|sql|react|html|css|class|method)\b/i;
const COMPARISON_REGEX = /\b(?:compare|difference\s+between|vs\.?|versus|better\s+than|advantages\s+and\s+disadvantages)\b/i;
const EDUCATIONAL_REGEX = /\b(?:explain\s+.*(?:simply|like\s+i['’]?m|to\s+a\s+beginner|for\s+dummies|easy\s+way)|how\s+does\s+.*work|what\s+is\s+the\s+concept\s+of|teach\s+me)\b/i;
const WRITING_REGEX = /\b(?:make\s+this\s+(?:professional|polite|concise|formal)|rewrite|proofread|paraphrase|summarize|refactor\s+text)\b/i;
const AMBIGUOUS_ACTION_REGEX = /^\s*(?:book\s+(?:a\s+table|a\s+flight|a\s+room|an\s+appointment|tickets?)|schedule\s+(?:a\s+meeting|a\s+call)|reserve\s+(?:a\s+table|seats?))\b/i;
const COMPLEX_MULTI_STEP_REGEX = /\b(?:build\s+me\s+a|create\s+a\s+complete|full\s+stack|end-to-end|architecture|design\s+a\s+(?:system|platform|website|app|portfolio))\b/i;

/**
 * Classifies the user's intent and determines the appropriate task complexity
 * @param {string} userMessage
 * @param {Array} [history]
 * @returns {{
 *   intent: string,
 *   complexity: string,
 *   toolRequired: string|null,
 *   meta: object
 * }}
 */
function classifyIntent(userMessage, history = []) {
    const raw = String(userMessage || '').trim();

    // 1. Check for Image Generation intent
    if (isImageGenerationRequest(raw, history)) {
        return {
            intent: TASK_INTENTS.IMAGE_GENERATION,
            complexity: COMPLEXITY_LEVELS.TOOL,
            toolRequired: 'imageService',
            meta: {},
        };
    }

    // 2. Check for Memory Storage intent
    const memoryCheck = checkMemoryIntent(raw);
    if (memoryCheck.isMemory) {
        return {
            intent: TASK_INTENTS.MEMORY_REQUEST,
            complexity: COMPLEXITY_LEVELS.TOOL,
            toolRequired: 'memoryService',
            meta: { fact: memoryCheck.fact },
        };
    }

    // 3. Check for Real-time telemetry (Weather / Time)
    if (REALTIME_REGEX.test(raw)) {
        return {
            intent: TASK_INTENTS.REALTIME_TOOL,
            complexity: COMPLEXITY_LEVELS.TOOL,
            toolRequired: 'realtimeService',
            meta: {},
        };
    }

    // 4. Check for Ambiguous Action (e.g. "Book a table for me")
    if (AMBIGUOUS_ACTION_REGEX.test(raw)) {
        return {
            intent: TASK_INTENTS.AMBIGUOUS_ACTION,
            complexity: COMPLEXITY_LEVELS.MODERATE,
            toolRequired: null,
            meta: {},
        };
    }

    // 5. Check for Complex Multi-Step Task
    if (COMPLEX_MULTI_STEP_REGEX.test(raw)) {
        return {
            intent: TASK_INTENTS.COMPLEX_MULTI_STEP,
            complexity: COMPLEXITY_LEVELS.COMPLEX,
            toolRequired: null,
            meta: {},
        };
    }

    // 6. Check for Coding / Debugging
    if (CODING_REGEX.test(raw) || /```[\s\S]*?```/.test(raw)) {
        return {
            intent: TASK_INTENTS.CODING_DEBUGGING,
            complexity: COMPLEXITY_LEVELS.MODERATE,
            toolRequired: null,
            meta: {},
        };
    }

    // 7. Check for Technology / Concept Comparison
    if (COMPARISON_REGEX.test(raw)) {
        return {
            intent: TASK_INTENTS.KNOWLEDGE_COMPARISON,
            complexity: COMPLEXITY_LEVELS.MODERATE,
            toolRequired: null,
            meta: {},
        };
    }

    // 8. Check for Educational / Beginner Explanation
    if (EDUCATIONAL_REGEX.test(raw)) {
        return {
            intent: TASK_INTENTS.EDUCATIONAL_EXPLANATION,
            complexity: COMPLEXITY_LEVELS.MODERATE,
            toolRequired: null,
            meta: {},
        };
    }

    // 9. Check for Writing Transformation
    if (WRITING_REGEX.test(raw)) {
        return {
            intent: TASK_INTENTS.WRITING_TRANSFORMATION,
            complexity: COMPLEXITY_LEVELS.MODERATE,
            toolRequired: null,
            meta: {},
        };
    }

    // 10. General Knowledge / Simple Queries
    const isSimpleFact = /^(?:who|what|where|when|which)\s+(?:is|was|are|were|the|created|invented)\b/i.test(raw) && raw.split(/\s+/).length < 9;
    return {
        intent: TASK_INTENTS.GENERAL_KNOWLEDGE,
        complexity: isSimpleFact ? COMPLEXITY_LEVELS.SIMPLE : COMPLEXITY_LEVELS.MODERATE,
        toolRequired: null,
        meta: {},
    };
}

module.exports = {
    TASK_INTENTS,
    COMPLEXITY_LEVELS,
    classifyIntent,
};
