const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearChat = document.getElementById('clearChat');
const newChat = document.getElementById('newChat');
const historyList = document.getElementById('historyList');
const connectionStatus = document.getElementById('connectionStatus');
const aboutUma = document.getElementById('aboutUma');
const aboutModal = document.getElementById('aboutModal');
const aboutBackdrop = document.getElementById('aboutBackdrop');
const closeAbout = document.getElementById('closeAbout');
const quickPrompts = document.querySelectorAll('[data-prompt]');

const LEGACY_STORAGE_KEY = 'uma-chat-history';
const CONVERSATIONS_KEY = 'uma-chat-conversations';
const ACTIVE_CHAT_KEY = 'uma-active-chat';
const welcomeMessage = {
    role: 'bot',
    text: "Hi, I'm Uma. Ask me anything and I'll answer step by step.",
};
const quickPromptPool = [
    {
        label: 'Java ideas',
        prompt: 'Give me 3 Java project ideas for my portfolio.',
    },
    {
        label: 'REST API',
        prompt: 'Explain REST API in simple words.',
    },
    {
        label: 'Project text',
        prompt: 'Help me write a professional project description.',
    },
    {
        label: 'Debug help',
        prompt: 'Help me debug a JavaScript error step by step.',
    },
    {
        label: 'DSA plan',
        prompt: 'Create a 7-day DSA practice plan for interviews.',
    },
    {
        label: 'SQL basics',
        prompt: 'Explain SQL joins with a simple example.',
    },
    {
        label: 'Resume line',
        prompt: 'Turn my project into one strong resume bullet point.',
    },
    {
        label: 'Git help',
        prompt: 'Explain the difference between git merge and git rebase.',
    },
    {
        label: 'Spring Boot',
        prompt: 'Suggest a Spring Boot feature I can add to my project.',
    },
];

let conversations = loadConversations();
let activeChatId = loadActiveChatId();

if (!getActiveConversation()) {
    activeChatId = conversations[0]?.id || createConversation().id;
}

randomizeQuickPrompts();
renderHistory();
renderMessages();
autoResizeInput();
focusMessageInput();

chatForm.addEventListener('submit', async event => {
    event.preventDefault();

    const text = messageInput.value.trim();
    if (!text) {
        return;
    }

    messageInput.value = '';
    autoResizeInput();
    addMessage('user', text);
    await askUma(text);
});

messageInput.addEventListener('input', autoResizeInput);

messageInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        chatForm.requestSubmit();
    }
});

newChat.addEventListener('click', () => {
    createConversation();
    renderHistory();
    renderMessages();
    focusMessageInput();
});

clearChat.addEventListener('click', () => {
    clearAllHistory();
    focusMessageInput();
});

aboutUma.addEventListener('click', openAboutModal);
closeAbout.addEventListener('click', closeAboutModal);
aboutBackdrop.addEventListener('click', closeAboutModal);

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !aboutModal.hidden) {
        closeAboutModal();
    }
});

quickPrompts.forEach(button => {
    button.addEventListener('click', () => {
        messageInput.value = button.dataset.prompt;
        autoResizeInput();
        messageInput.focus();
    });
});

function loadConversations() {
    try {
        const savedConversations = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY));

        if (Array.isArray(savedConversations) && savedConversations.length) {
            return savedConversations.map(normalizeConversation);
        }
    } catch {
        // Use migration fallback below.
    }

    const legacyConversation = loadLegacyConversation();

    if (legacyConversation) {
        return [legacyConversation];
    }

    return [createBlankConversation()];
}

function loadActiveChatId() {
    return localStorage.getItem(ACTIVE_CHAT_KEY) || conversations[0]?.id || '';
}

function loadLegacyConversation() {
    try {
        const legacyMessages = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));

        if (Array.isArray(legacyMessages) && legacyMessages.length) {
            return normalizeConversation({
                id: createId(),
                title: createTitle(legacyMessages),
                messages: legacyMessages,
                updatedAt: Date.now(),
            });
        }
    } catch {
        return null;
    }

    return null;
}

