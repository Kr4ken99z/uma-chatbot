const { NVIDIA_API_KEY, NVIDIA_IMAGE_MODEL } = require('../utils/config');

// Patterns to detect when a user is asking for image creation or modification
const IMAGE_REQUEST_PATTERNS = [
    /^\s*(?:please\s+)?(?:generate|create|make|draw|render|paint|design|produce)\s+(?:an?\s+)?(?:new\s+)?(?:image|picture|photo|wallpaper|drawing|illustration|artwork|graphic|pic)\s*(?:of|about|for|showing|with)?\s*(.*)/i,
    /^\s*(?:image|picture|photo|wallpaper|drawing|illustration)\s+(?:of|showing|for)\s*(.*)/i,
    /^\s*(?:draw|paint)\s+(?:me\s+)?(?:an?\s+)?(.*)/i,
    /^\s*(?:generate|create|render)\s+(?:an?\s+)?(?:artwork|illustration|wallpaper)\s*(?:of|for)?\s*(.*)/i,
    // Follow-ups, corrections & centering
    /(?:correct|fix|adjust|re-?generate|redo|re-?create|update|modify)\s+(?:this\s+)?(?:one\s+)?(?:and\s+)?(?:generate\s+)?(?:a\s+)?(?:new\s+)?(?:image|pic|picture|photo)?/i,
    /(?:centrali[zs]e|center)\s+(?:the\s+)?(?:image|picture|photo|car|vehicle|subject|object)/i,
    /why\s+(?:is|isn['’]?t)?\s*(?:this|the)?\s*(?:car|image|picture|subject)?\s*(?:is|isn['’]?t)?\s*(?:not\s+)?(?:centrali[zs]ed|centered|in\s+center)/i,
    /(?:make|show)\s+(?:it|the\s+car|the\s+image)\s+(?:more\s+)?(?:centrali[zs]ed|centered)/i,
    /(?:cut\s*off|cropped|front\s*portion|back\s*portion).*(?:image|picture|photo|car)/i,
    /(?:generate|create|make)\s+(?:a\s+)?(?:new|another)\s+(?:image|picture|photo)/i,
];

/**
 * Checks if a user's prompt is requesting image generation or image modification
 * @param {string} text
 * @param {Array} [history]
 * @returns {boolean}
 */
function isImageGenerationRequest(text, history = []) {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();

    if (IMAGE_REQUEST_PATTERNS.some(pattern => pattern.test(trimmed))) {
        return true;
    }

    // Check if the user is commenting on a previous image in chat
    const hasPreviousImage = history && history.some(h => h.text && h.text.includes('![' ));
    if (hasPreviousImage) {
        const imageFeedbackRegex = /(centrali[zs]e|centered|center\s+it|crop|cropped|cut\s*off|new\s+image|another\s+image|regenerate|redo|fix\s+it|correct\s+it)/i;
        if (imageFeedbackRegex.test(trimmed)) {
            return true;
        }
    }

    return false;
}

/**
 * Extracts the core subject/prompt from the user's message, with history fallback for follow-ups
 * @param {string} text
 * @param {Array} [history]
 * @returns {string}
 */
function extractImagePrompt(text, history = []) {
    if (!text) return '';
    const trimmed = text.trim();

    // Check if this is a correction/centering/follow-up request
    const isFollowup = /(?:correct|fix|adjust|re-?generate|redo|re-?create|centrali[zs]e|center|new\s+image|another\s+image|cropped|cut\s*off|why.*centrali[zs]ed)/i.test(trimmed);

    if (isFollowup && history && history.length > 0) {
        // Look backwards through conversation history for previous image subject
        for (let i = history.length - 1; i >= 0; i--) {
            const h = history[i];
            const imgMatch = h.text && h.text.match(/!\[(.*?)\]\((.*?)\)/);
            if (imgMatch && imgMatch[1]) {
                const prev = imgMatch[1].replace(/,.*$/, '').trim();
                return `${prev}, wide shot, full body, completely centered in frame, front and rear bumpers fully visible, no cropped edges`;
            }
            if (h.role === 'user') {
                for (const pattern of IMAGE_REQUEST_PATTERNS.slice(0, 4)) {
                    const match = h.text.match(pattern);
                    if (match && match[1] && match[1].trim().length > 0) {
                        const clean = match[1].trim().replace(/^["']|["']$/g, '');
                        return `${clean}, wide shot, full body, completely centered in frame, front and rear bumpers fully visible, no cropped edges`;
                    }
                }
            }
        }
    }

    for (const pattern of IMAGE_REQUEST_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
            return match[1].trim().replace(/^["']|["']$/g, '');
        }
    }

    // Fallback: strip leading verbs
    return trimmed
        .replace(/^(?:please\s+)?(?:generate|create|make|draw)\s+(?:an?\s+)?(?:new\s+)?(?:image|picture)\s*/i, '')
        .trim();
}

/**
 * Generates an image using the NVIDIA Build API
 * @param {string} prompt
 * @returns {Promise<string|null>}
 */
async function generateWithNvidia(prompt) {
    if (!NVIDIA_API_KEY) return null;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4200); // 4.2s timeout: fast response with zero hanging

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
                width: 768,
                height: 768,
                steps: 14,
            }),
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            console.warn('NVIDIA image API returned status:', res.status);
            return null;
        }

        const data = await res.json();
        const art = data?.artifacts?.[0];

        // Guard against content filtering (which returns a solid black image)
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
 * Creates an image URL based on the visual prompt (Fallback engine)
 * Always centers vehicles with wide landscape framing so no portion is cut off.
 * @param {string} prompt
 * @param {object} options
 * @returns {string}
 */
