/**
 * Intelligent Image Prompt Expander & Intent Detector
 * Transforms simple user requests into high-fidelity, model-accurate generation prompts
 * while preserving user intent, brand models, colors, environments, and styles.
 */

// Patterns to detect explicit image requests
const EXPLICIT_IMAGE_PATTERNS = [
    /^\s*(?:please\s+)?(?:generate|create|make|draw|render|paint|design|produce)\s+(?:an?\s+)?(?:new\s+)?(?:image|picture|photo|wallpaper|drawing|illustration|artwork|graphic|pic)\s*(?:of|about|for|showing|with)?\s*(.*)/i,
    /^\s*(?:image|picture|photo|wallpaper|drawing|illustration)\s+(?:of|showing|for)\s*(.*)/i,
    /^\s*(?:draw|paint)\s+(?:me\s+)?(?:an?\s+)?(.*)/i,
    /^\s*(?:generate|create|render)\s+(?:an?\s+)?(?:artwork|illustration|wallpaper)\s*(?:of|for)?\s*(.*)/i,
    // Follow-ups, corrections & centering
    /(?:correct|fix|adjust|re-?generate|redo|re-?create|update|modify)\s+(?:this\s+)?(?:one\s+)?(?:and\s+)?(?:generate\s+)?(?:a\s+)?(?:new\s+)?(?:image|pic|picture|photo|artwork)\b/i,
    /(?:centrali[zs]e|center)\s+(?:the\s+)?(?:image|picture|photo|car|vehicle|subject|object)/i,
    /why\s+(?:is|isn['’]?t)?\s*(?:this|the)?\s*(?:car|image|picture|subject)?\s*(?:is|isn['’]?t)?\s*(?:not\s+)?(?:centrali[zs]ed|centered|in\s+center)/i,
    /(?:make|show)\s+(?:it|the\s+car|the\s+image)\s+(?:more\s+)?(?:centrali[zs]ed|centered)/i,
    /(?:cut\s*off|cropped|front\s*portion|back\s*portion).*(?:image|picture|photo|car)/i,
    /(?:generate|create|make)\s+(?:a\s+)?(?:new|another)\s+(?:image|picture|photo)/i,
];

// Visual entities that indicate image generation intent when typed as short standalone inputs (<= 5 words)
const VISUAL_ENTITY_PATTERNS = [
    // Specific vehicle models & brands
    /\b(?:bmw(?:\s+m[1-8]|\s+x[1-7]|\s+i[3-8]|\s+[1-8]\s*series)?|mercedes(?:\s*(?:benz|amg|maybach|gt|s-?class|c-?class|e-?class))?|porsche(?:\s*(?:911|taycan|panamera|gt[23]|cayenne|macan))?|ferrari|lamborghini|audi(?:\s*(?:r8|rs[3-7]|e-?tron))?|bugatti|mclaren|aston\s+martin|corvette|mustang|camaro|nissan\s+gt-?r|tesla(?:\s*(?:model\s+[s3xy]|cybertruck))?)\b/i,
    // General vehicles
    /\b(?:sports?\s+car|supercar|hypercar|luxury\s+car|sedan|coupe|suv|motorcycle|superbike|vehicle)\b/i,
    // Animals
    /\b(?:dog|puppy|cat|kitten|lion|tiger|wolf|eagle|horse|elephant|panda|bear|fox|owl|cheetah|leopard)\b/i,
    // Landscapes & nature
    /\b(?:mountain|mountains|sunset|sunrise|waterfall|forest|ocean|beach|aurora\s+borealis|northern\s+lights|desert|galaxy|nebula|milky\s+way)\b/i,
    // Sci-fi & architectural
    /\b(?:futuristic\s+city|cyberpunk\s+city|cyberpunk|sci-?fi\s+city|tokyo\s+at\s+night|neon\s+city)\b/i,
];

// Words indicating standard conversation/Q&A that should NEVER be treated as image generation
const CONVERSATION_TRIGGERS = [
    /^(?:who|what|why|how|when|where|which|whose|whom)\b/i,
    /^(?:is|are|am|was|were|do|does|did|can|could|would|should|will|shall|have|has|had)\b/i,
    /^(?:explain|tell\s+me|help|teach|define|write|solve|calculate|translate|debug|summarize|code)\b/i,
    /\?$/,
    /\b(?:president|prime\s+minister|capital|currency|definition|difference\s+between|tutorial|syntax|algorithm|code|function|javascript|python|java|html|css|c\+\+|sql)\b/i,
];

