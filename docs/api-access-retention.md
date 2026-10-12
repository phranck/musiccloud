# API Access Retention

Two tables of the API-access system grow on their own, so a daily sweep removes their old rows. The periods are constants in `apps/backend/src/services/api-access-retention.ts`, and this document explains them.

## Usage rows

`api_usage_events` gains a row on every authenticated API request. A row is kept for 90 days (`USAGE_RETENTION_DAYS`).

Ninety days covers a quarter. That is longer than any range a usage screen offers, and long enough to answer whether a developer was always this busy. Nothing bills on these rows, so keeping them longer buys only disk.

## Audit rows

`api_access_audit_events` gains a row whenever an admin or a developer changes a project, an application or a key. A row is kept for 365 days (`AUDIT_RETENTION_DAYS`).

A year covers the longest billing period musiccloud sells. A change to a project's quota, plan or keys can still be traced for as long as the period it fell in can be disputed. Each row names the admin or developer who acted, so it is not kept beyond that.

The admin read of one project's trail, `GET /api/admin/developer/api-access/projects/:id/audit`, may ask for a range up to that same year and returns at most 200 entries per request.

## What runs the sweep

`apps/backend/src/scripts/api-access-retention.ts` runs once a day through the backend's Zerops crontab in `zerops.yml`, on the schedule `17 3 * * *`. It deletes the usage rows older than 90 days and the audit rows older than 365 days. Deleting a row that is already gone does nothing, so a missed night is caught up by the next run.
