CREATE TABLE customers (id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, booking_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE customer_sessions (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX customer_sessions_customer ON customer_sessions(customer_id);
CREATE TABLE phone_challenges (id TEXT PRIMARY KEY, phone TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX phone_challenges_expiry ON phone_challenges(expires);
