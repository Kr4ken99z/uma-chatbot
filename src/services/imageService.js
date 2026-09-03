const { NVIDIA_API_KEY, NVIDIA_IMAGE_MODEL } = require('../utils/config');

// Patterns to detect when a user is asking for image creation
const IMAGE_REQUEST_PATTERNS = [
    /^\s*(?:please\s+)?(?:generate|create|make|draw|render|paint|design|produce)\s+(?:an?\s+)?(?:image|picture|photo|wallpaper|drawing|illustration|artwork|graphic|pic)\s*(?:of|about|for|showing|with)?\s*(.*)/i,
    /^\s*(?:image|picture|photo|wallpaper|drawing|illustration)\s+(?:of|showing|for)\s*(.*)/i,
    /^\s*(?:draw|paint)\s+(?:me\s+)?(?:an?\s+)?(.*)/i,
    /^\s*(?:generate|create|render)\s+(?:an?\s+)?(?:artwork|illustration|wallpaper)\s*(?:of|for)?\s*(.*)/i,
];

/**
 * Checks if a user's prompt is requesting image generation
 * @param {string} text
 * @returns {boolean}
 */
function isImageGenerationRequest(text) {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    return IMAGE_REQUEST_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Extracts the core subject/prompt from the user's message
 * @param {string} text
 * @returns {string}
 */
function extractImagePrompt(text) {
    if (!text) return '';
    const trimmed = text.trim();

    for (const pattern of IMAGE_REQUEST_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
            return match[1].trim().replace(/^["']|["']$/g, '');
        }
    }

    // Fallback: strip leading verbs
    return trimmed
        .replace(/^(?:please\s+)?(?:generate|create|make|draw)\s+(?:an?\s+)?(?:image|picture)\s*/i, '')
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
        const endpoint = `https://ai.api.nvidia.com/v1/genai/${NVIDIA_IMAGE_MODEL || 'black-forest-labs/flux.1-dev'}`;
        const res = await fetch(endpoint, {
            method: 'POST',
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
            }),
        });

        if (!res.ok) {
            console.warn('NVIDIA image API returned status:', res.status);
            return null;
        }

        const data = await res.json();
        const base64 = data?.artifacts?.[0]?.base64;
        if (base64) {
            return `data:image/jpeg;base64,${base64}`;
        }
    } catch (err) {
        console.warn('NVIDIA image generation error:', err.message);
    }
    return null;
}

/**
 * Creates an image URL based on the visual prompt (Fallback engine)
 * @param {string} prompt
 * @param {object} options
 * @returns {string}
 */
function buildImageUrl(prompt, options = {}) {
    const rawPrompt = (prompt || 'serene artistic landscape').trim();
    
    // Enrich the prompt for dramatic photorealism and fine detail if not already styled
    const hasStyle = /(photorealistic|cyberpunk|anime|digital art|oil painting|3d render|watercolor|cinematic)/i.test(rawPrompt);
    const enrichedPrompt = hasStyle 
        ? rawPrompt 
        : `${rawPrompt}, highly detailed, cinematic lighting, 8k resolution, photorealistic, masterpiece, sharp focus`;

    const encoded = encodeURIComponent(enrichedPrompt);
    const width = options.width || 1024;
    const height = options.height || 1024;
    const seed = options.seed || Math.floor(Math.random() * 10000000);

    return `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true`;
}

/**
 * Generates Uma's complete markdown response containing the generated image
 * @param {string} prompt
 * @returns {Promise<{ reply: string, imageUrl: string, prompt: string }>}
 */
async function generateImageReply(prompt) {
    const cleanPrompt = extractImagePrompt(prompt) || prompt.trim();
    
    // Primary: NVIDIA Build API
    let imageUrl = await generateWithNvidia(cleanPrompt);
    let providerName = 'NVIDIA Build AI';

    if (!imageUrl) {
        imageUrl = buildImageUrl(cleanPrompt);
        providerName = 'Flux AI';
    }

    const reply = `Here is your generated image of **${cleanPrompt}**:\n\n![${cleanPrompt}](${imageUrl})\n\n*Generated with ${providerName} · Prompt: "${cleanPrompt}"*`;

    return {
        reply,
        imageUrl,
        prompt: cleanPrompt,
    };
}

/**
 * Streams the image generation response to the client
 * @param {string} prompt
 * @param {function} onChunk
 */
async function streamImageReply(prompt, onChunk) {
    const cleanPrompt = extractImagePrompt(prompt) || prompt.trim();

    onChunk(`Synthesizing image of **${cleanPrompt}** with NVIDIA Build AI... ✦\n\n`);

    // Primary: NVIDIA Build API
    let imageUrl = await generateWithNvidia(cleanPrompt);
    let providerName = 'NVIDIA Build AI';

    if (!imageUrl) {
        imageUrl = buildImageUrl(cleanPrompt);
        providerName = 'Flux AI';
    }

    const finalMarkdown = `Here is your generated image of **${cleanPrompt}**:\n\n![${cleanPrompt}](${imageUrl})\n\n*Generated with ${providerName} · Prompt: "${cleanPrompt}"*`;

    onChunk(`\n\n${finalMarkdown}`);

    return { isImage: true, imageUrl, prompt: cleanPrompt };
}

module.exports = {
    isImageGenerationRequest,
    extractImagePrompt,
    buildImageUrl,
    generateImageReply,
    streamImageReply,
};
