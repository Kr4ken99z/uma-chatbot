function createDemoReply(message) {
    const cleanedMessage = message.toLowerCase();

    if (cleanedMessage.includes('java')) {
        return 'Demo mode: A strong Java portfolio project would combine Spring Boot, MySQL, authentication, and a clean dashboard UI. Add API docs and screenshots to make it recruiter-friendly.';
    }

    if (cleanedMessage.includes('rest') || cleanedMessage.includes('api')) {
        return 'Demo mode: A REST API lets your frontend and backend communicate using HTTP methods like GET, POST, PUT, and DELETE. In Spring Boot, each endpoint maps to a controller method.';
    }

    if (cleanedMessage.includes('project')) {
        return 'Demo mode: Describe projects with this structure: problem, your solution, tech stack, key features, and measurable impact. That makes your work feel real and professional.';
    }

    return `Demo mode: I can respond locally while you set up an AI provider. You asked: "${message}". Add GEMINI_API_KEY or GROQ_API_KEY in your .env file to get live AI responses.`;
}

async function streamDemoReply(message, onChunk) {
    const reply = createDemoReply(message);
    const chunks = chunkText(reply, 32);

    for (const chunk of chunks) {
        await delay(35);
        onChunk(chunk);
    }
}

function chunkText(text, size) {
    const chunks = [];

    for (let index = 0; index < text.length; index += size) {
        chunks.push(text.slice(index, index + size));
    }

    return chunks.length ? chunks : [''];
}

function delay(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

module.exports = {
    createDemoReply,
    streamDemoReply,
};
