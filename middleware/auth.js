const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nestseek-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}

// Optional auth - sets req.user if token present, but doesn't require it
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            req.user = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            // Token invalid, continue without user
        }
    }
    next();
}

module.exports = { generateToken, authenticateToken, optionalAuth, JWT_SECRET };