/**
 * Checks if a user prompt is requesting image generation
 * @param {string} text
 * @param {Array} [history]
 * @returns {boolean}
 */
function isImageGenerationRequest(text, history = []) {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed) return false;

    // Strict guard: Coding, debugging, fixing code, or software engineering questions are NEVER images
    if (/\b(code|function|syntax|error|bug|algorithm|program|script|class|java|python|javascript|typescript|c\+\+|sql|react|html|css)\b/i.test(trimmed)) {
        return false;
    }

    // Explicit command always wins
    if (EXPLICIT_IMAGE_PATTERNS.some(p => p.test(trimmed))) {
        return true;
    }

    // Follow-ups if previous chat message had an image
    const hasPreviousImage = history && history.some(h => h.text && h.text.includes('![' ));
    if (hasPreviousImage) {
        const imageFeedbackRegex = /(centrali[zs]e|centered|center\s+it|crop|cropped|cut\s*off|new\s+image|another\s+image|regenerate|redo|fix\s+it|correct\s+it)/i;
        if (imageFeedbackRegex.test(trimmed)) {
            return true;
        }
    }

    // Guard: reject normal questions / conversational queries
    if (CONVERSATION_TRIGGERS.some(trigger => trigger.test(trimmed))) {
        return false;
    }

    // Short standalone visual entity checks (Requirement 5: e.g. "BMW M5", "Mercedes", "dog", "mountain")
    const words = trimmed.split(/\s+/);
    if (words.length <= 6) {
        if (VISUAL_ENTITY_PATTERNS.some(p => p.test(trimmed))) {
            return true;
        }
    }

    return false;
}

/**
 * Extracts the core subject and requirements from user input
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
        for (let i = history.length - 1; i >= 0; i--) {
            const h = history[i];
            const imgMatch = h.text && h.text.match(/!\[(.*?)\]\((.*?)\)/);
            if (imgMatch && imgMatch[1]) {
                const prev = imgMatch[1].replace(/,.*$/, '').trim();
                return prev;
            }
            if (h.role === 'user') {
                for (const pattern of EXPLICIT_IMAGE_PATTERNS.slice(0, 4)) {
                    const match = h.text.match(pattern);
                    if (match && match[1] && match[1].trim().length > 0) {
                        return match[1].trim().replace(/^["']|["']$/g, '');
                    }
                }
            }
        }
    }

    for (const pattern of EXPLICIT_IMAGE_PATTERNS) {
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
 * Transforms simple user input into an expert, high-quality, model-accurate image generation prompt.
 * Preserves user intent, specific vehicle models, colors, locations, and styling.
 * @param {string} userSubject
 * @returns {string}
 */
