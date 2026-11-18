# The bank import

The backend reads musiccloud's bank account through Enable Banking and books the transfers that belong to musiccloud into the donations ledger. A sponsor's transfer turns their sponsor request into a sponsor. Connecting the account, renewing it and the consent warnings are described in the bank connection code (`apps/backend/src/services/bank-connection.ts`, `bank-consent.ts`). This page describes the reads and what they book. The import is ported from lmaa.space, which is paid into the same account.

## When the account is read

The bank worker starts with the backend, after the migrations, and stops on shutdown. Every 6 hours it looks at the consent and reads the account. Under Article 36(5) of Commission Delegated Regulation (EU) 2018/389, at most 4 background reads may happen in a sliding 24 hours while the account holder is not asking. Every read is stored in `bank_account_reads`, and a read is claimed under an advisory lock that counts the stored reads first. A restart or a second container therefore cannot read more often than that.

The first read reaches 90 days back. Every later read reaches 5 days back from today, so a payment the bank posts late is still found. A read walks at most 20 pages of the bank's answer.

The owner can also read the account at once with Read now on the donations page, optionally from a chosen day. That is `POST /api/admin/sponsoring/bank-connection/sync`, which admits the owner alone. It draws on a budget of its own, 60 reads in 24 hours, so pressing it never locks the background read out. A day after today is ignored, because the bank refuses a range that starts after it ends.

A read stops before it asks the bank when no connection is in force, when its budget is spent, and when the consent has lapsed. A lapsed consent also sends the owner the lapsed warning, so a quiet ledger is never mistaken for a period without donations.

## What is booked

The account is private and lmaa.space is paid into it as well, so only a positive list is booked:

- A creditor reference in musiccloud's own form, `RF`, two check digits, `MCSP` and twelve characters, found as a whole word. It may be printed in groups of four, in any case, or split over two lines. It is booked only where musiccloud issued it. Where its request still stands, the request becomes a sponsor with a linked donation through the same takeover the dashboard uses. Where the request is gone, the payment is booked as a donation with the reference in its note.
- `musiccloud.io` in the purpose, without such a reference, which books a free donation.

Only credits in euros above zero are booked. Money leaving the account is never a donation. A transfer that is musiccloud's by its text but has another currency or no amount is skipped and only counted.

Any lmaa.space marker excludes a transfer, even when it also carries a musiccloud marker. The markers are `lmaa.space` in the purpose and lmaa.space's `SPON` references. A transfer carrying both projects' markers is booked by neither and has to be entered by hand. The same holds for any other sound creditor reference that is not in musiccloud's form, such as a shop's refund, because that payment belongs to whoever issued the reference. Everything else leaves the read without being stored, counted per kind or logged.

A booked transfer is keyed in the ledger as `sepa:<entry reference>` under a unique index. The same entry read twice is recognized and never booked twice. A second read only completes a payer name the stored row lacks and leaves every other field, and any name somebody entered, as it is.

## Which references count as issued

`retired_sponsorship_references` keeps the reference of every request that leaves `pending_sponsorships`, whether it is taken over, removed by an operator or expired. A standing order keeps paying under a reference, and a payment can arrive after its request expired, so both still book. A reference somebody built with sound check digits, but that musiccloud never issued, books nothing. A request that left before the table existed left no reference there, so a later transfer under its reference books nothing.

## What a read records and logs

A finished read records its last day and how many entries it read, booked, completed and found unchanged. A failed read records its `MC-BANK-*` code, and the dashboard names that failure in a fixed sentence. `MC-BANK-0010` stands for a failure the bank client does not name, such as a database error while booking.

Each read logs its window and its counts, including the transfers it could not book. It never logs an amount, a reference, a remittance text, a payer name or an account number.
