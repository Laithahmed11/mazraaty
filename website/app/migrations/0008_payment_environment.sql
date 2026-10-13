-- Keep sandbox receipts distinguishable from actual money received.
ALTER TABLE payment_requests ADD COLUMN environment TEXT NOT NULL DEFAULT 'live' CHECK(environment IN ('test','live'));
