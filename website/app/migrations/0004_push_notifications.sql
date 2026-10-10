-- Additive outbox: booking writes and their notification event commit together.
CREATE TABLE push_devices (
 token_hash TEXT PRIMARY KEY, token TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','customer')),
 principal TEXT NOT NULL, session_id TEXT NOT NULL, binding TEXT NOT NULL,
 registered_at INTEGER NOT NULL, marketing INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX push_devices_session ON push_devices(session_id);
CREATE TABLE push_events (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, role TEXT NOT NULL,
 kind TEXT NOT NULL, created_at INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT ''
);
CREATE TABLE push_deliveries (
 event_id TEXT NOT NULL, token_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(event_id,token_hash)
);
CREATE TRIGGER push_booking_created AFTER INSERT ON bookings WHEN NEW.status='pending'
BEGIN
 INSERT OR IGNORE INTO push_events(id,booking_id,role,kind,created_at) VALUES(NEW.id||':new',NEW.id,'owner','new',unixepoch());
END;
CREATE TRIGGER push_booking_changed AFTER UPDATE OF status ON bookings
WHEN OLD.status!=NEW.status AND NEW.status IN ('confirmed','rejected','cancelled')
BEGIN
 INSERT OR IGNORE INTO push_events(id,booking_id,role,kind,created_at) VALUES(NEW.id||':'||NEW.status,NEW.id,'customer',NEW.status,unixepoch());
 INSERT OR IGNORE INTO push_events(id,booking_id,role,kind,created_at) SELECT NEW.id||':owner-cancel',NEW.id,'owner','cancelled',unixepoch() WHERE NEW.status='cancelled';
END;
CREATE TRIGGER push_customer_session_deleted AFTER DELETE ON customer_sessions
BEGIN DELETE FROM push_devices WHERE role='customer' AND session_id=OLD.id; END;
CREATE TRIGGER push_admin_session_deleted AFTER DELETE ON sessions
BEGIN DELETE FROM push_devices WHERE role='owner' AND session_id=OLD.id; END;
