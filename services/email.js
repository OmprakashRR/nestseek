const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
    if (!transporter) {
        if (process.env.SMTP_HOST) {
            // Production: use real SMTP
            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
        } else {
            // Development: log emails to console
            transporter = {
                sendMail: async (options) => {
                    console.log('\n--- EMAIL (dev mode) ---');
                    console.log('To:', options.to);
                    console.log('Subject:', options.subject);
                    console.log('Body:', options.text || options.html);
                    console.log('--- END EMAIL ---\n');
                    return { messageId: 'dev-' + Date.now() };
                }
            };
        }
    }
    return transporter;
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@nestseek.ie';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function sendVerificationEmail(user) {
    const link = `${APP_URL}/api/auth/verify/${user.verification_token}`;
    await getTransporter().sendMail({
        from: `NestSeek <${FROM_EMAIL}>`,
        to: user.email,
        subject: 'Verify your NestSeek account',
        html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #1a73e8;">Welcome to NestSeek!</h2>
                <p>Hi ${user.name},</p>
                <p>Please verify your email to get started:</p>
                <a href="${link}" style="display: inline-block; background: #1a73e8; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                    Verify My Email
                </a>
                <p style="color: #666; font-size: 14px; margin-top: 24px;">
                    Or copy this link: ${link}
                </p>
            </div>
        `
    });
}

async function sendNewOfferEmail(tenantEmail, tenantName, offer, property) {
    await getTransporter().sendMail({
        from: `NestSeek <${FROM_EMAIL}>`,
        to: tenantEmail,
        subject: `New offer on your accommodation need!`,
        html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #1a73e8;">You've got an offer!</h2>
                <p>Hi ${tenantName},</p>
                <p>A property owner has made an offer on your accommodation need:</p>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <p><strong>Rent:</strong> &euro;${offer.rent_proposed}/month</p>
                    ${property ? `<p><strong>Location:</strong> ${property.area}</p>` : ''}
                    ${property ? `<p><strong>Type:</strong> ${property.room_type}</p>` : ''}
                    ${offer.message ? `<p><strong>Message:</strong> ${offer.message}</p>` : ''}
                </div>
                <a href="${APP_URL}" style="display: inline-block; background: #1a73e8; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                    View Offer
                </a>
            </div>
        `
    });
}

async function sendOfferAcceptedEmail(ownerEmail, ownerName, booking) {
    await getTransporter().sendMail({
        from: `NestSeek <${FROM_EMAIL}>`,
        to: ownerEmail,
        subject: 'Your offer has been accepted!',
        html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #00c896;">Offer Accepted!</h2>
                <p>Hi ${ownerName},</p>
                <p>Great news! Your offer has been accepted.</p>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <p><strong>Agreed Rent:</strong> &euro;${booking.rent_amount}/month</p>
                </div>
                <p>Check your notifications on NestSeek for the tenant's contact details. You can now arrange the next steps directly.</p>
                <a href="${APP_URL}" style="display: inline-block; background: #1a73e8; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                    View Details
                </a>
            </div>
        `
    });
}

async function sendMatchNotification(tenantEmail, tenantName, property) {
    await getTransporter().sendMail({
        from: `NestSeek <${FROM_EMAIL}>`,
        to: tenantEmail,
        subject: 'We found a match for your accommodation need!',
        html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #1a73e8;">Match Found!</h2>
                <p>Hi ${tenantName},</p>
                <p>A new property just listed that matches what you're looking for:</p>
                <div style="background: #e8f0fe; border: 1px solid #1a73e8; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <p><strong>${property.title}</strong></p>
                    <p><strong>Area:</strong> ${property.area}</p>
                    <p><strong>Rent:</strong> &euro;${property.rent_monthly}/month</p>
                    <p><strong>Type:</strong> ${property.room_type}</p>
                    <p><strong>Available:</strong> ${property.available_from}${property.available_to ? ' to ' + property.available_to : ''}</p>
                </div>
                <a href="${APP_URL}" style="display: inline-block; background: #1a73e8; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                    View Property
                </a>
            </div>
        `
    });
}

module.exports = {
    sendVerificationEmail,
    sendNewOfferEmail,
    sendOfferAcceptedEmail,
    sendMatchNotification
};
