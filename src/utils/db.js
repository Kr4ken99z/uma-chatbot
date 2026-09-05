const { neon } = require('@neondatabase/serverless');

function getConnectionString() {
    return (
        process.env.DATABASE_URL ||
        process.env.NEON_DATABASE_URL ||
        process.env.POSTGRES_URL ||
        ''
    );
}

let sqlInstance = null;
let isInitialized = false;

function getSQL() {
    const connStr = getConnectionString();
    if (!connStr) {
        throw new Error('DATABASE_URL is not set. Please configure your Neon DB connection string.');
    }

    if (!sqlInstance) {
        sqlInstance = neon(connStr);
    }

    return sqlInstance;
}

async function initDB() {
    const connStr = getConnectionString();
    if (!connStr) return false;
    if (isInitialized) return true;

    try {
        const sql = getSQL();

        // Create users table
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Create projects table
        await sql`
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT DEFAULT '',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_projects_user_updated 
            ON projects(user_id, updated_at DESC);
        `;

        // Create conversations table with JSONB messages
        await sql`
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                client_chat_id VARCHAR(255) NOT NULL,
                title VARCHAR(255) DEFAULT 'New chat',
                messages JSONB DEFAULT '[]'::jsonb,
                is_pinned BOOLEAN DEFAULT FALSE,
                is_archived BOOLEAN DEFAULT FALSE,
                project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                share_token VARCHAR(64),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_user_client_chat UNIQUE (user_id, client_chat_id)
            );
        `;

        // Migrations for existing conversations table
        await sql`
            ALTER TABLE conversations 
            ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
        `;
        await sql`
            ALTER TABLE conversations 
            ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
        `;
        await sql`
            ALTER TABLE conversations 
            ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
        `;
        await sql`
            ALTER TABLE conversations 
            ADD COLUMN IF NOT EXISTS share_token VARCHAR(64);
        `;

        // Create indexes for fast sorting and querying
        await sql`
            CREATE INDEX IF NOT EXISTS idx_conversations_user_updated 
            ON conversations(user_id, updated_at DESC);
        `;
        await sql`
            CREATE INDEX IF NOT EXISTS idx_conversations_user_project 
            ON conversations(user_id, project_id);
        `;
        await sql`
            CREATE INDEX IF NOT EXISTS idx_conversations_share_token 
            ON conversations(share_token);
        `;

        isInitialized = true;
        console.log('[Neon DB] Schema initialized successfully with Projects & Chat status support');
        return true;
    } catch (err) {
        console.error('[Neon DB] Schema initialization error:', err.message);
        throw err;
    }
}

async function checkDB() {
    const connStr = getConnectionString();
    if (!connStr) return false;

    try {
        const sql = getSQL();
        const result = await sql`SELECT 1 AS alive`;
        return result && result.length > 0;
    } catch {
        return false;
    }
}

function hasDBConfig() {
    return Boolean(getConnectionString());
}

module.exports = {
    getSQL,
    initDB,
    checkDB,
    hasDBConfig,
};
