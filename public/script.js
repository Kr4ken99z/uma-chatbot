/**
 * Uma Chatbot — Application Logic
 * Supports real-time streaming, conversation history, dark/paper theme toggle,
 * collapsible sidebar, prompt pools, and modal management.
 */

// DOM References
const shell = document.getElementById('shell');
const sidebarToggle = document.getElementById('sidebarToggle');
const newChat = document.getElementById('newChat');
const clearChat = document.getElementById('clearChat');
const historyList = document.getElementById('historyList');
const promptsList = document.getElementById('promptsList');
const welcomeView = document.getElementById('welcomeView');
const welcomeCards = document.getElementById('welcomeCards');
const chatMessages = document.getElementById('chatMessages');
const messagesFlow = document.getElementById('messagesFlow');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearInputBtn = document.getElementById('clearInputBtn');
const statusDot = document.getElementById('statusDot');
const connectionStatus = document.getElementById('connectionStatus');
const streamStatus = document.getElementById('streamStatus');
const providerBadge = document.getElementById('providerBadge');
const shortcutBadge = document.getElementById('shortcutBadge');
const toast = document.getElementById('toast');

// Quick Toolbar Elements
const toolNew = document.getElementById('toolNew');
const toolFocus = document.getElementById('toolFocus');
const toolTheme = document.getElementById('toolTheme');
const toolAbout = document.getElementById('toolAbout');

// About Modal Elements
const aboutUma = document.getElementById('aboutUma');
const aboutModal = document.getElementById('aboutModal');
const aboutBackdrop = document.getElementById('aboutBackdrop');
const closeAbout = document.getElementById('closeAbout');

// Storage Keys
const CONVERSATIONS_KEY = 'uma-chat-conversations';
const ACTIVE_CHAT_KEY = 'uma-active-chat';
const THEME_KEY = 'uma-theme-preference';
const SIDEBAR_KEY = 'uma-sidebar-state';
const LEGACY_STORAGE_KEY = 'uma-chat-history';

// Prompt Pool
const promptPool = [
    { icon: '⌘', label: 'Java ideas', prompt: 'Give me 3 Java project ideas for my portfolio with modern tech stack.' },
    { icon: '◌', label: 'REST API', prompt: 'Explain REST API principles in simple words with examples.' },
    { icon: '✎', label: 'Project text', prompt: 'Help me write a concise, professional project description for my resume.' },
    { icon: '⚡', label: 'DSA practice', prompt: 'Create a structured 7-day DSA preparation plan for technical interviews.' },
    { icon: '✦', label: 'Clean code', prompt: 'What are the top principles for writing maintainable, clean code in JavaScript and Python?' },
    { icon: '◈', label: 'System design', prompt: 'Explain how a rate limiter works under high concurrency.' },
    { icon: '✎', label: 'Git help', prompt: 'Explain the difference between git merge and git rebase with clean diagrams.' },
    { icon: '◌', label: 'SQL joins', prompt: 'Explain SQL inner join, left join, and full outer join with a concrete example.' },
];

let conversations = loadConversations();
let activeChatId = loadActiveChatId();
let isGenerating = false;
let toastTimeout = null;

// Initialize Application
initShortcuts();
initSidebarState();
initTheme();
renderPrompts();
renderHistory();
renderMessages();
autoResizeInput();
checkHealth();
focusInput();

// Event Listeners
chatForm.addEventListener('submit', handleFormSubmit);
messageInput.addEventListener('input', () => {
    autoResizeInput();
    updateClearInputButtonVisibility();
});

messageInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        chatForm.requestSubmit();
    }
});

clearInputBtn.addEventListener('click', () => {
    messageInput.value = '';
    autoResizeInput();
    updateClearInputButtonVisibility();
    messageInput.focus();
});

newChat.addEventListener('click', () => {
    startNewConversation();
});

clearChat.addEventListener('click', () => {
    if (confirm('Clear all stored conversations? This cannot be undone.')) {
        clearAllHistory();
        showToast('All conversations cleared');
    }
});

sidebarToggle.addEventListener('click', toggleSidebar);

// Toolbar buttons
toolNew.addEventListener('click', () => {
    startNewConversation();
    showToast('New conversation started');
});

toolFocus.addEventListener('click', () => {
    focusInput();
    showToast('Composer focused');
});

