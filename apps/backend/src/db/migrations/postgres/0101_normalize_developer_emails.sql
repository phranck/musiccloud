-- Brings every developer sign-in address into the form it is looked up in.
--
-- `developer_accounts.email` is compared exactly, and every sign-in path trims
-- and lowercases what a person types before it looks. The admin edit used to
-- store an address as typed, so a row written there with a capital letter or a
-- space could not be found by its own owner. Those rows are rewritten here.
--
-- A row is left as it is when another row holds, or would come to hold, the
-- same address once both are normalized. Rewriting both would break the unique
-- index and stop the migration, and choosing which account keeps the address
-- is not a decision a migration can make.
UPDATE "developer_accounts" AS "account"
   SET "email" = lower(btrim("account"."email"))
 WHERE "account"."email" <> lower(btrim("account"."email"))
   AND NOT EXISTS (
     SELECT 1
       FROM "developer_accounts" AS "other"
      WHERE "other"."id" <> "account"."id"
        AND lower(btrim("other"."email")) = lower(btrim("account"."email"))
   );
