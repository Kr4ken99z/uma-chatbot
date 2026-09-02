const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
    {
        role: {
            type: String,
            enum: ['user', 'bot'],
            required: true,
        },
        text: {
            type: String,
            default: '',
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

const conversationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        clientChatId: {
            type: String,
            required: true,
            index: true,
        },
        title: {
            type: String,
            default: 'New chat',
            trim: true,
        },
        messages: [messageSchema],
        updatedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index to quickly find a user's specific conversation by clientChatId
conversationSchema.index({ userId: 1, clientChatId: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', conversationSchema);
