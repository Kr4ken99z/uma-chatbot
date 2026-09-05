/**
 * Intelligent Image Prompt Expander, Normalizer & Intent Detector
 * Transforms user requests (e.g. "generate an image of BMW M5", "generate an image of a car", "BMW M5")
 * into normalized entities ("BMW M5") and high-fidelity model-accurate prompts.
 * Strictly preserves user constraints (color, environment, lighting, vehicle trim) without generic substitution.
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

// Visual entities that indicate image generation intent when typed as short standalone inputs (<= 12 words)
const VISUAL_ENTITY_PATTERNS = [
    // Specific vehicle models, trims & brands
    /\b(?:bmw(?:\s+m[1-8]|\s+comp|\s+competition|\s+x[1-7]|\s+i[3-8]|\s+[1-8]\s*series)?|mercedes(?:\s*(?:benz|amg|maybach|gt|s-?class|c-?class|e-?class))?|amg\s+gt|porsche(?:\s*(?:911|taycan|panamera|gt[23]|cayenne|macan))?|ferrari|lamborghini|audi(?:\s*(?:r8|rs[3-7]|e-?tron))?|bugatti|mclaren|aston\s+martin|corvette|mustang|camaro|nissan\s+gt-?r|tesla(?:\s*(?:model\s+[s3xy]|cybertruck))?)\b/i,
    // General vehicles
    /\b(?:cars?|sports?\s*cars?|supercars?|hypercars?|luxury\s+cars?|sedans?|coupes?|suvs?|motorcycles?|superbikes?|vehicles?)\b/i,
    // Animals
    /\b(?:dogs?|pupp(?:y|ies)|cats?|kittens?|lions?|tigers?|wolves|wolf|eagles?|horses?|elephants?|pandas?|bears?|fox(?:es)?|owls?|cheetahs?|leopards?|golden\s+retrievers?|husk(?:y|ies)|german\s+shepherds?)\b/i,
    // Landscapes & nature
    /\b(?:mountains?|peaks?|sunsets?|sunrises?|waterfalls?|forests?|oceans?|beach(?:es)?|aurora\s+borealis|northern\s+lights|deserts?|galax(?:y|ies)|nebulas?|milky\s+way)\b/i,
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

const COLOR_REGEX = /\b(red|blue|black|white|silver|grey|gray|green|yellow|orange|purple|gold|matte\s+black|crimson|metallic\s+blue|alpine\s+white|nardo\s+grey|emerald\s+green|dark\s+grey|deep\s+blue)\b/i;
const LOCATION_REGEX = /\b(?:in|at|on)\s+([A-Za-z0-9\s]+?)(?:$|\sat\s|\sin\s|\son\s|\sduring\s)/i;
const TIME_ATMOSPHERE_REGEX = /\b(at\s+night|sunset|sunrise|golden\s+hour|rainy|snowy|foggy|dusk|dawn|cloudy|nighttime|daytime)\b/i;

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
    const hasPreviousImage = history && history.some(h => h.text && h.text.includes('!['));
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

    // Short standalone visual entity checks (up to 12 words)
    const words = trimmed.split(/\s+/);
    if (words.length <= 12) {
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
 * Normalizes user subject and isolates constraints (color, location, time, entity)
 * @param {string} rawInput
 * @returns {{
 *   originalUserRequest: string,
 *   normalizedImageRequest: string,
 *   coreEntity: string,
 *   cleanTitle: string,
 *   color: string|null,
 *   location: string|null,
 *   timeAtmosphere: string|null
 * }}
 */