function transformToHighQualityPrompt(userSubject) {
    const raw = (userSubject || 'serene landscape').trim();

    // Check if already an expanded detailed prompt
    if (raw.length > 150) {
        return raw;
    }

    // Extract color modifier if present
    const colorMatch = raw.match(/\b(red|blue|black|white|silver|grey|gray|green|yellow|orange|purple|gold|matte\s+black|crimson|metallic\s+blue)\b/i);
    const color = colorMatch ? colorMatch[0] : null;

    // Extract location / environment if present
    const locMatch = raw.match(/\b(?:in|at|on)\s+([A-Za-z0-9\s]+?)(?:$|\sat\s|\sin\s)/i);
    const location = locMatch ? locMatch[0].trim() : null;

    // Extract time / atmosphere
    const timeMatch = raw.match(/\b(at\s+night|sunset|sunrise|golden\s+hour|rainy|snowy|foggy|dusk|dawn)\b/i);
    const timeAtmosphere = timeMatch ? timeMatch[0] : null;

    const extraContext = [color ? `with ${color} finish` : null, location, timeAtmosphere].filter(Boolean).join(', ');
    const contextPhrase = extraContext ? ` (${extraContext})` : '';

    // 1. SPECIFIC BMW M5
    if (/\bbmw\s+m5\b/i.test(raw)) {
        const colorDesc = color ? `${color} finish` : 'glossy metallic finish';
        const envDesc = location || timeAtmosphere ? `${location || ''} ${timeAtmosphere || ''}`.trim() : 'a luxury modern architectural pavilion';
        return `Create a photorealistic image of a BMW M5 in ${colorDesc}, set in ${envDesc}. Accurately depict the BMW M5 as a high-performance sports sedan with correct BMW M5 proportions, aggressive M-specific styling, distinctive kidney grille, M badging, performance wheels, realistic body details and lighting. Front three-quarter dynamic beauty shot, cinematic professional automotive photography, highly detailed, realistic materials and reflections. Do not substitute another BMW model.`;
    }

    // 2. OTHER SPECIFIC BMW MODELS (M3, M4, M6, M8, i8, etc.)
    const bmwSpecificMatch = raw.match(/\bbmw\s+(m[1-8]|x[1-7]|i[3-8]|[1-8]\s*series)\b/i);
    if (bmwSpecificMatch) {
        const model = bmwSpecificMatch[0].toUpperCase();
        const colorDesc = color ? `${color}` : 'gleaming metallic';
        return `Create a photorealistic image of a ${model} in ${colorDesc}${contextPhrase}. Accurately depict the ${model} with correct manufacturer proportions, authentic aggressive body contours, signature BMW kidney grille, official badging, performance wheels, and realistic automotive lighting. Front three-quarter angle, cinematic automotive photography, 8k resolution, realistic reflections. Do not substitute another model.`;
    }

    // 3. MERCEDES / MERCEDES-AMG
    if (/\bmercedes\b/i.test(raw)) {
        const isAmg = /\bamg\b/i.test(raw);
        const modelName = isAmg ? 'Mercedes-AMG performance vehicle' : 'luxury Mercedes-Benz';
        const colorDesc = color ? ` in ${color}` : '';
        return `Create a photorealistic image of a ${modelName}${colorDesc}${contextPhrase}. Accurately depict the iconic Mercedes design language, signature front grille with the three-pointed star emblem, sculpted aerodynamic body lines, premium metallic finish, and precision alloy wheels. Front three-quarter dynamic shot, cinematic automotive photography, realistic materials and reflections, dramatic lighting, 8k resolution.`;
    }

    // 4. PORSCHE (911, etc.)
    if (/\bporsche\b/i.test(raw)) {
        const is911 = /911/i.test(raw);
        const modelName = is911 ? 'Porsche 911 sports car' : 'Porsche vehicle';
        const colorDesc = color ? ` in ${color}` : '';
        return `Create a photorealistic image of a ${modelName}${colorDesc}${contextPhrase}. Accurately depict the iconic rear-engine coupe silhouette, signature round LED headlights, wide rear fenders, authentic Porsche crest, and precision performance wheels. Front three-quarter beauty view, cinematic professional automotive photography, realistic reflections, 8k resolution, razor-sharp detail.`;
    }

    // 5. FERRARI
    if (/\bferrari\b/i.test(raw)) {
        const colorDesc = color ? `in ${color}` : 'in iconic Rosso Corsa red';
        return `Create a photorealistic image of a Ferrari ${colorDesc}${contextPhrase}. Accurately depict the exotic Italian supercar with authentic aerodynamic sculpting, signature prancing horse badge, aggressive front splitter, performance alloy wheels, and glossy finish. Front three-quarter dynamic view, professional automotive photography, dramatic lighting, 8k resolution, razor-sharp focus.`;
    }

    // 6. LAMBORGHINI
    if (/\blamborghini\b/i.test(raw)) {
        const colorDesc = color ? ` in ${color}` : '';
        return `Create a photorealistic image of a Lamborghini supercar${colorDesc}${contextPhrase}. Accurately depict the sharp, aggressive angular wedge design, signature Y-shaped LED lights, raging bull badge, wide performance stance, and realistic reflections. Front three-quarter view, cinematic supercar photography, 8k resolution.`;
    }

    // 7. GENERAL CAR / VEHICLE
    if (/\b(?:car|automobile|vehicle|sedan|coupe|suv|supercar|sports\s*car)\b/i.test(raw)) {
        const colorDesc = color ? ` ${color}` : ' sleek metallic';
        return `Create a photorealistic, stunning image of a modern${colorDesc} car${contextPhrase}. Front three-quarter beauty shot, accurate vehicle proportions, sleek metallic bodywork with realistic environment reflections, crisp LED headlights, and elegant alloy wheels. Professional automotive studio photography, dramatic lighting, 8k resolution, photorealistic masterpiece.`;
    }

    // 8. DOG / PUPPY
    if (/\b(?:dog|puppy|canine|hound)\b/i.test(raw)) {
        return `Create a high-quality, heartwarming professional photograph of a dog${contextPhrase}. Natural anatomy, beautifully detailed fur texture, expressive and alert eyes, and healthy posture. Shot outdoors with soft natural golden hour lighting, shallow depth of field with a gently blurred background, 8k resolution, crystal clear detail.`;
    }

    // 9. CAT / KITTEN
    if (/\b(?:cat|kitten|feline)\b/i.test(raw)) {
        return `Create a high-quality, adorable professional photograph of a cat${contextPhrase}. Natural anatomy, fine whiskered details, soft fur texture, and captivating luminous eyes. Soft ambient natural lighting, shallow depth of field, 8k resolution, razor-sharp focus.`;
    }

    // 10. WILDLIFE & OTHER ANIMALS
    if (/\b(?:lion|tiger|wolf|eagle|horse|elephant|bear|fox|panda|leopard|cheetah)\b/i.test(raw)) {
        return `Create a majestic, high-resolution wildlife photograph of a ${raw}. Accurate anatomical proportions, natural habitat setting, realistic fur and feather textures, dramatic natural lighting, award-winning National Geographic style photography, 8k resolution.`;
    }

    // 11. MOUNTAIN / LANDSCAPE
    if (/\b(?:mountain|mountains|peak|peaks|alps|himalayas)\b/i.test(raw)) {
        return `Create a majestic, breathtaking landscape photograph of a mountain${contextPhrase}. Towering snow-capped peaks, rugged alpine rock textures, dramatic atmospheric clouds and golden hour sunlight catching the ridges. Wide-angle cinematic composition, stunning volumetric depth, pristine natural beauty, 8k resolution, ultra-detailed.`;
    }

    // 12. SUNSET / SUNRISE
    if (/\b(?:sunset|sunrise|dusk|dawn)\b/i.test(raw)) {
        return `Create a breathtaking, cinematic landscape photograph of a sunset${contextPhrase}. Vibrant warm gradient sky with golden, amber, and violet tones, radiant sunbeams breaking through clouds, casting rich reflections and long atmospheric shadows. 8k resolution, award-winning photography.`;
    }

    // 13. FUTURISTIC CITY / CYBERPUNK
    if (/\b(?:futuristic\s+city|cyberpunk|sci-?fi\s+city|neon\s+city)\b/i.test(raw)) {
        return `Create a visually stunning, cinematic image of a futuristic city${contextPhrase}. Soaring hyper-modern skyscrapers, intricate architectural skybridges, glowing neon holographic displays, sleek flying vehicles traversing illuminated transit corridors at dusk. Atmospheric volumetric haze, vibrant reflections, ultra-high detail, 8k resolution, science fiction masterpiece.`;
    }

    // 14. FOOD / CULINARY
    if (/\b(?:pizza|burger|pasta|sushi|dessert|cake|coffee|steak|salad|soup|food|dish)\b/i.test(raw)) {
        return `Create a mouthwatering professional culinary photograph of ${raw}. Delicious appetizing presentation, fresh ingredients, rich glistening textures, gentle steam, soft studio lighting, shallow depth of field, restaurant magazine quality.`;
    }

    // 15. DEFAULT / GENERAL HIGH-QUALITY EXPANSION
    return `Create a photorealistic, stunning image of ${raw}. Perfectly centered composition, authentic details, realistic textures, gorgeous cinematic lighting, high contrast, crystal-clear 8k resolution, razor-sharp focus, award-winning photography.`;
}

module.exports = {
    isImageGenerationRequest,
    extractImagePrompt,
    transformToHighQualityPrompt,
};
