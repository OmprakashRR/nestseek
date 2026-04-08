const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { sendNewOfferEmail, sendOfferAcceptedEmail } = require('../services/email');

const router = express.Router();

// Make an offer on a need
router.post('/', authenticateToken, (req, res) => {
    try {
        const { need_id, property_id, rent_proposed, message } = req.body;

        if (!need_id || !rent_proposed) {
            return res.status(400).json({ error: 'Need ID and proposed rent are required' });
        }

        const db = getDb();

        const need = db.prepare(`
            SELECT n.*, u.email as tenant_email, u.name as tenant_name
            FROM needs n JOIN users u ON n.user_id = u.id
            WHERE n.id = ? AND n.status = 'active'
        `).get(need_id);

        if (!need) {
            return res.status(404).json({ error: 'Need not found or no longer active' });
        }

        if (need.user_id === req.user.id) {
            return res.status(400).json({ error: 'Cannot make an offer on your own need' });
        }

        let property = null;
        if (property_id) {
            property = db.prepare('SELECT * FROM properties WHERE id = ? AND user_id = ?')
                .get(property_id, req.user.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found or not yours' });
            }
        }

        const id = uuidv4();
        db.prepare(`
            INSERT INTO offers (id, need_id, property_id, offerer_id, rent_proposed, message)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, need_id, property_id || null, req.user.id, rent_proposed, message || null);

        // Notify tenant
        db.prepare(`
            INSERT INTO notifications (id, user_id, type, title, message, related_id)
            VALUES (?, ?, 'offer', ?, ?, ?)
        `).run(
            uuidv4(), need.user_id, 'New offer received!',
            `Someone offered \u20AC${rent_proposed}/mo for your accommodation need`, id
        );

        sendNewOfferEmail(need.tenant_email, need.tenant_name, { rent_proposed, message }, property)
            .catch(err => console.error('Failed to send offer email:', err.message));

        res.status(201).json({ offer: { id, need_id, property_id, rent_proposed, message, status: 'pending' } });
    } catch (err) {
        console.error('Create offer error:', err);
        res.status(500).json({ error: 'Failed to create offer' });
    }
});

// Accept an offer - shares contact details, no payment
router.post('/:id/accept', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const offer = db.prepare(`
            SELECT o.*, n.user_id as need_owner_id
            FROM offers o JOIN needs n ON o.need_id = n.id
            WHERE o.id = ?
        `).get(req.params.id);

        if (!offer) {
            return res.status(404).json({ error: 'Offer not found' });
        }

        if (offer.need_owner_id !== req.user.id) {
            return res.status(403).json({ error: 'Only the need owner can accept offers' });
        }

        if (offer.status !== 'pending') {
            return res.status(400).json({ error: 'Offer is no longer pending' });
        }

        // Accept this offer
        db.prepare("UPDATE offers SET status = 'accepted' WHERE id = ?").run(offer.id);

        // Decline other pending offers for this need
        db.prepare("UPDATE offers SET status = 'declined' WHERE need_id = ? AND id != ? AND status = 'pending'")
            .run(offer.need_id, offer.id);

        // Mark need as matched
        db.prepare("UPDATE needs SET status = 'matched' WHERE id = ?").run(offer.need_id);

        // Mark property as booked if linked
        if (offer.property_id) {
            db.prepare("UPDATE properties SET status = 'booked' WHERE id = ?").run(offer.property_id);
        }

        // Notify the offerer with tenant contact details
        const tenant = db.prepare('SELECT name, email, phone FROM users WHERE id = ?').get(req.user.id);
        const offerer = db.prepare('SELECT email, name FROM users WHERE id = ?').get(offer.offerer_id);

        if (offerer) {
            const contactMsg = `Your offer was accepted by ${tenant.name}! Contact them at ${tenant.email}${tenant.phone ? ' / ' + tenant.phone : ''} to arrange the details.`;
            db.prepare(`
                INSERT INTO notifications (id, user_id, type, title, message, related_id)
                VALUES (?, ?, 'accepted', ?, ?, ?)
            `).run(uuidv4(), offer.offerer_id, 'Offer accepted!', contactMsg, offer.id);

            // Send email with contact details
            sendOfferAcceptedEmail(offerer.email, offerer.name, {
                rent_amount: offer.rent_proposed,
                start_date: 'As agreed',
                end_date: null
            }).catch(err => console.error('Failed to send acceptance email:', err.message));
        }

        // Send offerer contact back to tenant
        if (offerer) {
            const ownerContactMsg = `You accepted an offer from ${offerer.name}. Contact them at ${offerer.email} to arrange the details.`;
            db.prepare(`
                INSERT INTO notifications (id, user_id, type, title, message, related_id)
                VALUES (?, ?, 'accepted', ?, ?, ?)
            `).run(uuidv4(), req.user.id, 'Contact details', ownerContactMsg, offer.id);
        }

        res.json({ success: true, message: 'Offer accepted! Contact details shared via notifications and email.' });
    } catch (err) {
        console.error('Accept offer error:', err);
        res.status(500).json({ error: 'Failed to accept offer' });
    }
});

// Decline an offer
router.post('/:id/decline', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const offer = db.prepare(`
            SELECT o.*, n.user_id as need_owner_id
            FROM offers o JOIN needs n ON o.need_id = n.id
            WHERE o.id = ?
        `).get(req.params.id);

        if (!offer || offer.need_owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Offer not found' });
        }

        db.prepare("UPDATE offers SET status = 'declined' WHERE id = ?").run(offer.id);

        db.prepare(`
            INSERT INTO notifications (id, user_id, type, title, message, related_id)
            VALUES (?, ?, 'declined', ?, ?, ?)
        `).run(uuidv4(), offer.offerer_id, 'Offer declined', 'Your offer has been declined by the tenant.', offer.id);

        res.json({ success: true });
    } catch (err) {
        console.error('Decline offer error:', err);
        res.status(500).json({ error: 'Failed to decline offer' });
    }
});

// Withdraw an offer
router.post('/:id/withdraw', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const offer = db.prepare('SELECT * FROM offers WHERE id = ? AND offerer_id = ?')
            .get(req.params.id, req.user.id);

        if (!offer) {
            return res.status(404).json({ error: 'Offer not found' });
        }

        if (offer.status !== 'pending') {
            return res.status(400).json({ error: 'Can only withdraw pending offers' });
        }

        db.prepare("UPDATE offers SET status = 'withdrawn' WHERE id = ?").run(offer.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Withdraw offer error:', err);
        res.status(500).json({ error: 'Failed to withdraw offer' });
    }
});

// Get offers made by current user
router.get('/mine', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const myOffers = db.prepare(`
            SELECT o.*, n.type as need_type, n.room_type as need_room_type,
                   n.budget_min, n.budget_max, u.name as tenant_name
            FROM offers o
            JOIN needs n ON o.need_id = n.id
            JOIN users u ON n.user_id = u.id
            WHERE o.offerer_id = ?
            ORDER BY o.created_at DESC
        `).all(req.user.id);

        res.json({ offers: myOffers });
    } catch (err) {
        console.error('Get my offers error:', err);
        res.status(500).json({ error: 'Failed to fetch offers' });
    }
});

module.exports = router;
