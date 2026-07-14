import React, { useState, useEffect } from 'react';

const Message = ({ sender, content, isStreaming }) => {
    const [displayedContent, setDisplayedContent] = useState('');

    useEffect(() => {
        if (isStreaming) {
            // Streaming mode - add content character by character
            let index = 0;
            const interval = setInterval(() => {
                if (index < content.length) {
                    setDisplayedContent(content.substring(0, index + 1));
                    index++;
                } else {
                    clearInterval(interval);
                }
            }, 5);

            return () => clearInterval(interval);
        } else {
            // Non-streaming mode - display content immediately
            setDisplayedContent(content);
        }
    }, [content, isStreaming]);

    return (
        <div className={`message ${sender === 'user' ? 'user-message' : 'bot-message'}`}>
            <strong>{sender}:</strong> {displayedContent}
            {isStreaming && sender !== 'user' && <span className="typing-cursor">|</span>}
        </div>
    );
};

export default Message;