ALTER TABLE farms ADD COLUMN evening_price INTEGER;
ALTER TABLE bookings ADD COLUMN period TEXT NOT NULL DEFAULT 'full_day' CHECK(period IN ('morning','evening','full_day'));
ALTER TABLE reserved_dates RENAME TO reserved_dates_legacy;
CREATE TABLE reserved_dates (
 farm_id TEXT NOT NULL,
 date TEXT NOT NULL,
 period TEXT NOT NULL CHECK(period IN ('morning','evening')),
 booking_id TEXT NOT NULL,
 PRIMARY KEY(farm_id,date,period),
 UNIQUE(booking_id,period)
);
INSERT INTO reserved_dates(farm_id,date,period,booking_id)
SELECT farm_id,date,'morning',booking_id FROM reserved_dates_legacy
UNION ALL
SELECT farm_id,date,'evening',booking_id FROM reserved_dates_legacy;
DROP TABLE reserved_dates_legacy;
CREATE INDEX reserved_dates_booking ON reserved_dates(booking_id);
