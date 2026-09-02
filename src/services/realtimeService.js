// Lightweight, 100% free, no-key-required live weather and timezone service

const WMO_WEATHER_CODES = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
};

// Common city / place keywords detection regex
const WEATHER_TIME_REGEX = /\b(weather|temperature|temp|climate|humidity|rain|raining|forecast|time|clock)\b/i;

function extractPotentialLocation(query) {
    const cleaned = query
        .replace(/[?.,!]/g, '')
        .replace(/\b(what|is|the|current|right|now|today|tonight|tell|me|how|hot|cold|like|in|of|at|for|please)\b/gi, ' ')
        .replace(/\b(weather|temperature|temp|climate|time)\b/gi, ' ')
        .trim();

    const parts = cleaned.split(/\s+/).filter(p => p.length > 2);
    return parts.length > 0 ? parts[parts.length - 1] : null;
}

async function getLiveContextIfApplicable(userMessage) {
    if (!WEATHER_TIME_REGEX.test(userMessage)) {
        return null;
    }

    const locationName = extractPotentialLocation(userMessage);
    if (!locationName) return null;

    try {
        // 1. Geocode location via Open-Meteo
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`;
        const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(2500) });
        if (!geoRes.ok) return null;

        const geoData = await geoRes.json();
        const place = geoData?.results?.[0];
        if (!place) return null;

        const { name, country, latitude, longitude, timezone } = place;

        // 2. Fetch live weather & local time
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
        const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(2500) });
        if (!weatherRes.ok) return null;

        const weatherData = await weatherRes.json();
        const cur = weatherData?.current;
        if (!cur) return null;

        // Calculate formatted local time for the place's timezone
        let localTimeString = '';
        try {
            const placeTz = timezone || 'UTC';
            localTimeString = new Intl.DateTimeFormat('en-US', {
                timeZone: placeTz,
                dateStyle: 'full',
                timeStyle: 'short',
            }).format(new Date());
        } catch {
            localTimeString = cur.time || 'N/A';
        }

        const condition = WMO_WEATHER_CODES[cur.weather_code] || 'Fair';

        return `[VERIFIED LIVE REAL-TIME TELEMETRY]:
- Place: ${name}, ${country || ''}
- Local Date & Time: ${localTimeString}
- Temperature: ${cur.temperature_2m}°C (Feels like ${cur.apparent_temperature}°C)
- Condition: ${condition}
- Humidity: ${cur.relative_humidity_2m}%
- Wind: ${cur.wind_speed_10m} km/h
(Uma: Use these exact live numbers to answer the user's question directly, accurately, and naturally!)`;
    } catch {
        return null;
    }
}

module.exports = {
    getLiveContextIfApplicable,
};