toolTheme.addEventListener('click', () => {
    toggleTheme();
});

toolAbout.addEventListener('click', () => {
    openAboutModal();
});

// Modal handlers
aboutUma.addEventListener('click', openAboutModal);
closeAbout.addEventListener('click', closeAboutModal);
aboutBackdrop.addEventListener('click', closeAboutModal);

document.addEventListener('keydown', event => {
    // Escape closes modal
    if (event.key === 'Escape' && !aboutModal.hidden) {
        closeAboutModal();
    }

    // Ctrl+K or Cmd+K creates a new chat
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        startNewConversation();
        showToast('New conversation started');
    }
});

// Welcome Cards Click Handlers
welcomeCards.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
        const prompt = card.dataset.prompt;
        if (prompt) {
            messageInput.value = prompt;
            autoResizeInput();
            updateClearInputButtonVisibility();
            messageInput.focus();
        }
    });
});

// -----------------------------------------------------------------------------
// Core Actions & Submission
// -----------------------------------------------------------------------------

async function handleFormSubmit(event) {
    event.preventDefault();

    if (isGenerating) {
        return;
    }

    const text = messageInput.value.trim();
    if (!text) {
        return;
    }

    messageInput.value = '';
    autoResizeInput();
    updateClearInputButtonVisibility();

    // Add user message to state
    addMessage('user', text);
    hideWelcomeView();

    await streamUmaResponse(text);
}

function startNewConversation() {
    createConversation();
    renderHistory();
    renderMessages();
    focusInput();
}

function hideWelcomeView() {
    welcomeView.style.display = 'none';
    messagesFlow.style.display = 'flex';
}

function showWelcomeView() {
    welcomeView.style.display = 'block';
    messagesFlow.style.display = 'none';
    messagesFlow.innerHTML = '';
}

// -----------------------------------------------------------------------------
// Streaming Communication with Backend
// -----------------------------------------------------------------------------

async function streamUmaResponse(userPrompt) {
    setLoading(true);
    const typingId = addTypingIndicator();
    let botMessage = null;
    let botTextElement = null;

    const ensureBotMessage = () => {
        if (!botMessage) {
            removeTypingIndicator(typingId);
            botMessage = addMessage('bot', '');
            const lastMessage = messagesFlow.lastElementChild;
            botTextElement = lastMessage ? lastMessage.querySelector('.bubble') : null;
        }
        return { botMessage, botTextElement };
    };

    try {
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: userPrompt }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Uma could not respond right now.');
        }

        updateStatus(true, 'Online');

        if (!response.body) {
            throw new Error('Streaming not supported by browser.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let receivedChunk = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() || '';

            for (const evt of events) {
                const handled = handleStreamEvent(evt, ensureBotMessage);
                if (handled) receivedChunk = true;
            }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
            const handled = handleStreamEvent(buffer, ensureBotMessage);
            if (handled) receivedChunk = true;
        }

        if (!receivedChunk) {
            const { botMessage: msg, botTextElement: txtEl } = ensureBotMessage();
            updateStreamingMessage(msg, txtEl, 'I received your message, but Uma returned an empty response.');
        }

    } catch (error) {
        removeTypingIndicator(typingId);
        updateStatus(false, 'Offline / Error');

        const errorMsg = `${error.message} Check server configuration or API keys.`;
        if (botMessage) {
            updateStreamingMessage(botMessage, botTextElement, errorMsg);
        } else {
            addMessage('bot', errorMsg);
        }
    } finally {
        setLoading(false);
        renderHistory();
    }
}

function handleStreamEvent(eventText, ensureBotMessage) {
    const parsed = parseStreamEvent(eventText);
    if (!parsed) return false;

    if (parsed.eventName === 'error') {
        throw new Error(parsed.data.error || 'Uma encountered an error.');
    }

    if (parsed.eventName === 'done') {
        if (parsed.data.isMock) {
            providerBadge.textContent = 'DEMO';
            connectionStatus.textContent = 'Demo mode';
        }
        return false;
    }

    if (parsed.eventName !== 'chunk' || !parsed.data.chunk) {
        return false;
    }

    const { botMessage, botTextElement } = ensureBotMessage();
    updateStreamingMessage(botMessage, botTextElement, botMessage.text + parsed.data.chunk);
    return true;
}

