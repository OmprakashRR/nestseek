const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { sendVerificationEmail } = require('../services/email');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, phone, occupation, about } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const db = getDb();
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists' });
        }

        const id = uuidv4();
        const passwordHash = await bcrypt.hash(password, 12);
        const verificationToken = uuidv4();

        db.prepare(`
            INSERT INTO users (id, email, password_hash, name, phone, occupation, about, verification_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, email, passwordHash, name, phone || null, occupation || null, about || null, verificationToken);

        const user = { id, email, name, verification_token: verificationToken };

        // Send verification email
        sendVerificationEmail(user).catch(err => {
            console.error('Failed to send verification email:', err.message);
        });

        const token = generateToken(user);

        res.status(201).json({
            token,
            user: { id, email, name, phone, occupation, about, verified: false }
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = generateToken(user);

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                occupation: user.occupation,
                about: user.about,
                verified: !!user.verified
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Verify email
router.get('/verify/:token', (req, res) => {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE verification_token = ?').get(req.params.token);

    if (!user) {
        return res.status(400).json({ error: 'Invalid verification token' });
    }

    db.prepare('UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?').run(user.id);

    // Redirect to frontend with success
    res.redirect('/?verified=true');
});

// Get current user profile
router.get('/me', authenticateToken, (req, res) => {
    const db = getDb();
    const user = db.prepare('SELECT id, email, name, phone, occupation, about, verified, created_at FROM users WHERE id = ?')
        .get(req.user.id);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
});

// Update profile
router.put('/me', authenticateToken, async (req, res) => {
    try {
        const { name, phone, occupation, about } = req.body;
        const db = getDb();

        db.prepare(`
            UPDATE users SET name = ?, phone = ?, occupation = ?, about = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(name, phone || null, occupation || null, about || null, req.user.id);

        const user = db.prepare('SELECT id, email, name, phone, occupation, about, verified FROM users WHERE id = ?')
            .get(req.user.id);

        res.json({ user });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ error: 'Update failed' });
    }
});

module.exports = router;
