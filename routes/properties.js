const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { findMatchesForProperty } = require('../services/matching');

const router = express.Router();

// List a property
router.post('/', authenticateToken, (req, res) => {
    try {
        const {
            title, address, area, room_type, rent_monthly, deposit_amount,
            available_from, available_to, type, description,
            furnished, bills_included, wifi, parking, pet_friendly, near_transport,
            rtb_registered, rtb_number
        } = req.body;

        if (!title || !address || !area || !room_type || !rent_monthly || !available_from || !type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // RTB compliance check for permanent rentals
        if (type === 'permanent' && !rtb_registered) {
            return res.status(400).json({
                error: 'RTB registration is required for permanent rentals in Ireland. Please register with the Residential Tenancies Board before listing.',
                rtb_required: true
            });
        }

        const db = getDb();
        const id = uuidv4();

        db.prepare(`
            INSERT INTO properties (
                id, user_id, title, address, area, room_type, rent_monthly, deposit_amount,
                available_from, available_to, type, description,
                furnished, bills_included, wifi, parking, pet_friendly, near_transport,
                rtb_registered, rtb_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, req.user.id, title, address, area, room_type, rent_monthly,
            deposit_amount || 0, available_from, available_to || null, type,
            description || null,
            furnished ? 1 : 0, bills_included ? 1 : 0, wifi ? 1 : 0,
            parking ? 1 : 0, pet_friendly ? 1 : 0, near_transport ? 1 : 0,
            rtb_registered ? 1 : 0, rtb_number || null
        );

        const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);

        // Find matching tenant needs and notify them
        findMatchesForProperty(property).catch(err => {
            console.error('Match finding error:', err.message);
        });

        res.status(201).json({ property });
    } catch (err) {
        console.error('Create property error:', err);
        res.status(500).json({ error: 'Failed to list property' });
    }
});

// Get all active properties
router.get('/', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const { type, room_type, area, max_rent, page = 1, limit = 20 } = req.query;

        let query = `
            SELECT p.*, u.name as owner_name, u.verified as owner_verified
            FROM properties p
            JOIN users u ON p.user_id = u.id
            WHERE p.status = 'active'
        `;
        const params = [];

        if (type && type !== 'all') {
            query += ' AND p.type = ?';
            params.push(type);
        }
        if (room_type && room_type !== 'all') {
            query += ' AND p.room_type = ?';
            params.push(room_type);
        }
        if (area) {
            query += ' AND LOWER(p.area) LIKE ?';
            params.push(`%${area.toLowerCase()}%`);
        }
        if (max_rent) {
            query += ' AND p.rent_monthly <= ?';
            params.push(parseInt(max_rent));
        }

        query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const properties = db.prepare(query).all(...params);
        res.json({ properties });
    } catch (err) {
        console.error('Get properties error:', err);
        res.status(500).json({ error: 'Failed to fetch properties' });
    }
});

// Get a single property
router.get('/:id', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const property = db.prepare(`
            SELECT p.*, u.name as owner_name, u.verified as owner_verified
            FROM properties p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ?
        `).get(req.params.id);

        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }

        res.json({ property });
    } catch (err) {
        console.error('Get property error:', err);
        res.status(500).json({ error: 'Failed to fetch property' });
    }
});

// Get current user's properties
router.get('/user/mine', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const properties = db.prepare(`
            SELECT * FROM properties WHERE user_id = ? ORDER BY created_at DESC
        `).all(req.user.id);

        res.json({ properties });
    } catch (err) {
        console.error('Get user properties error:', err);
        res.status(500).json({ error: 'Failed to fetch properties' });
    }
});

// Update property
router.put('/:id', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const property = db.prepare('SELECT * FROM properties WHERE id = ? AND user_id = ?')
            .get(req.params.id, req.user.id);

        if (!property) {
            return res.status(404).json({ error: 'Property not found or not yours' });
        }

        const {
            title, address, area, room_type, rent_monthly, deposit_amount,
            available_from, available_to, type, description,
            furnished, bills_included, wifi, parking, pet_friendly, near_transport,
            rtb_registered, rtb_number, status
        } = req.body;

        db.prepare(`
            UPDATE properties SET
                title = ?, address = ?, area = ?, room_type = ?, rent_monthly = ?,
                deposit_amount = ?, available_from = ?, available_to = ?, type = ?,
                description = ?, furnished = ?, bills_included = ?, wifi = ?,
                parking = ?, pet_friendly = ?, near_transport = ?,
                rtb_registered = ?, rtb_number = ?, status = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `).run(
            title, address, area, room_type, rent_monthly,
            deposit_amount || 0, available_from, available_to || null, type,
            description || null,
            furnished ? 1 : 0, bills_included ? 1 : 0, wifi ? 1 : 0,
            parking ? 1 : 0, pet_friendly ? 1 : 0, near_transport ? 1 : 0,
            rtb_registered ? 1 : 0, rtb_number || null,
            status || property.status,
            property.id
        );

        const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(property.id);
        res.json({ property: updated });
    } catch (err) {
        console.error('Update property error:', err);
        res.status(500).json({ error: 'Failed to update property' });
    }
});

// Delete property
router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const property = db.prepare('SELECT * FROM properties WHERE id = ? AND user_id = ?')
            .get(req.params.id, req.user.id);

        if (!property) {
            return res.status(404).json({ error: 'Property not found or not yours' });
        }

        db.prepare('DELETE FROM properties WHERE id = ?').run(property.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete property error:', err);
        res.status(500).json({ error: 'Failed to delete property' });
    }
});

module.exports = router;
