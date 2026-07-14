# Uma Chatbot

Uma is a polished AI chatbot web app powered by an Express server and the Gemini or Groq API. It also includes a demo mode, so the interface works locally even before an API key is configured.

## Features

- Attractive responsive chat UI
- Quick prompt buttons
- Clear chat support
- Local chat history with `localStorage`
- Express `/api/chat` endpoint
- Gemini or Groq integration
- Automatic fallback between providers on overload/quota errors
- Demo responses when no API key is present

## Project Structure

```text
uma-chatbot/
  public/
    index.html
    style.css
    script.js
  src/
    app.js
    services/
      chatApi.js
      geminiApi.js
      groqApi.js
    utils/
      config.js
  .env.example
  package.json
```

## Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file from `.env.example`:

```bash
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3002
```

Set `AI_PROVIDER` to `groq` or `gemini`. If the primary provider fails with quota/overload errors, Uma automatically tries the other one when its key is configured.

Start the server:

```bash
npm start
```

Open the app:

```text
http://localhost:3002
```

## Notes

If no API keys are configured, Uma runs in demo mode with local fallback replies. Add a `GROQ_API_KEY` or `GEMINI_API_KEY` to get live AI responses.

Open Uma through the Express server URL above. Opening `public/index.html` directly or through VS Code Live Server will load the page, but `/api/chat` will not point at Uma's backend.