function normalizeConversation(conversation) {
    const messages = Array.isArray(conversation.messages) && conversation.messages.length
        ? conversation.messages
        : [createWelcomeMessage()];

    return {
        id: conversation.id || createId(),
        title: conversation.title || createTitle(messages),
        messages,
        updatedAt: Number(conversation.updatedAt) || Date.now(),
    };
}

function createBlankConversation() {
    return {
        id: createId(),
        title: 'New chat',
        messages: [createWelcomeMessage()],
        updatedAt: Date.now(),
    };
}

function createConversation(options = {}) {
    const { shouldSave = true } = options;
    const conversation = createBlankConversation();

    conversations.unshift(conversation);
    activeChatId = conversation.id;

    if (shouldSave) {
        saveConversations();
    }

    return conversation;
}

function createWelcomeMessage() {
    return { ...welcomeMessage };
}

function createId() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }

    return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getActiveConversation() {
    return conversations.find(conversation => conversation.id === activeChatId);
}

function saveConversations() {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
}

function clearAllHistory() {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(CONVERSATIONS_KEY);
    localStorage.removeItem(ACTIVE_CHAT_KEY);

    conversations = [createBlankConversation()];
    activeChatId = conversations[0].id;
    saveConversations();
    renderHistory();
    renderMessages();
}

function openAboutModal() {
    aboutModal.hidden = false;
    aboutBackdrop.hidden = false;
    document.body.classList.add('modal-open');
    closeAbout.focus();
}

function closeAboutModal() {
    aboutModal.hidden = true;
    aboutBackdrop.hidden = true;
    document.body.classList.remove('modal-open');
    aboutUma.focus();
}

function focusMessageInput() {
    const hasDesktopWidth = window.innerWidth >= 760;
    const canAutoFocus = !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (hasDesktopWidth && canAutoFocus) {
        messageInput.focus();
    }
}

function randomizeQuickPrompts() {
    const prompts = shufflePrompts(quickPromptPool);

    quickPrompts.forEach((button, index) => {
        const prompt = prompts[index];

        button.textContent = prompt.label;
        button.dataset.prompt = prompt.prompt;
        button.title = prompt.prompt;
    });
}

function shufflePrompts(prompts) {
    const shuffledPrompts = [...prompts];

    for (let index = shuffledPrompts.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [shuffledPrompts[index], shuffledPrompts[randomIndex]] = [shuffledPrompts[randomIndex], shuffledPrompts[index]];
    }

    return shuffledPrompts;
}

function renderHistory() {
    historyList.innerHTML = '';

    const sortedConversations = [...conversations].sort((first, second) => second.updatedAt - first.updatedAt);

    if (!sortedConversations.length) {
        const emptyHistory = document.createElement('p');
        emptyHistory.className = 'empty-history';
        emptyHistory.textContent = 'No conversations yet.';
        historyList.appendChild(emptyHistory);
        return;
    }

    sortedConversations.forEach(conversation => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `history-item${conversation.id === activeChatId ? ' active' : ''}`;
        item.textContent = conversation.title;
        item.title = conversation.title;
        item.addEventListener('click', () => {
            activeChatId = conversation.id;
            saveConversations();
            renderHistory();
            renderMessages();
            focusMessageInput();
        });

        historyList.appendChild(item);
    });
}

function addMessage(role, text) {
    const conversation = getActiveConversation() || createConversation();
    const message = { role, text };

    conversation.messages.push(message);
    conversation.updatedAt = Date.now();

    if (role === 'user' && conversation.title === 'New chat') {
        conversation.title = createTitle(conversation.messages);
    }

    saveConversations();
    renderHistory();
    renderMessages();

    return message;
}

async function askUma(message) {
    setLoading(true);
    const typingId = addTypingIndicator();
    let botMessage = null;
    let botText = null;

    const ensureBotMessage = () => {
        if (!botMessage) {
            removeTypingIndicator(typingId);
            botMessage = addMessage('bot', '');
            botText = chatMessages.lastElementChild?.querySelector('.message-text');
        }

        return { botMessage, botText };
    };

    try {
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Uma could not respond right now.');
        }

        connectionStatus.textContent = 'Online';
        await streamUmaResponse(response, ensureBotMessage);
    } catch (error) {
        removeTypingIndicator(typingId);
        connectionStatus.textContent = 'Needs attention';

        const errorText = `${error.message} Check your Gemini API key and server logs.`;

        if (botMessage) {
            updateStreamingMessage(botMessage, botText, errorText);
        } else {
            addMessage('bot', errorText);
        }
    } finally {
        setLoading(false);
        renderHistory();
    }
}

