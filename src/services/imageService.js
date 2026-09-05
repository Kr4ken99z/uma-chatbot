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
    if (!NVIDIA_API_KEY) return null;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200); // 1.2s timeout: fast fallback without user lag

        const endpoint = `https://ai.api.nvidia.com/v1/genai/${NVIDIA_IMAGE_MODEL || 'black-forest-labs/flux.1-dev'}`;
        const res = await fetch(endpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Authorization': `Bearer ${NVIDIA_API_KEY}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                mode: 'base',
                cfg_scale: 3.5,
                width: 1024,
                height: 1024,
                steps: 16,
            }),
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            console.warn('NVIDIA image API returned status:', res.status);
            return null;
        }

        const data = await res.json();
        const art = data?.artifacts?.[0];

        // Guard against content filtering
        if (art && art.finishReason === 'CONTENT_FILTERED') {
            console.warn('NVIDIA image content filtered, falling back to Flux engine');
            return null;
        }

        if (art && art.base64 && art.base64.length > 20000) {
            return `data:image/jpeg;base64,${art.base64}`;
        }
    } catch (err) {
        console.warn('NVIDIA image generation error or timeout:', err.message);
    }
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
    const highQualityPrompt = transformToHighQualityPrompt(rawPrompt);
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
        imageUrl = buildImageUrl(internalPrompt);
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
        imageUrl = buildImageUrl(internalPrompt);
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
