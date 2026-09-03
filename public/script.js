/**
 * Uma Chatbot — Application Logic
 * Real-time SSE streaming, conversation management, dark/paper theme toggle,
 * collapsible sidebar, prompt pools, and full Sign In / Sign Up authentication.
 */

// DOM References — Main Interface
const shell = document.getElementById('shell');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
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
const toolUser = document.getElementById('toolUser');
const toolTheme = document.getElementById('toolTheme');
const toolAbout = document.getElementById('toolAbout');

// About Modal Elements
const aboutUma = document.getElementById('aboutUma');
const aboutModal = document.getElementById('aboutModal');
const aboutBackdrop = document.getElementById('aboutBackdrop');
const closeAbout = document.getElementById('closeAbout');

// Auth DOM Elements
const openAuthBtn = document.getElementById('openAuthBtn');
const userProfile = document.getElementById('userProfile');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const authModal = document.getElementById('authModal');
const authBackdrop = document.getElementById('authBackdrop');
const closeAuth = document.getElementById('closeAuth');
const tabSignIn = document.getElementById('tabSignIn');
const tabSignUp = document.getElementById('tabSignUp');
const authErrorAlert = document.getElementById('authErrorAlert');
const authSuccessAlert = document.getElementById('authSuccessAlert');
const authForm = document.getElementById('authForm');
const nameGroup = document.getElementById('nameGroup');
const authName = document.getElementById('authName');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const generatePasswordBtn = document.getElementById('generatePasswordBtn');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authSwitchText = document.getElementById('authSwitchText');
const switchAuthMode = document.getElementById('switchAuthMode');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');

// Storage Keys
const CONVERSATIONS_KEY = 'uma-chat-conversations';
const ACTIVE_CHAT_KEY = 'uma-active-chat';
const THEME_KEY = 'uma-theme-preference';
const SIDEBAR_KEY = 'uma-sidebar-state';
const LEGACY_STORAGE_KEY = 'uma-chat-history';
const AUTH_TOKEN_KEY = 'uma-auth-token';
const AUTH_USER_KEY = 'uma-auth-user';
const TAB_SESSION_KEY = 'uma-tab-session-active';
const TAB_CHAT_KEY = 'uma-tab-chat-id';
const GUEST_CHAT_KEY = 'uma_guest_chat_count';
const GUEST_CHAT_LIMIT = 3;

// Guest Limit Elements
const guestCounterBadge = document.getElementById('guestCounterBadge');
const guestChatsLeft = document.getElementById('guestChatsLeft');
const guestLimitModal = document.getElementById('guestLimitModal');
const guestLimitBackdrop = document.getElementById('guestLimitBackdrop');
const closeGuestLimitBtn = document.getElementById('closeGuestLimitBtn');
const guestModalSignUpBtn = document.getElementById('guestModalSignUpBtn');
const guestModalSignInBtn = document.getElementById('guestModalSignInBtn');

function getGuestChatCount() {
    return parseInt(localStorage.getItem(GUEST_CHAT_KEY) || '0', 10);
}

function incrementGuestChatCount() {
    const cur = getGuestChatCount() + 1;
    localStorage.setItem(GUEST_CHAT_KEY, String(cur));
    updateGuestCounterUI();
    return cur;
}

function resetGuestChatCount() {
    localStorage.removeItem(GUEST_CHAT_KEY);
    updateGuestCounterUI();
}

function updateGuestCounterUI() {
    if (!guestCounterBadge || !guestChatsLeft) return;
    if (authToken) {
        guestCounterBadge.style.display = 'none';
        return;
    }
    const count = getGuestChatCount();
    const remaining = Math.max(0, GUEST_CHAT_LIMIT - count);
    guestChatsLeft.textContent = String(remaining);
    guestCounterBadge.style.display = 'inline-flex';
}

function showGuestLimitModal() {
    if (guestLimitModal && guestLimitBackdrop) {
        guestLimitModal.hidden = false;
        guestLimitBackdrop.hidden = false;
        document.body.classList.add('modal-open');
    }
}

function closeGuestLimitModal() {
    if (guestLimitModal && guestLimitBackdrop) {
        guestLimitModal.hidden = true;
        guestLimitBackdrop.hidden = true;
        document.body.classList.remove('modal-open');
    }
}