function parseStreamEvent(eventText) {
    const lines = eventText.split(/\r?\n/);
    const dataLines = [];
    let eventName = 'message';

    for (const line of lines) {
        if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
        }
        if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
        }
    }

    if (!dataLines.length) return null;

    let joined = dataLines.join('\n').trim();
    while (joined.startsWith('data:')) {
        joined = joined.slice(5).trimStart();
    }

    if (joined === '[DONE]') {
        return { eventName: 'done', data: {} };
    }

    try {
        return { eventName, data: JSON.parse(joined) };
    } catch {
        return null;
    }
}

function updateStreamingMessage(messageObj, textElement, text) {
    const conversation = getActiveConversation();
    messageObj.text = text;

    if (conversation) {
        conversation.updatedAt = Date.now();
    }

    if (textElement) {
        textElement.textContent = text;
    }

    saveConversations();
    scrollToBottom();
}

function addTypingIndicator() {
    const id = `typing-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'uma-message';
    row.id = id;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'U';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';

    row.append(avatar, bubble);
    messagesFlow.appendChild(row);
    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    const element = document.getElementById(id);
    if (element) element.remove();
}

function setLoading(isLoading) {
    isGenerating = isLoading;
    sendBtn.disabled = isLoading;
    messageInput.disabled = isLoading;

    if (isLoading) {
        streamStatus.classList.add('active');
        sendBtn.querySelector('span').textContent = 'Thinking...';
    } else {
        streamStatus.classList.remove('active');
        sendBtn.querySelector('span').textContent = 'Send';
        focusInput();
    }
}

// -----------------------------------------------------------------------------
// Message Rendering
// -----------------------------------------------------------------------------

function renderMessages() {
    const conversation = getActiveConversation() || createConversation();
    const userMessages = (conversation.messages || []).filter(m => m.role === 'user');

    if (!userMessages.length) {
        showWelcomeView();
        return;
    }

    hideWelcomeView();
    messagesFlow.innerHTML = '';

    conversation.messages.forEach(message => {
        if (!message.text && message.role === 'bot') return;
        messagesFlow.appendChild(createMessageRow(message.role, message.text));
    });

    scrollToBottom();
}

function createMessageRow(role, text) {
    const row = document.createElement('div');
    row.className = role === 'user' ? 'user-message' : 'uma-message';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? 'You' : 'U';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;

    row.append(avatar, bubble);
    return row;
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

    if (text) {
        messagesFlow.appendChild(createMessageRow(role, text));
        scrollToBottom();
    }

    return message;
}

// -----------------------------------------------------------------------------
// Conversation History Management
// -----------------------------------------------------------------------------

function loadConversations() {
    try {
        const saved = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY));
        if (Array.isArray(saved) && saved.length) {
            return saved.map(normalizeConversation);
        }
    } catch {
        // Fall through
    }

    // Try migrating legacy history
    const legacy = loadLegacyConversation();
    if (legacy) return [legacy];

    return [createBlankConversation()];
}

function loadLegacyConversation() {
    try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
        if (Array.isArray(legacy) && legacy.length) {
            return normalizeConversation({
                id: createId(),
                title: createTitle(legacy),
                messages: legacy,
                updatedAt: Date.now(),
            });
        }
    } catch {
        return null;
    }
    return null;
}

function normalizeConversation(conv) {
    const messages = Array.isArray(conv.messages) ? conv.messages : [];
    return {
        id: conv.id || createId(),
        title: conv.title || createTitle(messages),
        messages,
        updatedAt: Number(conv.updatedAt) || Date.now(),
    };
}

function createBlankConversation() {
    return {
        id: createId(),
        title: 'New chat',
        messages: [],
        updatedAt: Date.now(),
    };
}

function createConversation() {
    const conv = createBlankConversation();
    conversations.unshift(conv);
    activeChatId = conv.id;
    saveConversations();
    return conv;
}

function loadActiveChatId() {
    return localStorage.getItem(ACTIVE_CHAT_KEY) || (conversations[0] && conversations[0].id) || '';
}

function getActiveConversation() {
    return conversations.find(c => c.id === activeChatId);
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
    focusInput();
}

function renderHistory() {
    historyList.innerHTML = '';
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

    if (!sorted.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-history';
        empty.textContent = 'No chats yet.';
        historyList.appendChild(empty);
        return;
    }

    sorted.forEach(conv => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `chat-item${conv.id === activeChatId ? ' active' : ''}`;

        const titleSpan = document.createElement('span');
        titleSpan.className = 'item-title';
        titleSpan.textContent = conv.title || 'Conversation';

        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.textContent = '↗';

        btn.append(titleSpan, arrow);

        btn.addEventListener('click', () => {
            if (activeChatId === conv.id) return;
            activeChatId = conv.id;
            saveConversations();
            renderHistory();
            renderMessages();
            focusInput();
        });

        historyList.appendChild(btn);
    });
}

function createTitle(messages) {
    const firstUser = (messages || []).find(m => m.role === 'user');
    if (!firstUser || !firstUser.text) return 'New chat';
    const text = firstUser.text.trim();
    return text.length > 32 ? `${text.slice(0, 32)}...` : text;
}

function createId() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }
    return `chat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

// -----------------------------------------------------------------------------
// Prompts Pool in Sidebar
// -----------------------------------------------------------------------------

function renderPrompts() {
    promptsList.innerHTML = '';
    // Select 3 random prompts from the pool
    const shuffled = [...promptPool].sort(() => 0.5 - Math.random()).slice(0, 3);

    shuffled.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'prompt';
        btn.type = 'button';

        btn.innerHTML = `
            <span class="prompt-icon">${item.icon}</span>
            <span class="prompt-text">${item.label}</span>
            <span class="arrow">↗</span>
        `;

        btn.addEventListener('click', () => {
            messageInput.value = item.prompt;
            autoResizeInput();
            updateClearInputButtonVisibility();
            messageInput.focus();
        });

        promptsList.appendChild(btn);
    });
}

