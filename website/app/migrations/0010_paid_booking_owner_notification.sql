-- Paid automatic confirmation must notify administration as well as the customer.
-- No event is sent for an unpaid hold, and replay cannot duplicate this event.
CREATE TRIGGER push_paid_booking_owner AFTER UPDATE OF status ON bookings
WHEN NEW.payment_required=1 AND OLD.status!='confirmed' AND NEW.status='confirmed'
BEGIN
 INSERT OR IGNORE INTO push_events(id,booking_id,role,kind,created_at,title,body)
 VALUES(NEW.id||':owner-paid',NEW.id,'owner','confirmed',unixepoch(),'حجز مدفوع جديد','تأكد حجز بعد التحقق من الدفع. افتح الإدارة لمراجعة الموعد.');
END;