// State
let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || null;
let currentUser = loadCurrentUser();
let conversations = loadConversations();
let activeChatId = initTabChat();
let isGenerating = false;
let toastTimeout = null;
let authMode = 'signin'; // 'signin' | 'signup';

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

// Initialize Application
initShortcuts();
initSidebarState();
initTheme();
updateAuthUI();
verifySession();
renderPrompts();
renderHistory();
renderMessages();
autoResizeInput();
checkHealth();
focusInput();

// Event Listeners — Chat Form & Input
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
    closeSidebarOnMobile();
});

clearChat.addEventListener('click', async () => {
    if (confirm('Clear all stored conversations? This cannot be undone.')) {
        if (authToken) {
            try {
                await fetch('/api/conversations', {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${authToken}` },
                });
            } catch (err) {
                console.warn('Failed to delete conversations from DB:', err);
            }
        }
        clearAllHistory();
        showToast('All conversations cleared');
    }
});

sidebarToggle.addEventListener('click', toggleSidebar);
if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeSidebarOnMobile);
}

// Toolbar buttons
toolNew.addEventListener('click', () => {
    startNewConversation();
    showToast('New conversation started');
});

toolFocus.addEventListener('click', () => {
    focusInput();
    showToast('Composer focused');
});

if (toolUser) {
    toolUser.addEventListener('click', () => {
        if (currentUser) {
            showToast(`Signed in as ${currentUser.name}`);
        } else {
            openAuthModal();
        }
    });
}

// Floating Action Button (FAB) Speed Dial Handler for Mobile
const fabToggleBtn = document.getElementById('fabToggleBtn');
const hoverToolbar = document.getElementById('hoverToolbar');

if (fabToggleBtn && hoverToolbar) {
    fabToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = hoverToolbar.classList.toggle('open');
        fabToggleBtn.setAttribute('aria-expanded', String(isOpen));
    });

    // Close when tapping outside
    document.addEventListener('click', (e) => {
        if (!hoverToolbar.contains(e.target) && hoverToolbar.classList.contains('open')) {
            hoverToolbar.classList.remove('open');
            fabToggleBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // Close when clicking any tool item on mobile
    hoverToolbar.querySelectorAll('.tool').forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                hoverToolbar.classList.remove('open');
                fabToggleBtn.setAttribute('aria-expanded', 'false');
            }
        });
    });
}

toolTheme.addEventListener('click', () => {
    toggleTheme();
});

toolAbout.addEventListener('click', () => {
    openAboutModal();
});

// About Modal handlers
aboutUma.addEventListener('click', openAboutModal);
closeAbout.addEventListener('click', closeAboutModal);
aboutBackdrop.addEventListener('click', closeAboutModal);

// Auth Portal handlers
if (openAuthBtn) openAuthBtn.addEventListener('click', openAuthModal);
if (closeAuth) closeAuth.addEventListener('click', closeAuthModal);
if (authBackdrop) authBackdrop.addEventListener('click', closeAuthModal);
if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

if (tabSignIn) tabSignIn.addEventListener('click', () => switchAuthTab('signin'));
if (tabSignUp) tabSignUp.addEventListener('click', () => switchAuthTab('signup'));
if (switchAuthMode) switchAuthMode.addEventListener('click', () => {
    switchAuthTab(authMode === 'signin' ? 'signup' : 'signin');
});
if (authForm) authForm.addEventListener('submit', handleAuthSubmit);

// Guest Limit Modal Handlers
if (closeGuestLimitBtn) closeGuestLimitBtn.addEventListener('click', closeGuestLimitModal);
if (guestLimitBackdrop) guestLimitBackdrop.addEventListener('click', closeGuestLimitModal);
if (guestModalSignUpBtn) {
    guestModalSignUpBtn.addEventListener('click', () => {
        closeGuestLimitModal();
        switchAuthTab('signup');
        openAuthModal();
    });
}
if (guestModalSignInBtn) {
    guestModalSignInBtn.addEventListener('click', () => {
        closeGuestLimitModal();
        switchAuthTab('signin');
        openAuthModal();
    });
}
if (guestCounterBadge) {
    guestCounterBadge.addEventListener('click', () => {
        const count = getGuestChatCount();
        if (count >= GUEST_CHAT_LIMIT) {
            showGuestLimitModal();
        } else {
            switchAuthTab('signup');
            openAuthModal();
        }
    });
}

// Global Keydown
document.addEventListener('keydown', event => {
    // Escape closes any open modal
    if (event.key === 'Escape') {
        if (!aboutModal.hidden) closeAboutModal();
        if (authModal && !authModal.hidden) closeAuthModal();
        if (guestLimitModal && !guestLimitModal.hidden) closeGuestLimitModal();
        if (hoverToolbar && hoverToolbar.classList.contains('open')) {
            hoverToolbar.classList.remove('open');
            if (fabToggleBtn) fabToggleBtn.setAttribute('aria-expanded', 'false');
        }
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
// Authentication Logic (Sign In / Sign Up)
// -----------------------------------------------------------------------------

function loadCurrentUser() {
    try {
        const saved = localStorage.getItem(AUTH_USER_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
}

function updateAuthUI() {
    if (currentUser) {
        if (openAuthBtn) openAuthBtn.style.display = 'none';
        if (userProfile) {
            userProfile.style.display = 'flex';
            const initial = (currentUser.name || currentUser.email || 'U').charAt(0).toUpperCase();
            userAvatar.textContent = initial;
            userName.textContent = currentUser.name || 'User';
            userEmail.textContent = currentUser.email || '';
        }
        if (toolUser) {
            toolUser.setAttribute('aria-label', `Account: ${currentUser.name}`);
        }
    } else {
        if (openAuthBtn) openAuthBtn.style.display = 'flex';
        if (userProfile) userProfile.style.display = 'none';
        if (toolUser) {
            toolUser.setAttribute('aria-label', 'Sign In / Sign Up');
        }
    }
    updateGuestCounterUI();
}

function openAuthModal() {
    clearAuthAlerts();
    authModal.hidden = false;
    authBackdrop.hidden = false;
    document.body.classList.add('modal-open');
    if (authMode === 'signup') {
        authName.focus();
    } else {
        authEmail.focus();
    }
}

function closeAuthModal() {
    authModal.hidden = true;
    authBackdrop.hidden = true;
    document.body.classList.remove('modal-open');
    clearAuthAlerts();
}

function switchAuthTab(mode) {
    authMode = mode;
    clearAuthAlerts();

    if (mode === 'signup') {
        tabSignUp.classList.add('active');
        tabSignUp.setAttribute('aria-selected', 'true');
        tabSignIn.classList.remove('active');
        tabSignIn.setAttribute('aria-selected', 'false');

        nameGroup.style.display = 'flex';
        authName.required = true;
        authTitle.textContent = 'Create an Account';
        authSubtitle.textContent = 'Register to sync your chats across sessions.';
        authSubmitBtn.querySelector('span').textContent = 'Create Account';
        authPassword.setAttribute('autocomplete', 'new-password');
        if (generatePasswordBtn) generatePasswordBtn.style.display = 'inline-block';
        authSwitchText.innerHTML = `Already have an account? <button type="button" id="switchAuthMode">Sign In</button>`;
        document.getElementById('switchAuthMode').addEventListener('click', () => switchAuthTab('signin'));
        authName.focus();
    } else {
        tabSignIn.classList.add('active');
        tabSignIn.setAttribute('aria-selected', 'true');
        tabSignUp.classList.remove('active');
        tabSignUp.setAttribute('aria-selected', 'false');

        nameGroup.style.display = 'none';
        authName.required = false;
        authTitle.textContent = 'Welcome to Uma';
        authSubtitle.textContent = 'Sign in or register to sync your chats.';
        authSubmitBtn.querySelector('span').textContent = 'Sign In';
        authPassword.setAttribute('autocomplete', 'current-password');
        if (generatePasswordBtn) generatePasswordBtn.style.display = 'none';
        authSwitchText.innerHTML = `Don't have an account? <button type="button" id="switchAuthMode">Create one</button>`;
        document.getElementById('switchAuthMode').addEventListener('click', () => switchAuthTab('signup'));
        authEmail.focus();
    }
}

if (generatePasswordBtn) {
    generatePasswordBtn.addEventListener('click', () => {
        const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
        let pwd = 'Uma-';
        for (let i = 0; i < 10; i++) {
            pwd += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        authPassword.value = pwd;
        authPassword.type = 'text';
        showToast('Strong password generated!');
        setTimeout(() => {
            authPassword.type = 'password';
        }, 3000);
    });
}

function clearAuthAlerts() {
    if (authErrorAlert) {
        authErrorAlert.style.display = 'none';
        authErrorAlert.textContent = '';
    }
    if (authSuccessAlert) {
        authSuccessAlert.style.display = 'none';
        authSuccessAlert.textContent = '';
    }
}

function setAuthError(message) {
    if (authSuccessAlert) authSuccessAlert.style.display = 'none';
    if (authErrorAlert) {
        authErrorAlert.textContent = message;
        authErrorAlert.style.display = 'block';
    }
}

function setAuthSuccess(message) {
    if (authErrorAlert) authErrorAlert.style.display = 'none';
    if (authSuccessAlert) {
        authSuccessAlert.textContent = message;
        authSuccessAlert.style.display = 'block';
    }
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    clearAuthAlerts();

    const email = authEmail.value.trim();
    const password = authPassword.value;
    const name = authName.value.trim();

    authSubmitBtn.disabled = true;
    const origBtnText = authSubmitBtn.querySelector('span').textContent;
    authSubmitBtn.querySelector('span').textContent = authMode === 'signup' ? 'Creating...' : 'Signing in...';

    try {
        const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
        const payload = authMode === 'signup' ? { name, email, password } : { email, password };

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Authentication failed. Please try again.');
        }

        // Save session
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));

        updateAuthUI();
        setAuthSuccess(authMode === 'signup' ? 'Account created successfully!' : 'Signed in successfully!');

        // Fetch user's conversation history directly from MongoDB Atlas!
        await loadUserConversationsFromDB();

        setTimeout(() => {
            closeAuthModal();
            showToast(`Welcome, ${currentUser.name}!`);
        }, 600);

    } catch (err) {
        setAuthError(err.message);
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.querySelector('span').textContent = origBtnText;
    }
}

async function verifySession() {
    if (!authToken) {
        // Guest mode: always a clean, fresh start without previous user chats
        conversations = [createBlankConversation()];
        activeChatId = conversations[0].id;
        renderHistory();
        renderMessages();
        return;
    }

    try {
        const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${authToken}` },
        });

        if (res.ok) {
            const data = await res.json();
            if (data.ok && data.user) {
                currentUser = data.user;
                localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
                updateAuthUI();
                await loadUserConversationsFromDB();
                return;
            }
        }
        // If expired or invalid
        handleLogout(false);
    } catch {
        // Offline or connection error; keep local user session
    }
}

async function loadUserConversationsFromDB() {
    if (!authToken) return;

    try {
        const res = await fetch('/api/conversations', {
            headers: { Authorization: `Bearer ${authToken}` },
        });

        if (res.ok) {
            const data = await res.json();
            if (data.ok && Array.isArray(data.conversations)) {
                if (data.conversations.length > 0) {
                    conversations = data.conversations.map(normalizeConversation);
                } else {
                    conversations = [createBlankConversation()];
                }
                activeChatId = conversations[0].id;
                sessionStorage.setItem(TAB_CHAT_KEY, activeChatId);
                localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
                localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
                renderHistory();
                renderMessages();
            }
        }
    } catch (err) {
        console.warn('Failed to load conversations from DB:', err);
    }
}

async function syncConversationToDB(conv) {
    if (!authToken || !conv || !conv.id) return;
    if (!conv.messages || !conv.messages.length) return;

    try {
        await fetch('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                id: conv.id,
                title: conv.title || 'New chat',
                messages: conv.messages,
            }),
        });
    } catch (err) {
        console.warn('Failed to sync conversation to DB:', err);
    }
}

function handleLogout(shouldNotify = true) {
    authToken = null;
    currentUser = null;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(CONVERSATIONS_KEY);
    localStorage.removeItem(ACTIVE_CHAT_KEY);
    sessionStorage.removeItem(TAB_CHAT_KEY);

    // Completely reset to a fresh blank start for the guest
    conversations = [createBlankConversation()];
    activeChatId = conversations[0].id;
    resetGuestChatCount();

    updateAuthUI();
    renderHistory();
    renderMessages();
    focusInput();

    if (shouldNotify) {
        showToast('Signed out. Fresh guest session started.');
    }
}

// -----------------------------------------------------------------------------
// Core Actions & Submission
// -----------------------------------------------------------------------------

async function handleFormSubmit(event) {
    event.preventDefault();

    if (isGenerating) return;

    const text = messageInput.value.trim();
    if (!text) return;

    if (!authToken && getGuestChatCount() >= GUEST_CHAT_LIMIT) {
        showGuestLimitModal();
        showToast('Guest chat limit reached. Please sign in to continue.');
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
    if (!authToken && getGuestChatCount() >= GUEST_CHAT_LIMIT) {
        showGuestLimitModal();
        showToast('Guest chat limit reached. Please sign in to continue.');
        return;
    }

    setLoading(true);
    const typingId = addTypingIndicator();
    let botMessage = null;
    let botTextElement = null;

    const ensureBotMessage = () => {
        if (!botMessage) {
            removeTypingIndicator(typingId);
            const added = addMessage('bot', '');
            botMessage = added.message;
            botTextElement = added.bubble;
        }
        return { botMessage, botTextElement };
    };

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const activeConv = getActiveConversation();
        const history = (activeConv?.messages || [])
            .slice(0, -1) // Exclude the current user prompt that was just appended
            .slice(-10) // Retain last 10 turns for memory
            .map(m => ({ role: m.role, text: m.text }));

        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers,
            body: JSON.stringify({ message: userPrompt, history }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            if (response.status === 403 && data.guestLimitReached) {
                removeTypingIndicator(typingId);
                showGuestLimitModal();
                throw new Error(data.error || 'Guest limit reached (3 chats).');
            }
            throw new Error(data.error || 'Uma could not respond right now.');
        }

        if (!authToken) {
            incrementGuestChatCount();
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
        if (authToken) {
            syncConversationToDB(getActiveConversation());
        }
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
            if (providerBadge) providerBadge.textContent = 'DEMO';
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

// -----------------------------------------------------------------------------
// Markdown & GitHub-Style Code Card Formatter
// -----------------------------------------------------------------------------

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function highlightSyntax(code) {
    let html = escapeHtml(code);

    // Comments: // ... or /* ... */ or # ...
    const comments = [];
    html = html.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)/g, (match) => {
        const id = `__COMM_${comments.length}__`;
        comments.push(`<span class="token-comment">${match}</span>`);
        return id;
    });

    // Strings: "..." or '...' or `...`
    const strings = [];
    html = html.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, (match) => {
        const id = `__STR_${strings.length}__`;
        strings.push(`<span class="token-string">${match}</span>`);
        return id;
    });

    // Keywords (Java, Python, JS, TS, C++, Go, etc.)
    const keywordsRegex = /\b(public|private|protected|class|interface|enum|extends|implements|static|final|abstract|void|int|boolean|double|float|char|byte|short|long|return|if|else|for|while|do|switch|case|default|break|continue|new|this|super|try|catch|finally|throw|throws|import|package|def|function|var|let|const|async|await|typeof|instanceof|from|as|null|true|false|undefined)\b/g;
    html = html.replace(keywordsRegex, '<span class="token-keyword">$1</span>');

    // Numbers
    html = html.replace(/\b(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="token-number">$1</span>');

    // Method calls / Functions: fnName(...)
    html = html.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/g, '<span class="token-fn">$1</span>');

    // Restore strings
    strings.forEach((str, i) => {
        html = html.replace(`__STR_${i}__`, str);
    });

    // Restore comments
    comments.forEach((comm, i) => {
        html = html.replace(`__COMM_${i}__`, comm);
    });

    return html;
}

function formatMarkdown(text) {
    if (!text) return '';

    const codeBlocks = [];

    // 1. Extract fenced code blocks (supporting open blocks during streaming too)
    let processed = text.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
        const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
        codeBlocks.push({
            lang: (lang || 'code').trim().toLowerCase(),
            code: code.replace(/\r?\n$/, ''),
        });
        return placeholder;
    });

    // 2. Escape regular text
    processed = escapeHtml(processed);

    // 2.5 Markdown Images: ![alt](url)
    processed = processed.replace(/!\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, (match, alt, url) => {
        return `</p><div class="chat-image-card">
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-image-link" title="Click to view full image">
                <img src="${url}" alt="${alt || 'Generated image'}" class="chat-image" loading="lazy" />
            </a>
            <div class="chat-image-footer">
                <span class="chat-image-caption">✦ ${alt || 'Generated image'}</span>
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-image-dl-btn">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    <span>View HD</span>
                </a>
            </div>
        </div><p>`;
    });

    // 3. Bold: **text**
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // 4. Italic: *text* or _text_
    processed = processed.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

    // 5. Inline code: `code`
    processed = processed.replace(/`([^`\n]+?)`/g, '<code class="inline-code">$1</code>');

    // 6. Headers
    processed = processed.replace(/^### (.*$)/gim, '<h4 class="md-h4">$1</h4>');
    processed = processed.replace(/^## (.*$)/gim, '<h3 class="md-h3">$1</h3>');
    processed = processed.replace(/^# (.*$)/gim, '<h2 class="md-h2">$1</h2>');

    // 7. Bullet lists
    processed = processed.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="md-li">$1</li>');
    processed = processed.replace(/((?:<li class="md-li">.*?<\/li>\s*)+)/gis, '<ul class="md-ul">$1</ul>');

    // 8. Line breaks: \n\n into <p>, single \n into <br>
    processed = processed.replace(/\n\n+/g, '</p><p>');
    processed = processed.replace(/\n/g, '<br>');
    processed = `<p>${processed}</p>`;
    processed = processed.replace(/<p>\s*<\/p>/g, '');

    // 9. Reinsert GitHub-style code cards
    codeBlocks.forEach((item, index) => {
        const placeholder = `__CODE_BLOCK_${index}__`;
        const langDisplay = item.lang ? (item.lang.charAt(0).toUpperCase() + item.lang.slice(1)) : 'Code';
        const highlighted = highlightSyntax(item.code);
        const encodedRawCode = encodeURIComponent(item.code);

        const cardHtml = `
            <div class="code-card">
                <div class="code-header">
                    <span class="code-lang">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                        <span>${escapeHtml(langDisplay)}</span>
                    </span>
                    <button class="copy-code-btn" type="button" data-raw-code="${encodedRawCode}" aria-label="Copy code">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span class="copy-label">Copy</span>
                    </button>
                </div>
                <pre class="code-pre"><code class="code-body language-${escapeHtml(item.lang)}">${highlighted}</code></pre>
            </div>
        `;

        processed = processed.replace(new RegExp(`<p>\\s*${placeholder}\\s*<\\/p>`, 'g'), cardHtml);
        processed = processed.replace(new RegExp(placeholder, 'g'), cardHtml);
    });

    return processed;
}

function updateStreamingMessage(messageObj, textElement, text) {
    const conversation = getActiveConversation();
    messageObj.text = text;

    if (conversation) {
        conversation.updatedAt = Date.now();
    }

    if (textElement) {
        textElement.innerHTML = formatMarkdown(text);
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

    conversation.messages.forEach((message, index) => {
        if (!message.text && message.role === 'bot') return;
        messagesFlow.appendChild(createMessageRow(message.role, message.text, index));
    });

    scrollToBottom();
}

function createMessageRow(role, text, messageIndex) {
    const row = document.createElement('div');
    row.className = role === 'user' ? 'user-message' : 'uma-message';
    if (typeof messageIndex === 'number') {
        row.dataset.messageIndex = String(messageIndex);
    }

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? 'You' : 'U';

    if (role === 'user') {
        const container = document.createElement('div');
        container.className = 'user-bubble-container';

        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = text;

        const actions = document.createElement('div');
        actions.className = 'user-msg-actions';
        actions.innerHTML = `
            <button class="edit-msg-btn" type="button" title="Edit prompt" aria-label="Edit prompt">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>Edit</span>
            </button>
        `;

        container.append(bubble, actions);
        row.append(avatar, container);
    } else {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.innerHTML = formatMarkdown(text);
        row.append(avatar, bubble);
    }

    return row;
}

// Global click handler for code copy and message editing
messagesFlow.addEventListener('click', (e) => {
    // 1. Copy Code button
    const copyBtn = e.target.closest('.copy-code-btn');
    if (copyBtn) {
        const rawCode = decodeURIComponent(copyBtn.getAttribute('data-raw-code') || '');
        if (!rawCode) return;

        navigator.clipboard.writeText(rawCode).then(() => {
            copyBtn.classList.add('copied');
            const label = copyBtn.querySelector('.copy-label');
            if (label) label.textContent = 'Copied! ✓';
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                if (label) label.textContent = 'Copy';
            }, 2000);
        }).catch(() => {
            showToast('Code copied');
        });
        return;
    }

    // 2. Edit User Message button
    const editBtn = e.target.closest('.edit-msg-btn');
    if (editBtn) {
        if (isGenerating) {
            showToast('Please wait for Uma to finish generating.');
            return;
        }

        const row = editBtn.closest('.user-message');
        if (!row) return;

        const container = row.querySelector('.user-bubble-container');
        const bubble = row.querySelector('.bubble');
        if (!container || !bubble) return;

        const originalText = bubble.textContent.trim();
        const msgIdx = parseInt(row.dataset.messageIndex ?? '-1', 10);

        container.style.display = 'none';

        const editCard = document.createElement('div');
        editCard.className = 'user-edit-card';
        editCard.innerHTML = `
            <textarea class="user-edit-textarea">${escapeHtml(originalText)}</textarea>
            <div class="user-edit-buttons">
                <button class="user-edit-cancel" type="button">Cancel</button>
                <button class="user-edit-save" type="button">Save & Submit</button>
            </div>
        `;

        row.appendChild(editCard);
        const textarea = editCard.querySelector('.user-edit-textarea');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        const cleanup = () => {
            editCard.remove();
            container.style.display = '';
        };

        editCard.querySelector('.user-edit-cancel').onclick = cleanup;

        const saveAndSubmit = async () => {
            const newText = textarea.value.trim();
            if (!newText) return;
            cleanup();

            if (newText === originalText) return;

            // Check guest limit before resubmitting
            if (!authToken && getGuestChatCount() >= GUEST_CHAT_LIMIT) {
                showGuestLimitModal();
                showToast('Guest limit reached. Please sign in to continue.');
                return;
            }

            // Prune conversation messages from this message index forward
            const conv = getActiveConversation();
            if (conv && msgIdx >= 0 && msgIdx < conv.messages.length) {
                conv.messages = conv.messages.slice(0, msgIdx);
            }

            // Save and re-render messages up to the edit point
            saveConversations();
            renderMessages();

            // Append edited user message and stream a fresh response!
            addMessage('user', newText);
            await streamUmaResponse(newText);
        };

        editCard.querySelector('.user-edit-save').onclick = saveAndSubmit;

        textarea.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                saveAndSubmit();
            } else if (ev.key === 'Escape') {
                cleanup();
            }
        });

        return;
    }
});

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

    const msgIndex = conversation.messages.length - 1;
    const row = createMessageRow(role, text, msgIndex);
    messagesFlow.appendChild(row);
    scrollToBottom();

    if (authToken && role === 'user') {
        syncConversationToDB(conversation);
    }

    return { message, row, bubble: row.querySelector('.bubble') };
}

// -----------------------------------------------------------------------------
// Conversation History Management
// -----------------------------------------------------------------------------

function loadConversations() {
    // If not logged in, guest gets a fresh start every time!
    if (!authToken) {
        return [createBlankConversation()];
    }

    try {
        const saved = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY));
        if (Array.isArray(saved) && saved.length) {
            return saved.map(normalizeConversation);
        }
    } catch {
        // Fall through
    }

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
    // If the top chat is already empty, switch to it
    const topConv = conversations[0];
    if (topConv && (!topConv.messages || topConv.messages.length === 0)) {
        activeChatId = topConv.id;
        sessionStorage.setItem(TAB_CHAT_KEY, activeChatId);
        saveConversations();
        return topConv;
    }

    const conv = createBlankConversation();
    conversations.unshift(conv);
    activeChatId = conv.id;
    sessionStorage.setItem(TAB_CHAT_KEY, activeChatId);
    saveConversations();
    return conv;
}

function initTabChat() {
    const isExistingTab = sessionStorage.getItem(TAB_SESSION_KEY) === 'true';
    const savedTabChatId = sessionStorage.getItem(TAB_CHAT_KEY);

    // If this tab was refreshed, keep the conversation that was already open here
    if (isExistingTab && savedTabChatId && conversations.some(c => c.id === savedTabChatId)) {
        return savedTabChatId;
    }

    // This is a BRAND NEW TAB:
    sessionStorage.setItem(TAB_SESSION_KEY, 'true');

    // If not logged in (guest), always start with a clean fresh slate!
    if (!authToken) {
        const guestChat = createBlankConversation();
        conversations = [guestChat];
        sessionStorage.setItem(TAB_CHAT_KEY, guestChat.id);
        return guestChat.id;
    }

    // If logged in and the most recent conversation is already empty (brand new), use it
    const topConv = conversations[0];
    const isTopEmpty = topConv && (!topConv.messages || topConv.messages.length === 0);

    if (isTopEmpty) {
        sessionStorage.setItem(TAB_CHAT_KEY, topConv.id);
        localStorage.setItem(ACTIVE_CHAT_KEY, topConv.id);
        return topConv.id;
    }

    // Previous chats exist with messages:
    // Automatically open a fresh new chat for this new tab and preserve all previous chats in history
    const freshChat = createBlankConversation();
    conversations.unshift(freshChat);
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    localStorage.setItem(ACTIVE_CHAT_KEY, freshChat.id);
    sessionStorage.setItem(TAB_CHAT_KEY, freshChat.id);

    return freshChat.id;
}

function getActiveConversation() {
    let conv = conversations.find(c => c.id === activeChatId);
    if (!conv) {
        conv = conversations[0] || createBlankConversation();
        activeChatId = conv.id;
    }
    return conv;
}

function saveConversations() {
    if (authToken) {
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
        localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
    }
    sessionStorage.setItem(TAB_CHAT_KEY, activeChatId);
}

function clearAllHistory() {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(CONVERSATIONS_KEY);
    localStorage.removeItem(ACTIVE_CHAT_KEY);
    sessionStorage.removeItem(TAB_CHAT_KEY);

    conversations = [createBlankConversation()];
    activeChatId = conversations[0].id;
    sessionStorage.setItem(TAB_CHAT_KEY, activeChatId);
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
            if (activeChatId !== conv.id) {
                activeChatId = conv.id;
                saveConversations();
                renderHistory();
                renderMessages();
            }
            closeSidebarOnMobile();
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
            closeSidebarOnMobile();
            messageInput.focus();
        });

        promptsList.appendChild(btn);
    });
}

// -----------------------------------------------------------------------------
// Sidebar Collapse & Theme Toggle
// -----------------------------------------------------------------------------

function initSidebarState() {
    const isMobile = window.innerWidth <= 768;
    const saved = localStorage.getItem(SIDEBAR_KEY);
    const isCollapsed = saved !== null ? saved === 'true' : isMobile;
    if (isCollapsed) {
        shell.classList.add('sidebar-collapsed');
        updateSidebarToggleBtn(true);
    } else {
        shell.classList.remove('sidebar-collapsed');
        updateSidebarToggleBtn(false);
    }
}

function closeSidebarOnMobile() {
    if (window.innerWidth <= 768) {
        shell.classList.add('sidebar-collapsed');
        updateSidebarToggleBtn(true);
        localStorage.setItem(SIDEBAR_KEY, 'true');
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
                if (providerBadge) providerBadge.textContent = data.mode.toUpperCase();
                connectionStatus.textContent = data.mode === 'demo' ? 'Demo mode' : 'Online';
            }
        }
    } catch {
        if (providerBadge) providerBadge.textContent = 'OFFLINE';
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
