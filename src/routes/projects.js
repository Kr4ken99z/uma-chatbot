const express = require('express');
const { verifyToken } = require('../services/authService');
const { getSQL, initDB } = require('../utils/db');

const router = express.Router();

function getBearerToken(req) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    return null;
}

// Authentication Middleware
async function requireAuth(req, res, next) {
    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({
            ok: false,
            error: 'Authentication required. No token provided.',
        });
    }

    try {
        await initDB();
        const user = await verifyToken(token);
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            ok: false,
            error: error.message || 'Invalid or expired session token.',
        });
    }
}

router.use(requireAuth);

// GET /api/projects — List user's projects with chat count
router.get('/', async (req, res) => {
    try {
        const sql = getSQL();
        const rows = await sql`
            SELECT 
                p.id, 
                p.name, 
                p.description, 
                p.created_at, 
                p.updated_at,
                COUNT(c.id)::int AS chat_count
            FROM projects p
            LEFT JOIN conversations c ON c.project_id = p.id AND c.user_id = p.user_id
            WHERE p.user_id = ${req.user.id}
            GROUP BY p.id
            ORDER BY p.updated_at DESC;
        `;

        const projects = rows.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description || '',
            chatCount: r.chat_count || 0,
            createdAt: new Date(r.created_at).getTime(),
            updatedAt: new Date(r.updated_at).getTime(),
        }));

        return res.json({
            ok: true,
            projects,
        });
    } catch (error) {
        console.error('Fetch projects error:', error.message);
        return res.status(500).json({
            ok: false,
            error: 'Failed to fetch projects.',
        });
    }
});

// POST /api/projects — Create a new project
router.post('/', async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const description = String(req.body?.description || '').trim();

        if (!name) {
            return res.status(400).json({
                ok: false,
                error: 'Project name is required.',
            });
        }

        const sql = getSQL();
        const rows = await sql`
            INSERT INTO projects (user_id, name, description, created_at, updated_at)
            VALUES (${req.user.id}, ${name}, ${description}, NOW(), NOW())
            RETURNING id, name, description, created_at, updated_at;
        `;

        const project = rows[0];
        return res.status(201).json({
            ok: true,
            project: {
                id: project.id,
                name: project.name,
                description: project.description,
                chatCount: 0,
                createdAt: new Date(project.created_at).getTime(),
                updatedAt: new Date(project.updated_at).getTime(),
            },
        });
    } catch (error) {
        console.error('Create project error:', error.message);
        return res.status(500).json({
            ok: false,
            error: 'Failed to create project.',
        });
    }
});

// PATCH /api/projects/:id — Rename or update project
router.patch('/:id', async (req, res) => {
    try {
        const projectId = parseInt(req.params.id, 10);
        if (isNaN(projectId)) {
            return res.status(400).json({ ok: false, error: 'Invalid project ID.' });
        }

        const name = req.body?.name !== undefined ? String(req.body.name).trim() : null;
        const description = req.body?.description !== undefined ? String(req.body.description).trim() : null;

        if (name !== null && !name) {
            return res.status(400).json({ ok: false, error: 'Project name cannot be empty.' });
        }

        const sql = getSQL();
        const rows = await sql`
            UPDATE projects
            SET 
                name = COALESCE(${name}, name),
                description = COALESCE(${description}, description),
                updated_at = NOW()
            WHERE id = ${projectId} AND user_id = ${req.user.id}
            RETURNING id, name, description, created_at, updated_at;
        `;

        if (!rows.length) {
            return res.status(404).json({ ok: false, error: 'Project not found.' });
        }

        const project = rows[0];
        return res.json({
            ok: true,
            project: {
                id: project.id,
                name: project.name,
                description: project.description,
                createdAt: new Date(project.created_at).getTime(),
                updatedAt: new Date(project.updated_at).getTime(),
            },
        });
    } catch (error) {
        console.error('Update project error:', error.message);
        return res.status(500).json({ ok: false, error: 'Failed to update project.' });
    }
});

// DELETE /api/projects/:id — Delete project and dissociate conversations
router.delete('/:id', async (req, res) => {
    try {
        const projectId = parseInt(req.params.id, 10);
        if (isNaN(projectId)) {
            return res.status(400).json({ ok: false, error: 'Invalid project ID.' });
        }

        const sql = getSQL();

        // 1. Unassign all conversations from this project
        await sql`
            UPDATE conversations
            SET project_id = NULL
            WHERE project_id = ${projectId} AND user_id = ${req.user.id};
        `;

        // 2. Delete the project
        const rows = await sql`
            DELETE FROM projects
            WHERE id = ${projectId} AND user_id = ${req.user.id}
            RETURNING id;
        `;

        if (!rows.length) {
            return res.status(404).json({ ok: false, error: 'Project not found.' });
        }

        return res.json({
            ok: true,
            deletedId: projectId,
        });
    } catch (error) {
        console.error('Delete project error:', error.message);
        return res.status(500).json({ ok: false, error: 'Failed to delete project.' });
    }
});

module.exports = router;
