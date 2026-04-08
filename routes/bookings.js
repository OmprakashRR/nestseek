const express = require('express');
const { getDb } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { createDepositPayment, refundDeposit } = require('../services/payments');

const router = express.Router();

// Get current user's bookings (as tenant or owner)
router.get('/', authenticateToken, (req, res) => {
    try {
        const db = getDb();

        const asTenant = db.prepare(`
            SELECT b.*, u.name as owner_name, u.email as owner_email,
                   p.title as property_title, p.area as property_area, p.address as property_address
            FROM bookings b
            JOIN users u ON b.owner_id = u.id
            LEFT JOIN properties p ON b.property_id = p.id
            WHERE b.tenant_id = ?
            ORDER BY b.created_at DESC
        `).all(req.user.id);

        const asOwner = db.prepare(`
            SELECT b.*, u.name as tenant_name, u.email as tenant_email,
                   p.title as property_title, p.area as property_area
            FROM bookings b
            JOIN users u ON b.tenant_id = u.id
            LEFT JOIN properties p ON b.property_id = p.id
            WHERE b.owner_id = ?
            ORDER BY b.created_at DESC
        `).all(req.user.id);

        res.json({ as_tenant: asTenant, as_owner: asOwner });
    } catch (err) {
        console.error('Get bookings error:', err);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// Retry deposit payment
router.post('/:id/pay-deposit', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND tenant_id = ?')
            .get(req.params.id, req.user.id);

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        if (booking.deposit_status === 'paid') {
            return res.status(400).json({ error: 'Deposit already paid' });
        }

        const paymentData = await createDepositPayment(booking);
        res.json({ payment: paymentData });
    } catch (err) {
        console.error('Deposit payment error:', err);
        res.status(500).json({ error: 'Failed to create payment' });
    }
});

// Cancel booking and request refund
router.post('/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND (tenant_id = ? OR owner_id = ?)')
            .get(req.params.id, req.user.id, req.user.id);

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        if (booking.booking_status === 'cancelled') {
            return res.status(400).json({ error: 'Booking already cancelled' });
        }

        // Process refund if deposit was paid
        if (booking.deposit_status === 'paid') {
            try {
                await refundDeposit(booking.id);
            } catch (err) {
                console.error('Refund error:', err.message);
            }
        }

        db.prepare("UPDATE bookings SET booking_status = 'cancelled' WHERE id = ?").run(booking.id);

        // Reactivate the need and property
        db.prepare("UPDATE needs SET status = 'active' WHERE id = ?").run(booking.need_id);
        if (booking.property_id) {
            db.prepare("UPDATE properties SET status = 'active' WHERE id = ?").run(booking.property_id);
        }

        res.json({ success: true, refunded: booking.deposit_status === 'paid' });
    } catch (err) {
        console.error('Cancel booking error:', err);
        res.status(500).json({ error: 'Failed to cancel booking' });
    }
});

module.exports = router;
