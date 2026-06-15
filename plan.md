# plan.md

## 1. Objectives
- Deliver a mobile-friendly graduation event booking website (React + FastAPI + MongoDB) with a reliable Paystack payment flow.
- Ensure booking completion is strictly tied to **verified payment** (via Paystack callback + webhook verification).
- Provide automatic cost calculation (attendees + optional food/drinks/pastries) with real-time stock/pack visibility.
- Send post-payment confirmation via **email (SMTP)** including reservation code + table number.
- Provide an admin panel to manage products/vendors, prices, inventory, dates, bookings, payments, and table assignment.

## 2. Implementation Steps

### Phase 1 — Core Payment POC (Paystack) (Isolation)
**Goal:** prove end-to-end payment works before building the full app.

**User stories**
1. As a user, I want to click “Pay” and be redirected to Paystack so I can pay securely.
2. As a user, I want to return to a “Payment Success” page so I know my payment went through.
3. As the system, I want to verify the transaction with Paystack so I don’t accept spoofed payments.
4. As an admin, I want a webhook to record successful payments so booking finalization is reliable.
5. As a developer, I want repeatable test transactions in Paystack test mode so I can validate edge cases.

**Steps**
- Websearch: confirm latest Paystack best practices for **transaction initialize**, **callback**, **transaction verify**, and **webhooks**.
- Create minimal FastAPI POC endpoints:
  - `POST /poc/paystack/initialize` (amount, email) → returns authorization_url + reference
  - `GET /poc/paystack/callback` (reference) → verifies with Paystack → shows success/fail
  - `POST /poc/paystack/webhook` → verify Paystack signature → log event
- Create a tiny React POC page:
  - input email + amount → call initialize → redirect to Paystack authorization_url
  - success/failure landing page (reads reference, calls backend verify)
- Use a standalone Python script to:
  - call initialize
  - simulate verify call
  - validate webhook signature handling (with captured payload)
- Fix until stable: handle failed payment, abandoned checkout, duplicate references, idempotency on webhook.

**Deliverable:** working Paystack test payments with verified status + reference persistence.

---

### Phase 2 — V1 App Development (Core Booking + Admin Basics)
**User stories**
1. As a user, I want to fill the registration form quickly on mobile so I can book in under 2 minutes.
2. As a user, I want to choose attendees (10/20/custom) so pricing matches my group.
3. As a user, I want to select “No food” and still pay and complete booking successfully.
4. As a user, I want to add food/drinks/pastries with quantities and see remaining packs so I don’t order unavailable items.
5. As a user, I want to see the total cost update instantly before I pay so I can confirm my order.

**Backend (FastAPI + MongoDB)**
- Data models/collections (MVP):
  - `graduation_dates`
  - `products` (type: food/drink/pastry, name, price, stock_packs, vendor)
  - `bookings` (registration fields, attendees_count, selections, totals, status)
  - `payments` (reference, amount, status, booking_id)
  - `tables` (table_number, capacity, assigned_bookings)
  - `admins` (email, password_hash)
- Core endpoints:
  - Public:
    - `GET /dates`
    - `GET /products?type=food|drink|pastry`
    - `POST /bookings/draft` (create draft booking + compute total)
    - `POST /payments/initialize` (ties Paystack reference to booking draft)
    - `GET /payments/verify?reference=...` (verifies + finalizes booking)
    - `POST /paystack/webhook` (authoritative finalization + idempotent)
  - Admin (simple auth/token):
    - `POST /admin/login`
    - `GET /admin/bookings`
    - `GET /admin/payments`
    - `POST /admin/products` / `PATCH /admin/products/{id}`
    - `POST /admin/dates` / `PATCH /admin/dates/{id}`
    - `POST /admin/tables/assign` (auto/manual)
- Business logic (must-have):
  - Total calculation on server (frontend mirrors for UX, server is source of truth).
  - Stock reservation approach for MVP:
    - decrement stock only on confirmed payment (avoid holding inventory without payment).
    - validate stock at payment verification time; fail gracefully if sold out.
  - Reservation code generation: `KAD` + random/sequence (unique index).

**Frontend (React)**
- Pages:
  - Booking flow (single wizard): Registration → Attendees → Food toggle → Selections → Review Total → Pay
  - Payment result page (success/failure/pending)
  - Admin panel: products, dates, bookings, payments, tables
- UX essentials:
  - Clear “No food” path that still shows what the user pays for (event booking fee line item).
  - Real-time total breakdown (event fee + items).
  - Validation: gmail format, phone format, required fields.

**Email confirmation (SMTP)**
- Send on payment-confirmed event (webhook preferred).
- Email includes: reservation code, table number (if assigned), attendee count, items summary, total paid.

**End of Phase 2:** run 1 full E2E test pass (booking with food + booking without food), confirm Mongo writes, payment verify, and email send.

---

### Phase 3 — Testing, Hardening, and UX Polish
**User stories**
1. As a user, I want the site to work even if I refresh during payment return so I don’t lose my booking.
2. As a user, I want clear error messages if stock is insufficient so I can adjust quantities.
3. As an admin, I want to see total attendees by date so I can plan seating.
4. As an admin, I want table assignment to respect capacity so I don’t overbook.
5. As the system, I want webhook handling to be idempotent so duplicate events don’t create duplicates.

**Steps**
- Automated tests (minimum set):
  - Backend: totals calculation, stock validation, reservation code uniqueness, webhook signature verification.
  - Frontend: form validation + total calculation display.
- Edge-case handling:
  - payment success but webhook delayed (mark booking “paid_pending_confirm” then finalize on webhook/verify).
  - duplicate callbacks/webhooks.
  - sold-out items at verification → refund/manual resolution path (MVP: mark failed + email notice).
- Observability:
  - structured logs for payment refs + booking ids.
  - admin download CSV of bookings/payments (optional if time).
- Final E2E testing round and UI responsiveness pass.

---

### Phase 4 — Optional Enhancements (post-v1)
**User stories**
1. As an admin, I want per-vendor dashboards so I can track which vendor sold what.
2. As a user, I want SMS confirmation in addition to email so I can receive instant updates.
3. As an admin, I want inventory reservation windows so stock can be temporarily held during checkout.
4. As a user, I want to edit my booking before payment so I can correct mistakes.
5. As an admin, I want role-based access so staff can view bookings without editing prices.

- Add SMS provider (Twilio/Hubtel) + template management.
- Stronger auth (JWT refresh, password reset) after approval.
- Inventory hold/reserve with TTL and cleanup job.

## 3. Next Actions
1. Implement Phase 1 Paystack POC (FastAPI endpoints + minimal React page + Python verification script).
2. Confirm Paystack POC success criteria (below) are met in test mode.
3. Scaffold full repo structure (backend/frontend) and begin Phase 2 V1 build around the proven Paystack flow.

## 4. Success Criteria
- Paystack POC:
  - Can initialize payment, complete checkout, return to app, and verify transaction server-side.
  - Webhook signature verified and webhook processing is idempotent.
- V1:
  - User can complete booking with “No food” and with food/drinks/pastries, and totals are correct.
  - Payment confirmation finalizes booking, generates reservation code, and sends email.
  - Admin can manage products/dates, view bookings/payments, and assign tables.
- Stability:
  - No duplicate bookings/payments on refresh or duplicate webhook.
  - Mobile UI works across common screen sizes and the core flow completes reliably.
