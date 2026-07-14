class Chat {
    constructor() {
        this.messages = [];
        this.chatContainer = document.createElement('div');
        this.chatContainer.className = 'chat-container';
        this.render();
    }

    render() {
        this.chatContainer.innerHTML = '';
        this.messages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            this.chatContainer.appendChild(messageElement);
        });
        document.body.appendChild(this.chatContainer);
    }

    createMessageElement(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.innerHTML = `<strong>${message.sender}:</strong> ${message.content}`;
        return messageElement;
    }

    addMessage(sender, content) {
        this.messages.push({ sender, content });
        this.render();
    }
}

export default Chat;