function normalizeSubjectAndConstraints(rawInput) {
    let clean = extractImagePrompt(rawInput) || String(rawInput || '').trim();
    clean = clean.trim().replace(/^["']|["']$/g, '');

    // 1. Extract constraints
    let color = null;
    const colorMatch = clean.match(COLOR_REGEX);
    if (colorMatch) {
        color = colorMatch[0].toLowerCase();
    }

    let location = null;
    const locMatch = clean.match(LOCATION_REGEX);
    if (locMatch && locMatch[1]) {
        const candidateLoc = locMatch[1].trim();
        if (!/\b(bmw|mercedes|porsche|ferrari|audi|car|m5|sedan|coupe)\b/i.test(candidateLoc)) {
            location = candidateLoc;
        }
    }

    let timeAtmosphere = null;
    const timeMatch = clean.match(TIME_ATMOSPHERE_REGEX);
    if (timeMatch) {
        timeAtmosphere = timeMatch[0].trim().toLowerCase();
    }

    // 2. Strip color, location, and time from clean text to isolate the core entity
    let coreEntity = clean;
    if (color) {
        coreEntity = coreEntity.replace(new RegExp(`\\b${color}\\b`, 'i'), '');
    }
    if (location) {
        coreEntity = coreEntity.replace(new RegExp(`\\b(?:in|at|on)\\s+${location}\\b`, 'i'), '');
    }
    if (timeAtmosphere) {
        coreEntity = coreEntity.replace(new RegExp(`\\b${timeAtmosphere}\\b`, 'i'), '');
    }
    // Clean up residual glue words
    coreEntity = coreEntity.replace(/\b(a|an|the|finish|color|with|and|showing)\b/gi, ' ').replace(/\s+/g, ' ').trim();

    // 3. Intelligently normalize brand, model, and trim abbreviations
    let normalizedEntity = normalizeVehicleOrSubject(coreEntity || clean);

    // 4. Build normalizedImageRequest
    const constraintParts = [
        color ? `${color} ` : '',
        normalizedEntity,
        location ? ` in ${location}` : '',
        timeAtmosphere ? ` ${timeAtmosphere}` : ''
    ];
    const normalizedImageRequest = constraintParts.join('').replace(/\s+/g, ' ').trim();

    return {
        originalUserRequest: rawInput,
        normalizedImageRequest,
        coreEntity: normalizedEntity,
        cleanTitle: normalizedEntity,
        color,
        location,
        timeAtmosphere
    };
}

/**
 * Normalizes abbreviations, model trims, and brand names
 * @param {string} rawSubject
 * @returns {string}
 */
function normalizeVehicleOrSubject(rawSubject) {
    let s = rawSubject.trim();

    // Trim expansions
    s = s.replace(/\bcomp\b/gi, 'Competition');
    s = s.replace(/\bcompetition\b/gi, 'Competition');
    s = s.replace(/\bcs\b/gi, 'CS');
    s = s.replace(/\bcsl\b/gi, 'CSL');
    s = s.replace(/\bgt-?r\b/gi, 'GT-R');
    s = s.replace(/\bgt3\b/gi, 'GT3');
    s = s.replace(/\bgt3\s*rs\b/gi, 'GT3 RS');
    s = s.replace(/\bgt2\s*rs\b/gi, 'GT2 RS');

    // Mercedes & Mercedes-AMG models
    if (/\b(?:mercedes|amg|merc)\b/i.test(s)) {
        if (/\bamg\s*gt\b/i.test(s)) {
            s = s.replace(/\b(?:mercedes(?:\s*-\s*benz|\s+benz)?\s+)?amg\s*gt\b/gi, 'Mercedes-AMG GT');
        } else if (/\bamg\b/i.test(s)) {
            s = s.replace(/\b(?:mercedes(?:\s*-\s*benz|\s+benz)?\s+)?amg\b/gi, 'Mercedes-AMG');
        } else {
            s = s.replace(/\b(?:mercedes(?:\s*-\s*benz|\s+benz)?|merc)\b/gi, 'Mercedes-Benz');
        }
    }

    // BMW M models: "m5", "m3", "m4", "m8", "m2"
    s = s.replace(/\b(?:bmw\s+)?m([1-8])\b/gi, 'BMW M$1');
    s = s.replace(/\b(?:bmw)\b/gi, 'BMW');
    s = s.replace(/\bBMW\s+BMW\b/g, 'BMW');

    // Porsche models
    s = s.replace(/\bporsche\s+911\b/gi, 'Porsche 911');
    s = s.replace(/\b911\b/gi, 'Porsche 911');
    s = s.replace(/\bPorsche\s+Porsche\s+911\b/g, 'Porsche 911');

    // Other exotic and performance brands
    s = s.replace(/\blambo\b/gi, 'Lamborghini');
    s = s.replace(/\blamborghini\b/gi, 'Lamborghini');
    s = s.replace(/\bferrari\b/gi, 'Ferrari');
    s = s.replace(/\bchevy\b/gi, 'Chevrolet');
    s = s.replace(/\bvette\b/gi, 'Corvette');
    s = s.replace(/\b(?:audi\s+)?rs([3-7])\b/gi, 'Audi RS$1');
    s = s.replace(/\b(?:nissan\s+)?gt-?r\b/gi, 'Nissan GT-R');

    // Title case if single word or standard capitalized entity
    if (!/^[A-Z]/.test(s)) {
        s = s.charAt(0).toUpperCase() + s.slice(1);
    }

    return s.replace(/\s+/g, ' ').trim();
}

/**
 * Creates an expert, model-accurate FLUX image generation prompt
 * Automatically converts user request into detailed visual instructions
 * while preserving all core entities, colors, locations, and time of day.
 * @param {object} parsed
 * @returns {string}
 */
function createHighQualityPrompt(parsed) {
    const { coreEntity, color, location, timeAtmosphere } = parsed;

    const colorDesc = color ? `${color} finish` : 'glossy metallic finish';
    const locDesc = location ? `in ${location}` : 'in a luxury modern architectural pavilion';
    const timeDesc = timeAtmosphere ? ` ${timeAtmosphere}` : '';
    const envDesc = `set ${locDesc}${timeDesc}`;
    const envSuffix = (location || timeAtmosphere) ? `, set ${locDesc}${timeDesc}` : '';

    // 1. SPECIFIC BMW M5 / M5 COMPETITION
    if (/BMW M5/i.test(coreEntity)) {
        const isComp = /Competition/i.test(coreEntity);
        if (isComp) {
            return `Create a photorealistic image of a ${color ? `${color} ` : ''}BMW M5 Competition${envSuffix}. Accurately depict the BMW M5 Competition as a high-performance sports sedan with authentic BMW M5 Competition silhouette, aggressive M-specific styling, distinctive high-gloss black double-slat kidney grille, official M5 Competition badging, M quad exhaust system, carbon-fiber roof, sculpted M performance mirrors, precision forged M alloy wheels, realistic body details, and realistic lighting. Front three-quarter dynamic beauty shot, cinematic professional automotive photography, highly detailed, realistic materials and reflections. Do not substitute another BMW model or standard 5 Series sedan.`;
        }

        return `Create a photorealistic image of a ${color ? `${color} ` : ''}BMW M5${envSuffix}. Accurately depict the BMW M5 as a high-performance sports sedan with correct BMW M5 proportions, aggressive M-specific styling, distinctive kidney grille, M badging, performance wheels, realistic body details and lighting. Front three-quarter dynamic beauty shot, cinematic professional automotive photography, highly detailed, realistic materials and reflections. Do not substitute another BMW model.`;
    }

    // 2. OTHER SPECIFIC BMW MODELS (M2, M3, M4, M8, etc.)
    if (/BMW M[1-8]/i.test(coreEntity)) {
        return `Create a photorealistic image of a ${color ? `${color} ` : ''}${coreEntity}${envSuffix}. Accurately depict the ${coreEntity} as a high-performance sports vehicle with authentic ${coreEntity} proportions, signature BMW kidney grille, official M badging, aggressive aerodynamic body contours, performance wheels, and realistic automotive lighting. Front three-quarter dynamic angle, cinematic professional automotive photography, 8k resolution, razor-sharp reflections. Do not substitute another model.`;
    }

    // 3. MERCEDES-AMG GT / MERCEDES-AMG
    if (/Mercedes-AMG/i.test(coreEntity)) {
        const isGt = /GT/i.test(coreEntity);
        const specificDetails = isGt
            ? 'authentic low-slung wide fastback coupe stance, signature Panamericana vertical-slat grille, active aerodynamic rear spoiler, large front air intakes, AMG twin-tailpipe exhaust, precision AMG performance wheels,'
            : 'authentic sculpted aerodynamic body lines, signature AMG sports grille, quad exhaust, precision AMG performance wheels,';

        return `Create a photorealistic image of a ${color ? `${color} ` : ''}${coreEntity}${envSuffix}. Accurately depict the ${specificDetails} premium metallic finish, realistic reflections, and dramatic lighting. Front three-quarter dynamic shot, cinematic automotive photography, 8k resolution, razor-sharp focus. Do not substitute a generic Mercedes.`;
    }

    // 4. MERCEDES-BENZ (When user requests "Mercedes")
    if (/Mercedes-Benz/i.test(coreEntity)) {
        return `Create a photorealistic image of a ${color ? `${color} ` : ''}Mercedes-Benz luxury vehicle${envSuffix}. Accurately depict the authentic Mercedes-Benz with iconic star-centered chrome grille, elegant sculpted aerodynamic body lines, sophisticated LED headlights, luxury alloy wheels, and pristine glossy finish with realistic environment reflections. Front three-quarter beauty view, cinematic professional automotive photography, dramatic lighting, 8k resolution. Do not substitute a generic vehicle.`;
    }

    // 5. PORSCHE 911
    if (/Porsche 911/i.test(coreEntity)) {
        return `Create a photorealistic image of a ${color ? `${color} ` : ''}Porsche 911${envSuffix}. Accurately depict the iconic rear-engine coupe silhouette, signature round LED matrix headlights, wide muscular rear fenders, authentic Porsche crest, and precision performance wheels. Front three-quarter beauty view, cinematic professional automotive photography, realistic reflections, 8k resolution, razor-sharp detail. Do not substitute a generic sports car.`;
    }

    // 6. FERRARI
    if (/Ferrari/i.test(coreEntity)) {
        const cDesc = color ? `${color} finish` : 'iconic Rosso Corsa red';
        return `Create a photorealistic image of a Ferrari in ${cDesc}${envSuffix}. Accurately depict the exotic Italian supercar with authentic aerodynamic sculpting, signature prancing horse badge, aggressive front splitter, performance alloy wheels, and glossy finish. Front three-quarter dynamic view, professional automotive photography, dramatic lighting, 8k resolution.`;
    }

    // 7. LAMBORGHINI
    if (/Lamborghini/i.test(coreEntity)) {
        return `Create a photorealistic image of a ${color ? `${color} ` : ''}Lamborghini${envSuffix}. Accurately depict the sharp, aggressive angular wedge design, signature Y-shaped LED lights, raging bull badge, wide performance stance, and realistic reflections. Front three-quarter view, cinematic supercar photography, 8k resolution.`;
    }

    // 8. SPORTS CAR / SUPERCAR
    if (/\b(sports?\s*cars?|supercars?|hypercars?)\b/i.test(coreEntity)) {
        const cDesc = color ? `${color} finish` : 'glossy metallic finish';
        return `Create a photorealistic, stunning image of a high-performance ${coreEntity} in ${cDesc}${envSuffix}. Low-slung aerodynamic silhouette, aggressive front air intakes, sculpted side air ducts, high-performance alloy wheels, and sleek LED headlights. Professional automotive studio photography, front three-quarter beauty angle, dramatic rim lighting, crystal-clear reflections, 8k resolution, razor-sharp detail.`;
    }

    // 9. GENERAL CAR / VEHICLE (car, sedan, coupe, suv, motorcycle)
    if (/\b(cars?|sedans?|coupes?|suvs?|luxury\s*cars?|vehicles?|motorcycles?)\b/i.test(coreEntity)) {
        const cDesc = color ? `${color} finish` : 'glossy metallic finish';
        return `Create a photorealistic, stunning image of a ${coreEntity} in ${cDesc}${envSuffix}. Front three-quarter beauty shot, accurate vehicle proportions, sleek metallic bodywork with realistic environment reflections, crisp LED headlights, and elegant alloy wheels. Professional automotive studio photography, dramatic lighting, 8k resolution.`;
    }

    // 10. DOG / PUPPY
    if (/\b(dogs?|pupp(?:y|ies)|canine|golden\s*retriever|husky|german\s*shepherd|labrador)\b/i.test(coreEntity)) {
        const cDesc = color ? `${color} coat, ` : '';
        return `Create a high-quality, heartwarming professional photograph of a ${coreEntity} with ${cDesc}alert and expressive luminous eyes, fine detailed fur texture, and healthy natural anatomy. Soft ambient natural golden hour lighting, beautiful shallow depth of field with a gently blurred scenic outdoor background${envSuffix}, crystal-clear 8k resolution, award-winning animal photography.`;
    }

    // 11. CAT / KITTEN
    if (/\b(cats?|kittens?|feline)\b/i.test(coreEntity)) {
        const cDesc = color ? `${color} coat, ` : '';
        return `Create a high-quality, adorable professional photograph of a ${coreEntity} with ${cDesc}fine whiskered details, soft lifelike fur texture, captivating luminous eyes, soft ambient natural lighting, shallow depth of field, 8k resolution.`;
    }

    // 12. MOUNTAIN / LANDSCAPE
    if (/\b(mountains?|peaks?|alps|himalayas|landscape)\b/i.test(coreEntity)) {
        return `Create a majestic, breathtaking landscape photograph of a towering ${coreEntity}${envSuffix}. Grand snow-dusted alpine summits, rugged geological rock textures, dramatic atmospheric clouds rolling across the ridges, and radiant sunlight illuminating the mountain face. Wide-angle cinematic composition, immense volumetric depth, pristine natural beauty, ultra-detailed 8k resolution, award-winning landscape photography.`;
    }

    // 13. SUNSET / SUNRISE
    if (/\b(sunsets?|sunrises?|dusk|dawn)\b/i.test(coreEntity)) {
        return `Create a breathtaking, cinematic landscape photograph of a glorious ${coreEntity}${envSuffix}. Vibrant sky with warm golden, amber, and violet gradients, radiant sunbeams piercing through scattered clouds, casting long atmospheric shadows and rich golden reflections. Stunning dynamic range, 8k resolution, award-winning fine art landscape photography.`;
    }

    // 14. FUTURISTIC CITY / CYBERPUNK
    if (/\b(futuristic\s+city|cyberpunk\s+city|cyberpunk|sci-?fi\s+city|neon\s+city)\b/i.test(coreEntity)) {
        return `Create a visually stunning, cinematic image of a hyper-advanced ${coreEntity}${envSuffix}. Soaring architectural megastructures with intricate skybridges, luminous holographic neon advertisements, glowing transit corridors with sleek aerodynamic vehicles, atmospheric misty haze, and wet street reflections. Rich volumetric lighting, epic scale, 8k resolution, science fiction concept art masterpiece.`;
    }

    // 15. PORTRAIT / PEOPLE
    if (/\b(portraits?|persons?|people|wom[ae]n|m[ae]n|girls?|boys?)\b/i.test(coreEntity)) {
        return `Create a high-quality, professional portrait photograph of a ${coreEntity}${envSuffix}. Natural anatomical proportions, realistic skin texture with subtle pores, lifelike expressive eyes, natural hair strands, and flattering studio portrait lighting. Shallow depth of field, 8k resolution, razor-sharp focus.`;
    }

    // 16. GENERAL HIGH-QUALITY EXPANSION
    return `Create a photorealistic, stunning image of ${color ? `${color} ` : ''}${coreEntity}${envSuffix}. Centered dynamic composition, authentic details, realistic textures, cinematic lighting, high contrast, crystal-clear 8k resolution, razor-sharp focus, award-winning photography.`;
}

function transformToHighQualityPrompt(userSubject) {
    const parsed = normalizeSubjectAndConstraints(userSubject);
    return createHighQualityPrompt(parsed);
}

module.exports = {
    isImageGenerationRequest,
    extractImagePrompt,
    normalizeSubjectAndConstraints,
    createHighQualityPrompt,
    transformToHighQualityPrompt,
};