async function streamUmaResponse(response, ensureBotMessage) {
    if (!response.body) {
        throw new Error('Streaming is not supported in this browser.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedChunk = false;

    while (true) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';

        events.forEach(event => {
            receivedChunk = handleStreamEvent(event, ensureBotMessage) || receivedChunk;
        });
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
        receivedChunk = handleStreamEvent(buffer, ensureBotMessage) || receivedChunk;
    }

    if (!receivedChunk) {
        const { botMessage, botText } = ensureBotMessage();
        updateStreamingMessage(botMessage, botText, 'I received your message, but Uma returned an empty response.');
    }
}

function handleStreamEvent(event, ensureBotMessage) {
    const parsedEvent = parseStreamEvent(event);

    if (!parsedEvent) {
        return false;
    }

    if (parsedEvent.eventName === 'error') {
        throw new Error(parsedEvent.data.error || 'Uma could not respond right now.');
    }

    if (parsedEvent.eventName === 'done') {
        connectionStatus.textContent = parsedEvent.data.isMock ? 'Demo mode' : 'Online';
        return false;
    }

    if (parsedEvent.eventName !== 'chunk' || !parsedEvent.data.chunk) {
        return false;
    }

    const { botMessage, botText } = ensureBotMessage();
    updateStreamingMessage(botMessage, botText, botMessage.text + parsedEvent.data.chunk);

    return true;
}

function parseStreamEvent(event) {
    const lines = event.split(/\r?\n/);
    const dataLines = [];
    let eventName = 'message';

    lines.forEach(line => {
        if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
        }

        if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
        }
    });

    if (!dataLines.length) {
        return null;
    }

    const dataText = normalizeStreamData(dataLines.join('\n'));

    if (dataText === '[DONE]') {
        return {
            eventName: 'done',
            data: {},
        };
    }

    return {
        eventName,
        data: JSON.parse(dataText),
    };
}

function normalizeStreamData(dataText) {
    let normalizedData = dataText.trim();

    while (normalizedData.startsWith('data:')) {
        normalizedData = normalizedData.slice(5).trimStart();
    }

    return normalizedData;
}

function updateStreamingMessage(message, textElement, text) {
    const conversation = getActiveConversation();

    message.text = text;

    if (conversation) {
        conversation.updatedAt = Date.now();
    }

    if (textElement) {
        textElement.textContent = text;
    }

    saveConversations();
    scrollToBottom();
}

function renderMessages() {
    const conversation = getActiveConversation() || createConversation();

    chatMessages.innerHTML = '';
    conversation.messages.forEach(message => {
        chatMessages.appendChild(createMessageElement(message.role, message.text));
    });

    scrollToBottom();
}

function createMessageElement(role, text) {
    const item = document.createElement('article');
    item.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'You' : 'U';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const messageText = document.createElement('span');
    messageText.className = 'message-text';
    messageText.textContent = text;

    const meta = document.createElement('span');
    meta.className = 'message-meta';
    meta.textContent = role === 'user' ? 'You' : 'Uma';
    bubble.append(messageText, meta);

    item.append(avatar, bubble);
    return item;
}

function addTypingIndicator() {
    const id = `typing-${Date.now()}`;
    const item = document.createElement('article');
    item.className = 'message bot';
    item.id = id;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'U';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';

    item.append(avatar, bubble);
    chatMessages.appendChild(item);
    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    document.getElementById(id)?.remove();
}

function setLoading(isLoading) {
    sendBtn.disabled = isLoading;
    messageInput.disabled = isLoading;
    sendBtn.querySelector('span').textContent = isLoading ? '...' : '->';
}

function createTitle(messages) {
    const firstUserMessage = messages.find(message => message.role === 'user')?.text || 'New chat';
    return firstUserMessage.length > 34 ? `${firstUserMessage.slice(0, 34)}...` : firstUserMessage;
}

function autoResizeInput() {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 170)}px`;
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