// -----------------------------------------------------------------------------
// Sidebar Collapse & Theme Toggle
// -----------------------------------------------------------------------------

function initSidebarState() {
    const isCollapsed = localStorage.getItem(SIDEBAR_KEY) === 'true';
    if (isCollapsed) {
        shell.classList.add('sidebar-collapsed');
        updateSidebarToggleBtn(true);
    } else {
        updateSidebarToggleBtn(false);
    }
}

function toggleSidebar() {
    const closed = shell.classList.toggle('sidebar-collapsed');
    updateSidebarToggleBtn(closed);
    localStorage.setItem(SIDEBAR_KEY, closed ? 'true' : 'false');
}

function updateSidebarToggleBtn(closed) {
    sidebarToggle.textContent = closed ? '›' : '‹';
    sidebarToggle.setAttribute('aria-label', closed ? 'Open sidebar' : 'Close sidebar');
    sidebarToggle.title = closed ? 'Open sidebar' : 'Close sidebar';
}

function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    showToast(isDark ? 'Dark theme enabled' : 'Paper theme enabled');
}

// -----------------------------------------------------------------------------
// Modal & Toast Helpers
// -----------------------------------------------------------------------------

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

function showToast(message) {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    toast.textContent = message;
    toast.style.display = 'block';

    toastTimeout = setTimeout(() => {
        toast.style.display = 'none';
    }, 2200);
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

function initShortcuts() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    shortcutBadge.textContent = isMac ? '⌘ K' : 'Ctrl K';
}

function updateStatus(isOnline, label) {
    connectionStatus.textContent = label;
    if (isOnline) {
        statusDot.classList.remove('offline');
    } else {
        statusDot.classList.add('offline');
    }
}

async function checkHealth() {
    try {
        const res = await fetch('/api/health');
        if (res.ok) {
            const data = await res.json();
            if (data.mode) {
                providerBadge.textContent = data.mode.toUpperCase();
                connectionStatus.textContent = data.mode === 'demo' ? 'Demo mode' : 'Online';
            }
        }
    } catch {
        // Backend offline or running statically
        providerBadge.textContent = 'OFFLINE';
        updateStatus(false, 'Disconnected');
    }
}

function autoResizeInput() {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 140)}px`;
}

function updateClearInputButtonVisibility() {
    if (clearInputBtn) {
        clearInputBtn.style.opacity = messageInput.value ? '1' : '0.4';
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function focusInput() {
    if (window.innerWidth >= 768) {
        messageInput.focus();
    }
}
