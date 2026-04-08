require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, closeDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/needs', require('./routes/needs'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/offers', require('./routes/offers'));
app.use('/api/notifications', require('./routes/notifications'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0', name: 'NestSeek' });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
    try {
        const { getDb } = require('./database');
        const db = getDb();
        const activeNeeds = db.prepare("SELECT COUNT(*) as count FROM needs WHERE status = 'active'").get().count;
        const totalMatches = db.prepare("SELECT COUNT(*) as count FROM offers WHERE status = 'accepted'").get().count;
        const activeProperties = db.prepare("SELECT COUNT(*) as count FROM properties WHERE status = 'active'").get().count;
        const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get().count;

        res.json({ active_needs: activeNeeds, total_matches: totalMatches, active_properties: activeProperties, total_users: totalUsers });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// Initialize database and start server
initDb();

const server = app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║          NestSeek Server              ║
    ║   Running on http://localhost:${PORT}    ║
    ║                                       ║
    ║   API:    /api/*                      ║
    ║   Health: /api/health                 ║
    ╚═══════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    closeDb();
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    closeDb();
    server.close();
    process.exit(0);
});
