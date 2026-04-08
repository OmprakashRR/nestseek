const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { findMatchesForNeed } = require('../services/matching');

const router = express.Router();

// Create a need
router.post('/', authenticateToken, (req, res) => {
    try {
        const { type, areas, budget_min, budget_max, room_type, move_in, move_out, preferences, about } = req.body;

        if (!type || !areas || !budget_min || !budget_max || !room_type || !move_in) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!Array.isArray(areas) || areas.length === 0) {
            return res.status(400).json({ error: 'At least one area is required' });
        }

        if (budget_max < budget_min) {
            return res.status(400).json({ error: 'Maximum budget must be greater than minimum' });
        }

        const db = getDb();
        const id = uuidv4();

        db.prepare(`
            INSERT INTO needs (id, user_id, type, budget_min, budget_max, room_type, move_in, move_out, about)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, req.user.id, type, budget_min, budget_max, room_type, move_in, move_out || null, about || null);

        // Insert areas
        const insertArea = db.prepare('INSERT INTO need_areas (need_id, area) VALUES (?, ?)');
        for (const area of areas) {
            insertArea.run(id, area);
        }

        // Insert preferences
        if (preferences && Array.isArray(preferences)) {
            const insertPref = db.prepare('INSERT INTO need_preferences (need_id, preference) VALUES (?, ?)');
            for (const pref of preferences) {
                insertPref.run(id, pref);
            }
        }

        // Find existing property matches
        const need = db.prepare('SELECT * FROM needs WHERE id = ?').get(id);
        const matches = findMatchesForNeed(need, areas, preferences || []);

        // Create notifications for matches
        if (matches.length > 0) {
            const insertNotif = db.prepare(`
                INSERT INTO notifications (id, user_id, type, title, message, related_id)
                VALUES (?, ?, 'match', ?, ?, ?)
            `);
            for (const match of matches.slice(0, 5)) { // Top 5 matches
                insertNotif.run(
                    uuidv4(),
                    req.user.id,
                    'Property match found!',
                    `${match.property.title} in ${match.property.area} - €${match.property.rent_monthly}/mo (${match.score}% match)`,
                    match.property.id
                );
            }
        }

        res.status(201).json({
            need: { id, ...req.body, user_id: req.user.id, status: 'active' },
            matches: matches.slice(0, 5)
        });
    } catch (err) {
        console.error('Create need error:', err);
        res.status(500).json({ error: 'Failed to create need' });
    }
});

// Get all active needs (public, for property owners to browse)
router.get('/', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const { type, room_type, area, max_budget, page = 1, limit = 20 } = req.query;

        let query = `
            SELECT n.*, u.name, u.occupation, u.about as user_about, u.verified
            FROM needs n
            JOIN users u ON n.user_id = u.id
            WHERE n.status = 'active'
        `;
        const params = [];

        if (type && type !== 'all') {
            query += ' AND n.type = ?';
            params.push(type);
        }
        if (room_type && room_type !== 'all') {
            query += ' AND n.room_type = ?';
            params.push(room_type);
        }
        if (max_budget) {
            query += ' AND n.budget_max >= ?';
            params.push(parseInt(max_budget));
        }

        query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        let needs = db.prepare(query).all(...params);

        // Attach areas and preferences
        const getAreas = db.prepare('SELECT area FROM need_areas WHERE need_id = ?');
        const getPrefs = db.prepare('SELECT preference FROM need_preferences WHERE need_id = ?');

        needs = needs.map(need => {
            need.areas = getAreas.all(need.id).map(r => r.area);
            need.preferences = getPrefs.all(need.id).map(r => r.preference);
            return need;
        });

        // Filter by area (post-query since areas are in separate table)
        if (area) {
            const areaLower = area.toLowerCase();
            needs = needs.filter(n =>
                n.areas.some(a => a.toLowerCase().includes(areaLower))
            );
        }

        // Count total
        const countQuery = `SELECT COUNT(*) as total FROM needs WHERE status = 'active'`;
        const { total } = db.prepare(countQuery).get();

        res.json({ needs, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error('Get needs error:', err);
        res.status(500).json({ error: 'Failed to fetch needs' });
    }
});

// Get a single need
router.get('/:id', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const need = db.prepare(`
            SELECT n.*, u.name, u.occupation, u.about as user_about, u.verified
            FROM needs n
            JOIN users u ON n.user_id = u.id
            WHERE n.id = ?
        `).get(req.params.id);

        if (!need) {
            return res.status(404).json({ error: 'Need not found' });
        }

        need.areas = db.prepare('SELECT area FROM need_areas WHERE need_id = ?')
            .all(need.id).map(r => r.area);
        need.preferences = db.prepare('SELECT preference FROM need_preferences WHERE need_id = ?')
            .all(need.id).map(r => r.preference);

        // If the requesting user owns this need, include offers
        if (req.user && req.user.id === need.user_id) {
            need.offers = db.prepare(`
                SELECT o.*, u.name as offerer_name, u.email as offerer_email,
                       p.title as property_title, p.area as property_area, p.room_type as property_room_type
                FROM offers o
                JOIN users u ON o.offerer_id = u.id
                LEFT JOIN properties p ON o.property_id = p.id
                WHERE o.need_id = ?
                ORDER BY o.created_at DESC
            `).all(need.id);
        }

        res.json({ need });
    } catch (err) {
        console.error('Get need error:', err);
        res.status(500).json({ error: 'Failed to fetch need' });
    }
});

// Get current user's needs
router.get('/user/mine', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        let needs = db.prepare(`
            SELECT * FROM needs WHERE user_id = ? ORDER BY created_at DESC
        `).all(req.user.id);

        const getAreas = db.prepare('SELECT area FROM need_areas WHERE need_id = ?');
        const getPrefs = db.prepare('SELECT preference FROM need_preferences WHERE need_id = ?');
        const getOffers = db.prepare(`
            SELECT o.*, u.name as offerer_name, u.email as offerer_email,
                   p.title as property_title, p.area as property_area
            FROM offers o
            JOIN users u ON o.offerer_id = u.id
            LEFT JOIN properties p ON o.property_id = p.id
            WHERE o.need_id = ?
            ORDER BY o.created_at DESC
        `);

        needs = needs.map(need => {
            need.areas = getAreas.all(need.id).map(r => r.area);
            need.preferences = getPrefs.all(need.id).map(r => r.preference);
            need.offers = getOffers.all(need.id);
            return need;
        });

        res.json({ needs });
    } catch (err) {
        console.error('Get user needs error:', err);
        res.status(500).json({ error: 'Failed to fetch needs' });
    }
});

// Update need status
router.patch('/:id', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const need = db.prepare('SELECT * FROM needs WHERE id = ? AND user_id = ?')
            .get(req.params.id, req.user.id);

        if (!need) {
            return res.status(404).json({ error: 'Need not found or not yours' });
        }

        const { status } = req.body;
        if (status && ['active', 'matched', 'closed'].includes(status)) {
            db.prepare("UPDATE needs SET status = ?, updated_at = datetime('now') WHERE id = ?")
                .run(status, need.id);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Update need error:', err);
        res.status(500).json({ error: 'Failed to update need' });
    }
});

// Delete a need
router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const need = db.prepare('SELECT * FROM needs WHERE id = ? AND user_id = ?')
            .get(req.params.id, req.user.id);

        if (!need) {
            return res.status(404).json({ error: 'Need not found or not yours' });
        }

        db.prepare('DELETE FROM needs WHERE id = ?').run(need.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete need error:', err);
        res.status(500).json({ error: 'Failed to delete need' });
    }
});

module.exports = router;
