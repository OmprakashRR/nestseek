const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'nestseek.db');

let db;

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

function initDb() {
    const db = getDb();

    db.exec(`
        -- Users table
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            occupation TEXT,
            about TEXT,
            verified INTEGER DEFAULT 0,
            verification_token TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Needs table (tenant requirements)
        CREATE TABLE IF NOT EXISTS needs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('temporary', 'permanent')),
            budget_min INTEGER NOT NULL,
            budget_max INTEGER NOT NULL,
            room_type TEXT NOT NULL,
            move_in TEXT NOT NULL,
            move_out TEXT,
            about TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'matched', 'closed')),
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- Need areas (many-to-many)
        CREATE TABLE IF NOT EXISTS need_areas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            need_id TEXT NOT NULL,
            area TEXT NOT NULL,
            FOREIGN KEY (need_id) REFERENCES needs(id) ON DELETE CASCADE
        );

        -- Need preferences
        CREATE TABLE IF NOT EXISTS need_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            need_id TEXT NOT NULL,
            preference TEXT NOT NULL,
            FOREIGN KEY (need_id) REFERENCES needs(id) ON DELETE CASCADE
        );

        -- Properties table (listed by owners going abroad etc.)
        CREATE TABLE IF NOT EXISTS properties (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            address TEXT NOT NULL,
            area TEXT NOT NULL,
            room_type TEXT NOT NULL,
            rent_monthly INTEGER NOT NULL,
            deposit_amount INTEGER NOT NULL DEFAULT 0,
            available_from TEXT NOT NULL,
            available_to TEXT,
            type TEXT NOT NULL CHECK(type IN ('temporary', 'permanent')),
            description TEXT,
            furnished INTEGER DEFAULT 0,
            bills_included INTEGER DEFAULT 0,
            wifi INTEGER DEFAULT 0,
            parking INTEGER DEFAULT 0,
            pet_friendly INTEGER DEFAULT 0,
            near_transport INTEGER DEFAULT 0,
            rtb_registered INTEGER DEFAULT 0,
            rtb_number TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'booked', 'closed')),
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- Offers (property owner offers to a tenant need)
        CREATE TABLE IF NOT EXISTS offers (
            id TEXT PRIMARY KEY,
            need_id TEXT NOT NULL,
            property_id TEXT,
            offerer_id TEXT NOT NULL,
            rent_proposed INTEGER NOT NULL,
            message TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'withdrawn')),
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (need_id) REFERENCES needs(id) ON DELETE CASCADE,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
            FOREIGN KEY (offerer_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- Bookings (confirmed matches with payment)
        CREATE TABLE IF NOT EXISTS bookings (
            id TEXT PRIMARY KEY,
            need_id TEXT NOT NULL,
            property_id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            rent_amount INTEGER NOT NULL,
            deposit_amount INTEGER NOT NULL DEFAULT 0,
            start_date TEXT NOT NULL,
            end_date TEXT,
            stripe_payment_intent TEXT,
            deposit_status TEXT DEFAULT 'pending' CHECK(deposit_status IN ('pending', 'paid', 'refunded', 'disputed')),
            booking_status TEXT DEFAULT 'confirmed' CHECK(booking_status IN ('confirmed', 'active', 'completed', 'cancelled')),
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (need_id) REFERENCES needs(id),
            FOREIGN KEY (property_id) REFERENCES properties(id),
            FOREIGN KEY (tenant_id) REFERENCES users(id),
            FOREIGN KEY (owner_id) REFERENCES users(id)
        );

        -- Notifications
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            related_id TEXT,
            read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_needs_user ON needs(user_id);
        CREATE INDEX IF NOT EXISTS idx_needs_status ON needs(status);
        CREATE INDEX IF NOT EXISTS idx_needs_type ON needs(type);
        CREATE INDEX IF NOT EXISTS idx_need_areas_need ON need_areas(need_id);
        CREATE INDEX IF NOT EXISTS idx_properties_user ON properties(user_id);
        CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
        CREATE INDEX IF NOT EXISTS idx_properties_area ON properties(area);
        CREATE INDEX IF NOT EXISTS idx_offers_need ON offers(need_id);
        CREATE INDEX IF NOT EXISTS idx_offers_offerer ON offers(offerer_id);
        CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_bookings_owner ON bookings(owner_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    `);

    console.log('Database initialized successfully');
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDb, initDb, closeDb };
