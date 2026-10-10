CREATE TABLE farm_reviews (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 farm_id TEXT NOT NULL REFERENCES farms(id),
 principal TEXT NOT NULL,
 stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
 created_at INTEGER NOT NULL
);
CREATE INDEX farm_reviews_farm ON farm_reviews(farm_id);
-- No phone/name retained. Keep separately during restore to prevent resurrecting data.
CREATE TABLE deletion_ledger (principal TEXT PRIMARY KEY, deleted_at INTEGER NOT NULL);
CREATE TRIGGER account_data_deleted AFTER UPDATE OF revoked ON devices
WHEN NEW.revoked=1 AND OLD.revoked!=1
BEGIN
 INSERT OR REPLACE INTO deletion_ledger(principal,deleted_at) VALUES(NEW.hash,unixepoch());
 DELETE FROM farm_reviews WHERE principal=NEW.hash;
END;
