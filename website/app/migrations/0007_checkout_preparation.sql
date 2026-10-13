CREATE TABLE payment_requests (
 id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
 amount INTEGER NOT NULL CHECK(amount>0),
 currency TEXT NOT NULL DEFAULT 'IQD' CHECK(currency='IQD'),
 provider TEXT NOT NULL,
 provider_reference TEXT UNIQUE,
 checkout_url TEXT,
 status TEXT NOT NULL CHECK(status IN ('creating','awaiting_payment','paid','expired','cancelled','review_required')),
 expires INTEGER,
 created_at INTEGER NOT NULL
);
CREATE TABLE whatsapp_payment_outbox (
 payment_id TEXT PRIMARY KEY REFERENCES payment_requests(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','failed','unknown','cancelled')),
 provider_sid TEXT,
 updated_at INTEGER NOT NULL
);
CREATE TRIGGER cancel_payment_on_booking_change AFTER UPDATE OF status,phone,whatsapp_opt_in ON bookings
WHEN NEW.status IN ('cancelled','rejected') OR NEW.phone='' OR NEW.whatsapp_opt_in=0
BEGIN
 UPDATE whatsapp_payment_outbox SET status='cancelled',updated_at=unixepoch()
 WHERE payment_id IN(SELECT id FROM payment_requests WHERE booking_id=NEW.id) AND status='queued';
 UPDATE payment_requests SET checkout_url=NULL,status=CASE WHEN status='paid' AND NEW.status='cancelled' THEN 'review_required' WHEN status IN ('creating','awaiting_payment') THEN 'cancelled' ELSE status END
 WHERE booking_id=NEW.id AND (NEW.status IN ('cancelled','rejected') OR NEW.phone='');
END;
