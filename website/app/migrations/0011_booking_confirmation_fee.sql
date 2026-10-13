-- Preserve the contract of every existing booking and provider order.
-- New bookings explicitly store 8; old bookings retain full-payment semantics.
ALTER TABLE bookings ADD COLUMN payment_percent INTEGER NOT NULL DEFAULT 100 CHECK(payment_percent IN (8,100));
DROP TRIGGER guard_payment_confirmation;
CREATE TRIGGER guard_payment_confirmation BEFORE UPDATE OF status ON bookings
WHEN NEW.payment_required=1 AND NEW.status='confirmed' AND OLD.status!='confirmed' AND
 (OLD.status!='awaiting_payment' OR OLD.hold_until<=unixepoch() OR OLD.hold_until IS NULL
 OR NOT EXISTS(SELECT 1 FROM payment_requests WHERE booking_id=NEW.id AND status='paid' AND amount=(NEW.total*NEW.payment_percent+99)/100)
 OR (SELECT COUNT(*) FROM reserved_dates WHERE booking_id=NEW.id)!=(1+(NEW.period='full_day')))
BEGIN SELECT RAISE(ABORT,'Verified payment and active slot required'); END;
CREATE TRIGGER preserve_booking_payment_plan BEFORE UPDATE OF total,payment_percent ON bookings
WHEN (NEW.total!=OLD.total OR NEW.payment_percent!=OLD.payment_percent)
 AND EXISTS(SELECT 1 FROM payment_requests WHERE booking_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'Payment plan is already committed'); END;