function buildImageUrl(prompt, options = {}) {
    const rawPrompt = (prompt || 'serene artistic landscape').trim();
    const isVehicle = /(car|bmw|audi|mercedes|ferrari|porsche|lamborghini|vehicle|truck|bike|motorcycle|suv|sedan|coupe|m5|m6|m3|m4)/i.test(rawPrompt);
    
    // Explicit centering and framing so the front/rear bumper are never cut off
    let framing = 'centered in frame, wide angle view, full subject in frame, clean space around subject, no cropped edges';
    if (isVehicle) {
        framing = 'wide shot showing the entire vehicle from front bumper to rear bumper, full car in frame, completely centered, side three-quarter profile, generous spacing around car, no cropped parts';
    }

    const hasStyle = /(photorealistic|cyberpunk|anime|digital art|oil painting|3d render|watercolor|cinematic)/i.test(rawPrompt);
    const enrichedPrompt = hasStyle 
        ? `${rawPrompt}, ${framing}`
        : `${rawPrompt}, ${framing}, highly detailed, cinematic lighting, 8k resolution, photorealistic, masterpiece, sharp focus`;

    const encoded = encodeURIComponent(enrichedPrompt);
    // Use landscape ratio for vehicles so wide cars fit naturally without edge cut-offs
    const width = options.width || 1024;
    const height = options.height || (isVehicle ? 680 : 1024);
    // Always use a unique seed so corrections & regenerations never show the same image
    const seed = options.seed || (Math.floor(Math.random() * 9000000) + 100000);

    return `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true`;
}

/**
 * Generates Uma's complete markdown response containing the generated image
 * @param {string} prompt
 * @param {Array} [history]
 * @returns {Promise<{ reply: string, imageUrl: string, prompt: string }>}
 */
async function generateImageReply(prompt, history = []) {
    const cleanPrompt = extractImagePrompt(prompt, history) || prompt.trim();
    
    // Primary: Fast NVIDIA Build API, seamless fallback to Flux
    let imageUrl = await generateWithNvidia(cleanPrompt);

    if (!imageUrl) {
        imageUrl = buildImageUrl(cleanPrompt);
    }

    const displayTitle = cleanPrompt.replace(/,.*$/, '').trim();
    const reply = `Here is your generated image of **${displayTitle}**:\n\n![${displayTitle}](${imageUrl})`;

    return {
        reply,
        imageUrl,
        prompt: cleanPrompt,
    };
}

/**
 * Streams the image generation response to the client
 * @param {string} prompt
 * @param {Array} [history]
 * @param {function} onChunk
 */
async function streamImageReply(prompt, history, onChunk) {
    // Support function passed as second argument if history omitted
    if (typeof history === 'function') {
        onChunk = history;
        history = [];
    }

    const cleanPrompt = extractImagePrompt(prompt, history) || prompt.trim();

    onChunk('[[CREATING_IMAGE]]');

    // Primary: Fast NVIDIA Build API, seamless fallback to Flux
    let imageUrl = await generateWithNvidia(cleanPrompt);

    if (!imageUrl) {
        imageUrl = buildImageUrl(cleanPrompt);
    }

    const displayTitle = cleanPrompt.replace(/,.*$/, '').trim();
    const finalMarkdown = `Here is your generated image of **${displayTitle}**:\n\n![${displayTitle}](${imageUrl})`;

    onChunk(`__REPLACE_ALL__${finalMarkdown}`);

    return { isImage: true, imageUrl, prompt: cleanPrompt };
}

module.exports = {
    isImageGenerationRequest,
    extractImagePrompt,
    buildImageUrl,
    generateImageReply,
    streamImageReply,
};
