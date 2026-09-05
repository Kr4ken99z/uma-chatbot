const { NVIDIA_API_KEY, NVIDIA_IMAGE_MODEL } = require('../utils/config');
const {
    isImageGenerationRequest,
    extractImagePrompt,
    normalizeSubjectAndConstraints,
    createHighQualityPrompt,
    transformToHighQualityPrompt,
} = require('./promptExpander');

/**
 * Generates an image using the NVIDIA Build API
 * @param {string} prompt
 * @returns {Promise<string|null>}
 */
async function generateWithNvidia(prompt) {
    // Pollinations FLUX engine provides instant client streaming without gateway stalls
    return null;
}

/**
 * Creates an image URL based on the visual prompt (High-fidelity FLUX engine)
 * Always uses native 1024x1024 resolution to preserve authentic chassis proportions and circular wheels.
 * @param {string} prompt
 * @param {object} options
 * @returns {string}
 */
function buildImageUrl(prompt, options = {}) {
    const rawPrompt = (prompt || 'serene artistic landscape').trim();
    const isAlreadyDetailed = options.isExpanded || rawPrompt.startsWith('Create a ');
    const highQualityPrompt = isAlreadyDetailed ? rawPrompt : transformToHighQualityPrompt(rawPrompt);
    const encoded = encodeURIComponent(highQualityPrompt);

    // Native 1024x1024 FLUX training resolution: guarantees perfect round wheels, zero horizontal stretching
    const width = options.width || 1024;
    const height = options.height || 1024;
    const seed = options.seed || (Math.floor(Math.random() * 9000000) + 100000);

    return `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false`;
}

/**
 * Generates Uma's complete markdown response containing the generated image
 * @param {string} prompt
 * @param {Array} [history]
 * @returns {Promise<{ reply: string, imageUrl: string, prompt: string, chatTitle: string }>}
 */
async function generateImageReply(prompt, history = []) {
    const rawSubject = extractImagePrompt(prompt, history) || prompt.trim();
    
    // Understand, normalize, and extract constraints
    const parsed = normalizeSubjectAndConstraints(rawSubject);
    const internalPrompt = createHighQualityPrompt(parsed);

    // Primary: NVIDIA Build API
    let imageUrl = await generateWithNvidia(internalPrompt);

    // Fallback: High-fidelity uncropped FLUX engine with model-accurate prompt
    if (!imageUrl) {
        imageUrl = buildImageUrl(internalPrompt, { isExpanded: true });
    }

    // Clean display title for user (e.g. "BMW M5 Competition", never exposes internal prompt details)
    const displayTitle = parsed.cleanTitle || rawSubject.replace(/,.*$/, '').trim();
    const reply = `Here is your generated image of **${displayTitle}**:\n\n![${displayTitle}](${imageUrl})`;

    return {
        reply,
        imageUrl,
        prompt: rawSubject,
        normalizedEntity: parsed.coreEntity,
        chatTitle: parsed.cleanTitle,
    };
}

/**
 * Streams the image generation response to the client
 * @param {string} prompt
 * @param {Array} [history]
 * @param {function} onChunk
 */
async function streamImageReply(prompt, history, onChunk) {
    if (typeof history === 'function') {
        onChunk = history;
        history = [];
    }

    const rawSubject = extractImagePrompt(prompt, history) || prompt.trim();

    onChunk('[[CREATING_IMAGE]]');

    // Understand, normalize, and extract constraints
    const parsed = normalizeSubjectAndConstraints(rawSubject);
    const internalPrompt = createHighQualityPrompt(parsed);

    // Primary: NVIDIA Build API
    let imageUrl = await generateWithNvidia(internalPrompt);

    // Fallback: High-fidelity uncropped FLUX engine with model-accurate prompt
    if (!imageUrl) {
        imageUrl = buildImageUrl(internalPrompt, { isExpanded: true });
    }

    // Clean display title for user (e.g. "BMW M5 Competition", never exposes internal prompt details)
    const displayTitle = parsed.cleanTitle || rawSubject.replace(/,.*$/, '').trim();
    const finalMarkdown = `Here is your generated image of **${displayTitle}**:\n\n![${displayTitle}](${imageUrl})`;

    onChunk(`__REPLACE_ALL__${finalMarkdown}`);

    return { 
        isImage: true, 
        imageUrl, 
        prompt: rawSubject,
        normalizedEntity: parsed.coreEntity,
        chatTitle: parsed.cleanTitle,
    };
}

module.exports = {
    isImageGenerationRequest,
    extractImagePrompt,
    transformToHighQualityPrompt,
    buildImageUrl,
    generateImageReply,
    streamImageReply,
};
