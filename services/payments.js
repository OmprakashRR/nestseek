const { getDb } = require('../database');
const { sendDepositConfirmation } = require('./email');

let stripe;

function getStripe() {
    if (!stripe) {
        const Stripe = require('stripe');
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
    }
    return stripe;
}

// Create a payment intent for a deposit
async function createDepositPayment(booking) {
    const s = getStripe();

    const paymentIntent = await s.paymentIntents.create({
        amount: booking.deposit_amount * 100, // Stripe uses cents
        currency: 'eur',
        metadata: {
            booking_id: booking.id,
            tenant_id: booking.tenant_id,
            owner_id: booking.owner_id
        },
        description: `NestSeek deposit - Booking ${booking.id}`,
        // Hold the funds rather than immediately capturing
        capture_method: 'manual'
    });

    // Store the payment intent ID
    const db = getDb();
    db.prepare(`
        UPDATE bookings SET stripe_payment_intent = ? WHERE id = ?
    `).run(paymentIntent.id, booking.id);

    return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: booking.deposit_amount
    };
}

// Confirm deposit payment (called after Stripe webhook confirms payment)
async function confirmDeposit(paymentIntentId) {
    const db = getDb();
    const booking = db.prepare(`
        SELECT b.*, u.email, u.name FROM bookings b
        JOIN users u ON b.tenant_id = u.id
        WHERE b.stripe_payment_intent = ?
    `).get(paymentIntentId);

    if (!booking) {
        throw new Error('Booking not found for payment intent');
    }

    // Capture the held funds
    const s = getStripe();
    await s.paymentIntents.capture(paymentIntentId);

    // Update booking status
    db.prepare(`
        UPDATE bookings
        SET deposit_status = 'paid', booking_status = 'active'
        WHERE id = ?
    `).run(booking.id);

    // Send confirmation email
    await sendDepositConfirmation(booking.email, booking.name, booking);

    return booking;
}

// Refund deposit
async function refundDeposit(bookingId) {
    const db = getDb();
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);

    if (!booking || !booking.stripe_payment_intent) {
        throw new Error('Booking or payment not found');
    }

    const s = getStripe();
    await s.refunds.create({
        payment_intent: booking.stripe_payment_intent
    });

    db.prepare(`
        UPDATE bookings SET deposit_status = 'refunded' WHERE id = ?
    `).run(bookingId);

    return booking;
}

// Handle Stripe webhook events
async function handleWebhook(event) {
    switch (event.type) {
        case 'payment_intent.amount_capturable_updated':
            // Payment authorized, ready to capture
            const pi = event.data.object;
            await confirmDeposit(pi.id);
            break;

        case 'payment_intent.payment_failed':
            const failedPi = event.data.object;
            const db = getDb();
            db.prepare(`
                UPDATE bookings SET deposit_status = 'pending'
                WHERE stripe_payment_intent = ?
            `).run(failedPi.id);
            break;
    }
}

module.exports = { createDepositPayment, confirmDeposit, refundDeposit, handleWebhook };
