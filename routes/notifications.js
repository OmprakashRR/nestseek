const express = require('express');
const { getDb } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's notifications
router.get('/', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const { unread_only } = req.query;

        let query = 'SELECT * FROM notifications WHERE user_id = ?';
        if (unread_only === 'true') {
            query += ' AND read = 0';
        }
        query += ' ORDER BY created_at DESC LIMIT 50';

        const notifications = db.prepare(query).all(req.user.id);
        const unreadCount = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0')
            .get(req.user.id).count;

        res.json({ notifications, unread_count: unreadCount });
    } catch (err) {
        console.error('Get notifications error:', err);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark notification as read
router.patch('/:id/read', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?')
            .run(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// Mark all as read
router.post('/read-all', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

module.exports = router;
