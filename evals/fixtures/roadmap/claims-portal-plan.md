# Technical plan: claims portal, phase 2

Owner: Platform team · Status: approved for planning

## 1. Goal

Policyholders follow their claims without calling the contact center. Phase 2 adds notifications, supporting documents and an audit trail for adjusters.

## 2. Status notifications

- 2.1 When a claim changes status (`open` → `in_review` → `approved` | `rejected`), the policyholder gets an email within 5 minutes.
- 2.2 Emails use a template per status and the policyholder's language (English or Spanish).
- 2.3 A policyholder can turn notifications off from their profile.
- 2.4 We have not decided whether SMS is part of phase 2 or a later phase.

## 3. Supporting documents

- 3.1 Policyholders upload PDF or JPEG files (up to 10 MB each) to an open claim.
- 3.2 Documents often contain medical records: they are personal health data. Store them encrypted, never log their content, and only the claim's adjuster can download them.
- 3.3 Uploads are scanned for malware before an adjuster can open them.
- 3.4 The storage needs a new `documents` table (claim id, file key, uploaded by, uploaded at, scan status). It must exist before 3.1 can ship.

## 4. Audit trail

- 4.1 Every status change and every document download is recorded: who, what, when.
- 4.2 Adjusters see the trail on the claim page; nobody can edit or delete entries.
- 4.3 Records are kept for 7 years.

## 5. Out of scope

- Payments and payouts.
- A mobile app.
