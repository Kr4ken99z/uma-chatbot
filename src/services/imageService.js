const { NVIDIA_API_KEY, NVIDIA_IMAGE_MODEL, GEMINI_API_KEY, GEMINI_MODEL } = require('../utils/config');

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
 * Expands a simple user prompt into a commercial beauty shot using Gemini (just like Gemini Imagen / Midjourney).
 * If Gemini is unavailable, returns null to use the deterministic beauty shot builder.
 * @param {string} rawPrompt
 * @returns {Promise<string|null>}
 */
async function expandPromptWithGemini(rawPrompt) {
    if (!GEMINI_API_KEY) return null;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL || 'gemini-3.6-flash'}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(endpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `You are a world-class commercial visual prompt artist for Midjourney and Gemini.
A user asked for an image of: "${rawPrompt}".
Write an ultra-high aesthetic, commercial magazine beauty shot prompt.
Strict Rules:
- Front three-quarter heroic beauty view showing the full subject with majestic presence
- Gorgeous lighting (glowing lights, cinematic reflections, glossy vibrant colors)
- Subject MUST be centered in frame with wide empty margins on all borders so it is 100% visible and NEVER cropped
- Photorealistic 8k masterpiece, razor-sharp focus
- Return ONLY the expanded prompt paragraph. Max 45 words. No intro or quotes.`
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: 100,
                    temperature: 0.7,
                }
            })
        });

        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text && text.length > 20) {
                return text.replace(/^["']|["']$/g, '');
            }
        }
    } catch (e) {
        console.warn('Gemini prompt expansion fallback:', e.message);
    }
    return null;
}

/**
 * Creates an image URL based on the visual prompt (High-fidelity FLUX engine)
 * Always centers vehicles and subjects with wide landscape framing so no portion is cut off.
 * @param {string} prompt
 * @param {object} options
 * @returns {string}
 */
function buildImageUrl(prompt, options = {}) {
    const rawPrompt = (prompt || 'serene artistic landscape').trim();
    const isVehicle = /(car|bmw|audi|mercedes|ferrari|porsche|lamborghini|vehicle|truck|bike|motorcycle|suv|sedan|coupe|m5|m6|m3|m4)/i.test(rawPrompt);
    
    // Explicit front 3/4 heroic beauty view, glowing lights, vibrant colors, ample margins so front and rear are NEVER cut off
    let framing = 'heroic front three-quarter dynamic beauty shot, centered in frame with generous empty margins on all borders, full subject completely visible, uncropped, glossy vibrant colors, cinematic rim lighting, 8k resolution, photorealistic masterpiece';
    if (isVehicle) {
        framing = 'commercial automotive hero shot, front three-quarter dynamic beauty view, glossy metallic paint with deep reflections, glowing iconic LED headlights and kidney grille, parked in luxury modern architectural pavilion, centered in frame with wide empty margins on left and right, completely uncropped, front bumper and rear tail fully visible, razor-sharp 8k resolution, award-winning car photography';
    }

    // If already expanded by Gemini, preserve it; otherwise apply commercial framing
    const isAlreadyDetailed = rawPrompt.length > 80;
    const enrichedPrompt = isAlreadyDetailed
        ? rawPrompt
        : `${rawPrompt}, ${framing}`;

    const encoded = encodeURIComponent(enrichedPrompt);
    // Use 16:9 widescreen ratio (1280x720) for vehicles so wide cars fit naturally with generous margins
    const width = options.width || (isVehicle ? 1280 : 1024);
    const height = options.height || (isVehicle ? 720 : 1024);
    // Always use a unique seed so corrections & regenerations never show the same image
    const seed = options.seed || (Math.floor(Math.random() * 9000000) + 100000);

    // Note: enhance=false ensures Pollinations does NOT alter/corrupt the centering prompt
    return `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false`;
}

/**
 * Generates Uma's complete markdown response containing the generated image
 * @param {string} prompt
 * @param {Array} [history]
 * @returns {Promise<{ reply: string, imageUrl: string, prompt: string }>}
 */
async function generateImageReply(prompt, history = []) {
    const cleanPrompt = extractImagePrompt(prompt, history) || prompt.trim();
    
    // Elevate prompt using Gemini beauty director
    const expandedPrompt = (await expandPromptWithGemini(cleanPrompt)) || cleanPrompt;

    // Primary: NVIDIA Build API
    let imageUrl = await generateWithNvidia(expandedPrompt);

    // Fallback: High-fidelity uncropped FLUX engine with commercial beauty shot
    if (!imageUrl) {
        imageUrl = buildImageUrl(expandedPrompt);
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

    // Elevate prompt using Gemini beauty director
    const expandedPrompt = (await expandPromptWithGemini(cleanPrompt)) || cleanPrompt;

    // Primary: NVIDIA Build API
    let imageUrl = await generateWithNvidia(expandedPrompt);

    // Fallback: High-fidelity uncropped FLUX engine with commercial beauty shot
    if (!imageUrl) {
        imageUrl = buildImageUrl(expandedPrompt);
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
