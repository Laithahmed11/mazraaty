-- Existing pending/confirmed bookings keep their original approval flow.
ALTER TABLE bookings ADD COLUMN payment_required INTEGER NOT NULL DEFAULT 0 CHECK(payment_required IN (0,1));
ALTER TABLE bookings ADD COLUMN hold_until INTEGER;
CREATE INDEX bookings_payment_holds ON bookings(status,hold_until);

-- The unique slot key arbitrates concurrent customers in the booking INSERT.
CREATE TRIGGER reserve_payment_hold AFTER INSERT ON bookings WHEN NEW.status='awaiting_payment'
BEGIN
 SELECT CASE WHEN NEW.payment_required!=1 OR NEW.hold_until IS NULL OR NEW.hold_until<=unixepoch()
 THEN RAISE(ABORT,'Invalid payment hold') END;
 INSERT INTO reserved_dates(farm_id,date,period,booking_id)
 SELECT NEW.farm_id,NEW.date,p.period,NEW.id FROM (SELECT 'morning' AS period UNION ALL SELECT 'evening') p
 WHERE NEW.period=p.period OR NEW.period='full_day';
END;
CREATE TRIGGER guard_payment_confirmation BEFORE UPDATE OF status ON bookings
WHEN NEW.payment_required=1 AND NEW.status='confirmed' AND OLD.status!='confirmed'
BEGIN
 SELECT CASE WHEN OLD.status!='awaiting_payment' OR OLD.hold_until<=unixepoch() OR OLD.hold_until IS NULL
 OR NOT EXISTS(SELECT 1 FROM payment_requests WHERE booking_id=NEW.id AND status='paid' AND amount=NEW.total)
 OR (SELECT COUNT(*) FROM reserved_dates WHERE booking_id=NEW.id)!=CASE WHEN NEW.period='full_day' THEN 2 ELSE 1 END
 THEN RAISE(ABORT,'Verified payment and active slot required') END;
END;
CREATE TRIGGER confirm_paid_hold AFTER UPDATE OF status ON payment_requests
WHEN NEW.status='paid' AND OLD.status!='paid'
BEGIN
 UPDATE bookings SET status='confirmed',hold_until=NULL
 WHERE id=NEW.booking_id AND payment_required=1 AND status='awaiting_payment' AND hold_until>unixepoch();
END;
CREATE TRIGGER release_payment_hold AFTER UPDATE OF status ON bookings
WHEN OLD.status='awaiting_payment' AND NEW.status!='awaiting_payment' AND NEW.status!='confirmed'
BEGIN
 DELETE FROM reserved_dates WHERE booking_id=NEW.id;
 UPDATE payment_requests SET checkout_url=NULL,status=CASE WHEN status IN ('creating','awaiting_payment') THEN 'expired' ELSE status END WHERE booking_id=NEW.id;
 UPDATE whatsapp_payment_outbox SET status='cancelled',updated_at=unixepoch() WHERE payment_id IN(SELECT id FROM payment_requests WHERE booking_id=NEW.id) AND status='queued';
END;
CREATE TRIGGER expire_failed_payment_hold AFTER UPDATE OF status ON payment_requests
WHEN NEW.status='expired'
BEGIN UPDATE bookings SET status='expired' WHERE id=NEW.booking_id AND status='awaiting_payment' AND payment_required=1; END;
CREATE TRIGGER release_deleted_payment_hold AFTER DELETE ON bookings WHEN OLD.payment_required=1
BEGIN DELETE FROM reserved_dates WHERE booking_id=OLD.id; END;
