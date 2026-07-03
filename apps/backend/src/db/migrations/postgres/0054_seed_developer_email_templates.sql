-- Seed default templates + enabled bindings for the two required developer
-- actions (MC-081). `developerVerificationRequested` and
-- `developerPasswordResetRequested` are `required: true` in the shared
-- EMAIL_ACTIONS registry: without an enabled binding, `triggerEmailAction`
-- throws and the developer signup / password-reset flows would break after
-- deploy. Copy matches the previously hardcoded mails from the removed
-- `services/developer-email.ts`. Idempotent: template inserts skip on name
-- conflict, binding inserts skip when the action already has any binding.
INSERT INTO "email_templates" ("name", "subject", "is_system_template", "blocks")
VALUES
  (
    'Developer email verification',
    'Verify your musiccloud developer account',
    true,
    '[{"type":"text","markdown":"## Verify your email\n\nConfirm your email address to finish setting up your musiccloud developer account."},{"type":"button","label":"Verify email","url":"{{verifyUrl}}"}]'::jsonb
  ),
  (
    'Developer password reset',
    'Reset your musiccloud password',
    true,
    '[{"type":"text","markdown":"## Reset your password\n\nWe received a request to reset the password for your musiccloud developer account."},{"type":"button","label":"Reset password","url":"{{resetUrl}}"}]'::jsonb
  )
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "email_action_bindings" ("id", "action_key", "template_id", "enabled")
SELECT 'seed-developer-verification', 'developerVerificationRequested', t."id", true
FROM "email_templates" t
WHERE t."name" = 'Developer email verification'
  AND NOT EXISTS (
    SELECT 1 FROM "email_action_bindings" b WHERE b."action_key" = 'developerVerificationRequested'
  );
--> statement-breakpoint
INSERT INTO "email_action_bindings" ("id", "action_key", "template_id", "enabled")
SELECT 'seed-developer-password-reset', 'developerPasswordResetRequested', t."id", true
FROM "email_templates" t
WHERE t."name" = 'Developer password reset'
  AND NOT EXISTS (
    SELECT 1 FROM "email_action_bindings" b WHERE b."action_key" = 'developerPasswordResetRequested'
  );
