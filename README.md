# Ratewell rating portal

This is a Next.js App Router MongoDB rating and earning portal. It includes package-based manual registration, private payment-proof review, ratings, wallet/referral/support workflows, account administration, financial analytics, and a Helpline Admin workspace.

## Requirements

- Node.js 20.19 or newer
- MongoDB
- Cloudinary account for private payment-proof, avatar, and banner images

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set `SESSION_SECRET` to a unique random value of at least 32 characters (for example, generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`).
4. Set `SUPER_ADMIN_PASSWORD` in `.env.local`; quote the value if it contains `#` (for example, `SUPER_ADMIN_PASSWORD="your-password-with-#"`). The bootstrap email defaults to `Super-Admin-Mjaved@gmail.com` and can be overridden with `SUPER_ADMIN_EMAIL`.
5. Configure the Cloudinary values in `.env.local`. Generate `ENCRYPTION_KEY` as base64 encoding of exactly 32 random bytes; for example, use Node's `crypto.randomBytes(32).toString('base64')`. This key protects saved payout details and must be backed up securely; losing it makes those details unreadable.
6. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` for authenticated email delivery. New registrations require a six-digit email verification code when SMTP is fully configured. Password reset and withdrawal verification also use expiring, rate-limited codes; withdrawal codes are bound to the active session.
7. Run `npm run dev` for local development. It starts an isolated local MongoDB 8.0 single-node replica set and stores its data persistently outside the project, then launches Next.js on `http://127.0.0.1:3000`. A replica set is needed for atomic payment, wallet, withdrawal, and deletion workflows. The first start downloads the MongoDB executable if needed. For an existing replica-set MongoDB/Atlas database, set `MONGODB_URI` (or the legacy `MONGO_URI`; `MONGODB_URI` takes precedence) and run `npm run dev:next`.
8. For production, set `MONGODB_URI` to a managed replica-set MongoDB connection string, configure Cloudinary and encryption secrets, keep secrets in the deployment secret manager, then run `npm run build` and `npm start`. Use TLS and a trusted reverse proxy that overwrites `x-real-ip` / `x-forwarded-for`; the application uses those headers for IP blocks, rate limits, and audit trails.
9. Sign in to `/super-admin`, change the bootstrap password, then create at least one active registration package and one company payment account. Registration intentionally remains unavailable until those business/payment details are configured. Enable Cloudinary and the encryption key before accepting proof uploads or payout profiles.

On the first successful connection, the app creates a Super Admin if the configured email is not already present. The bootstrap password must be configured through the environment and is bcrypt-hashed before it is stored; it is intentionally not embedded in source code. Existing accounts are not overwritten; use the authenticated password-change control and update the bootstrap secret in your deployment secret store for future first-boot environments. Local database data remains across development server restarts under `%LOCALAPPDATA%\\Ratewell\\mongodb-data`.

## Routes

- `/` — public user registration and sign-in only
- `/about` — public platform information and FAQs
- `/dashboard` — authenticated user's configurable review tasks and rating history
- `/dashboard/profile` — update profile, avatar, and password
- `/dashboard/wallet` — wallet ledger and withdrawal requests
- `/dashboard/notifications` — paginated in-app notifications with unread filtering
- `/dashboard/referrals` — referral links, tree, conversions, and earnings
- `/dashboard/settings` — privacy, notifications, and session controls
- `/dashboard/settings/withdrawal` — encrypted payout profile setup and password-confirmed updates
- `/dashboard/support` — private support tickets
- `/dashboard/payment` — pending registrant payment instructions and proof upload
- `/terms` and `/privacy` — current admin-managed registration terms and privacy policy; users can accept a required updated terms version here
- `/forgot-password` — time-limited email-code password reset for regular user accounts
- `/verify-email` — email-code verification for new registrations when SMTP is configured
- `/super-admin` — Super Admin sign-in
- `/super-admin/dashboard` — collapsible Super Admin navigation for analytics, users/roles, packages, payment accounts, approvals, payouts, review task settings, referral rewards, portal branding, security, sessions, audit logs, banners, and support
- `/help-admin` — Helpline Admin sign-in
- `/help-admin/dashboard` — protected analytics, payment/payout review, feedback, and support workspace
- `/moderator` — Moderator sign-in
- `/moderator/dashboard` — protected feedback moderation and support workspace

The admin paths are not linked from the public interface. Dashboard pages and APIs re-check the user's active database account and role, in addition to verifying the signed, HTTP-only session cookie. Users can submit 1–5 star ratings and reviews up to 2,000 characters. Ratings APIs return the signed-in user's own ratings, or all ratings to authenticated admins, in cursor-paginated batches.

Registration remains pending until an administrator accepts a submitted manual payment proof. When SMTP is fully configured, new registrations must first verify their email before signing in or submitting proof; pre-existing accounts remain verified for backward compatibility. Without complete SMTP configuration, the existing registration/payment flow remains available. Package amounts and wallet values are represented in integer paisa. Each approved package has a configurable validity period (30 days by default), daily task quota, and daily earning cap; expiry is measured from approval. The Super Admin can configure post-expiry renewal cooldown. A package may designate the recommended renewal package, and package availability can be limited by referral tier. During a configured cooldown only the recommended package is offered and accepted. Expired users cannot start or submit review tasks or earn rating rewards, but retain access to their existing wallet and payout requests.

Referral and rating rewards are configurable and start at zero. Review task media, custom rules, minimum elapsed task time, per-day/per-user/global quotas, and package targeting are configurable by the Super Admin. The task timer is enforced from a server-side start timestamp; it proves elapsed time on the task, not that a video was watched. Referral milestones can use bounded conversion windows and one-time tier or cash rewards. The admin analytics include active package distribution, expiring/expired accounts, renewal conversion, financial goals, and daily/weekly trends. Payment metadata is snapshotted into immutable verification and financial ledger records; the Super Admin can filter and export the ledger as CSV. Popup ads and scheduled marquee announcements are managed from the admin console.

Withdrawal requests reserve funds until staff marks them paid or rejects them; rejected requests refund the wallet through a separate, idempotent compensating ledger entry. In-app notifications are refreshed by polling (30 seconds in the user navigation); the notification inbox also supports cursor pagination and mark-read actions. Wallet ledger postings capture the balance before and after each new credit/debit and are immutable; older entries remain readable without backfilling. The requested withdrawal amount (including its deducted fee) must fit within the earning-wallet balance. Each package defines its own minimum, optional maximum, and inclusive percentage-fee brackets; brackets must cover the full allowed interval without gaps or overlaps. A null maximum is unlimited, and 100 basis points equals 1%. The selected package policy, applied percentage, fee, and net payout are snapshotted on each immutable withdrawal request; global legacy fee settings do not override package-specific rules. Package edits affect future activations, renewals, and explicit assignments, not active users' snapshots. Existing accounts whose older snapshots lack package withdrawal terms use compatibility defaults (100 paisa minimum, no package maximum, and 0% fee); no historical records are backfilled. Users can select Easypaisa, JazzCash, bank, or USDT BEP20/TRC20 payout details. Payout details are encrypted at rest; updates require the account's current password and are recorded in security events. Email OTP is required for each withdrawal and must be configured with SMTP environment settings. Existing withdrawal requests keep their original encrypted payout snapshot. In-app notifications are persisted and refreshed every 30 seconds; they expire after 180 days. User/admin logos and review evidence use private, signed Cloudinary images, so Cloudinary credentials are required for these uploads.

Approved external registration payments activate the selected package directly and are recorded as package revenue; they do not also credit the Deposit Wallet. Deposit proof approval credits only the Deposit Wallet, and a later package purchase debits that wallet exactly once. New external-payment and deposit submissions also reserve a normalized transaction ID in a shared unique-index collection inside the same MongoDB transaction as the proof record. New package activations, renewals, administrative assignments, and extensions append term snapshots to package history. Package deletion in the admin UI archives/deactivates the record; referenced package documents are not hard-deleted. Existing verification and financial records are retained as the pre-history source for older activations; no historical backfill is run.

Daily task and earning limits use the configured IANA business timezone (UTC by default), including daylight-saving day boundaries; no midnight cron job is required. Review submission requires a server-recorded active task start, and that start is consumed in the same transaction as the rating. Task rewards remain pending until an administrator approves the submission; approval credits the Earning Wallet once, while rejection records a reason and does not credit a reward. Daily package quotas reset by business date on request.

When a Super Admin deletes an account, access is revoked, identifying account fields are scrubbed, and its ratings are disassociated from the account in a MongoDB transaction; a minimal tombstone remains to preserve referential history. Account deletion is intentionally limited to regular users, Helpline Admins, and moderators; the Super Admin account cannot be deleted or disabled through this interface. Helpline Admins can review payments, withdrawals, tickets, and feedback but cannot manage users or platform configuration. Moderators can review feedback and tickets.

## Security notes

Use TLS in production and keep `.env.local` and production secrets out of source control. The application uses bcryptjs password hashing, 12-character minimum passwords (within bcrypt's 72-byte input limit), same-origin checks for state-changing requests, strict same-site HTTP-only cookies, role-based authorization, database-tracked/revocable sessions, IP- and account-keyed login throttles, IP blocks, security events, administrator audit records, and manual support ticket handling. User sign-in sessions can be remembered for 30 days; the default is a one-hour session. Registration verification (when SMTP is configured), password reset, and withdrawal verification use short-lived email codes; withdrawal codes are session-bound. Pending-payment accounts can sign in to submit proof only after email verification; administrator suspension is stored separately and blocks access even for pending accounts. Super Admin balance adjustments require a reason and are recorded in both immutable financial and wallet ledgers. IP headers are only trustworthy when set by a trusted reverse proxy that strips client-supplied forwarding headers. Geolocation-based access restrictions, automated vulnerability scanning, automated payments, and automated payout integrations are not implemented; payment and withdrawal processing is deliberately manual.

### Package earnings and wallet flows

Package prices, task payouts, balances, and withdrawal limits are stored in integer PKR paisa. Each package has a validity term, daily task limit, exact per-task payout, minimum/maximum withdrawal, and percentage-fee schedule; users receive those terms as a snapshot when their package is approved, assigned, or purchased. Task submissions enforce the active package expiry and daily quota server-side. Daily task and earning accounting uses the configured IANA business timezone (UTC by default), including daylight-saving transitions. The business date is recalculated during requests, so correctness does not depend on a midnight cron worker.

The Earning Wallet contains approved task and referral earnings and is the only wallet used for withdrawals. Pending task rewards are shown separately and are not withdrawable. Manual deposit proofs are reviewed at `/api/admin/deposits`; approval credits the separate Deposit Wallet. An approved user can purchase or renew a package from the Deposit Wallet at `/api/packages/purchase`. Package purchases and deposit approval are recorded in separate ledger entries; deposits are tracked as wallet inflows and are not counted again as package revenue until a package is purchased. Run `npm test` for the focused financial-helper, timezone, schema-index, and proof-upload validation tests; database-backed concurrency tests require a dedicated test replica set and are not included.
