const { getDb } = require('../database');
const { sendMatchNotification } = require('./email');
const { v4: uuidv4 } = require('uuid');

// Score a property against a tenant need (0-100)
function calculateMatchScore(need, property, needAreas, needPreferences) {
    let score = 0;
    let maxScore = 0;

    // 1. Area match (30 points)
    maxScore += 30;
    const areaMatch = needAreas.some(a =>
        a.toLowerCase().includes(property.area.toLowerCase()) ||
        property.area.toLowerCase().includes(a.toLowerCase())
    );
    if (areaMatch) score += 30;

    // 2. Budget match (25 points)
    maxScore += 25;
    if (property.rent_monthly >= need.budget_min && property.rent_monthly <= need.budget_max) {
        score += 25;
    } else if (property.rent_monthly <= need.budget_max * 1.1) {
        // Within 10% over budget - partial match
        score += 10;
    }

    // 3. Room type match (20 points)
    maxScore += 20;
    if (property.room_type === need.room_type) {
        score += 20;
    }

    // 4. Date overlap (15 points) - critical for temporary
    maxScore += 15;
    if (need.type === 'temporary' && need.move_out) {
        const needStart = new Date(need.move_in);
        const needEnd = new Date(need.move_out);
        const propStart = new Date(property.available_from);
        const propEnd = property.available_to ? new Date(property.available_to) : new Date('2099-12-31');

        // Property must be available for the entire need period
        if (propStart <= needStart && propEnd >= needEnd) {
            score += 15; // Perfect date match
        } else {
            // Check partial overlap
            const overlapStart = new Date(Math.max(needStart, propStart));
            const overlapEnd = new Date(Math.min(needEnd, propEnd));
            const overlapDays = (overlapEnd - overlapStart) / (1000 * 60 * 60 * 24);
            const needDays = (needEnd - needStart) / (1000 * 60 * 60 * 24);
            if (overlapDays > 0 && needDays > 0) {
                score += Math.round(15 * (overlapDays / needDays));
            }
        }
    } else {
        // Permanent - just check property is available from/before needed
        const needStart = new Date(need.move_in);
        const propStart = new Date(property.available_from);
        if (propStart <= needStart) {
            score += 15;
        } else {
            // Available within 2 weeks of need
            const diff = (propStart - needStart) / (1000 * 60 * 60 * 24);
            if (diff <= 14) score += 10;
        }
    }

    // 5. Preference matches (10 points)
    maxScore += 10;
    const prefMap = {
        'Furnished': property.furnished,
        'Bills Included': property.bills_included,
        'WiFi': property.wifi,
        'Parking': property.parking,
        'Pet Friendly': property.pet_friendly,
        'Near Transport': property.near_transport
    };
    if (needPreferences.length > 0) {
        const matched = needPreferences.filter(p => prefMap[p]).length;
        score += Math.round(10 * (matched / needPreferences.length));
    } else {
        score += 10; // No preferences = everything matches
    }

    return Math.round((score / maxScore) * 100);
}

// Find matching needs for a newly listed property
async function findMatchesForProperty(property) {
    const db = getDb();
    const activeNeeds = db.prepare(`
        SELECT * FROM needs WHERE status = 'active' AND type = ?
    `).all(property.type);

    const matches = [];

    for (const need of activeNeeds) {
        const areas = db.prepare('SELECT area FROM need_areas WHERE need_id = ?')
            .all(need.id).map(r => r.area);
        const prefs = db.prepare('SELECT preference FROM need_preferences WHERE need_id = ?')
            .all(need.id).map(r => r.preference);

        const score = calculateMatchScore(need, property, areas, prefs);

        if (score >= 50) { // Only notify for decent matches
            matches.push({ need, score });

            // Create notification
            const notifId = uuidv4();
            db.prepare(`
                INSERT INTO notifications (id, user_id, type, title, message, related_id)
                VALUES (?, ?, 'match', ?, ?, ?)
            `).run(
                notifId,
                need.user_id,
                'New match found!',
                `A property in ${property.area} matches your need (${score}% match) - €${property.rent_monthly}/mo`,
                property.id
            );

            // Send email
            const user = db.prepare('SELECT * FROM users WHERE id = ?').get(need.user_id);
            if (user) {
                sendMatchNotification(user.email, user.name, property).catch(err => {
                    console.error('Failed to send match email:', err.message);
                });
            }
        }
    }

    return matches.sort((a, b) => b.score - a.score);
}

// Find matching properties for a newly posted need
function findMatchesForNeed(need, needAreas, needPreferences) {
    const db = getDb();
    const activeProperties = db.prepare(`
        SELECT * FROM properties WHERE status = 'active' AND type = ?
    `).all(need.type);

    const matches = [];

    for (const property of activeProperties) {
        const score = calculateMatchScore(need, property, needAreas, needPreferences);

        if (score >= 50) {
            matches.push({ property, score });
        }
    }

    return matches.sort((a, b) => b.score - a.score);
}

module.exports = { calculateMatchScore, findMatchesForProperty, findMatchesForNeed };
