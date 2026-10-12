-- A project subscription's interval is the billing period of the offer it is
-- to, in Creem's spelling. Rows written earlier spell it `month` or `year`.
UPDATE "developer_project_subscriptions" SET "interval" = 'every-month' WHERE "interval" = 'month';--> statement-breakpoint
UPDATE "developer_project_subscriptions" SET "interval" = 'every-year' WHERE "interval" = 'year';
