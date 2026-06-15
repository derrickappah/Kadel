# plan.md (Updated)

## 1. Objectives
- **Delivered:** a mobile-friendly graduation event booking website (React + FastAPI + MongoDB) with the complete booking flow and an admin panel.
- **Delivered:** automatic cost calculation (attendees + optional food/drinks/pastries) with **real-time stock visibility** and **stock deduction on confirmed payment**.
- **Delivered:** reservation code generation (e.g., `KAD123`) and **automatic table assignment** (e.g., `T1`, `T2`, …) with admin override.
- **Delivered:** email confirmation capability via SMTP (configuration-driven).
- **Delivered (Test Mode):** a working payment completion flow using a **test-complete endpoint** while Paystack keys are not configured.
- **Remaining to go live:** configure Paystack keys + webhook URL, enable HTTPS, and run live-mode verification.

## 2. Implementation Steps

### Phase 1 — Core Payment POC (Paystack) (Isolation)
**Goal:** prove end-to-end payment works before building the full app.

**Status:** ✅ Completed (Playbook obtained and integration approach confirmed).

**User stories**
1. As a user, I want to click “Pay” and be redirected to Paystack so I can pay securely.
2. As a user, I want to return to a “Payment Success” page so I know my payment went through.
3. As the system, I want to verify the transaction with Paystack so I don’t accept spoofed payments.
4. As an admin, I want a webhook to record successful payments so booking finalization is reliable.
5. As a developer, I want repeatable test transactions in Paystack test mode so I can validate edge cases.

**What was done**
- Captured Paystack best-practice flow:
  - `transaction/initialize` → redirect to Paystack checkout
  - `transaction/verify` on callback
  - webhook handling with signature verification (`x-paystack-signature`)
- Implemented Paystack endpoints in the full backend (see Phase 2).

**Deliverable:** Paystack integration pattern finalized and implemented in V1.

---

### Phase 2 — V1 App Development (Core Booking + Admin Basics)
**Status:** ✅ Completed (full app built and working).

**User stories**
1. As a user, I want to fill the registration form quickly on mobile so I can book in under 2 minutes.
2. As a user, I want to choose attendees (10/20/custom) so pricing matches my group.
3. As a user, I want to select “No food” and still pay and complete booking successfully.
4. As a user, I want to add food/drinks/pastries with quantities and see remaining packs so I don’t order unavailable items.
5. As a user, I want to see the total cost update instantly before I pay so I can confirm my order.

**Backend (FastAPI + MongoDB)**
- Implemented collections:
  - `graduation_dates`
  - `products` (category: food/drink/pastry, name, price, stock, vendor, is_active)
  - `bookings` (registration fields, attendees_count, selections, totals, status, reservation_code, table_number)
  - `payments` (reference, amount, status, booking_id)
  - `admins` (email, password_hash)
  - `event_settings` (event_fee_per_person)
- Implemented public endpoints:
  - `GET /api/dates`
  - `GET /api/products?category=food|drink|pastry`
  - `GET /api/event-settings`
  - `POST /api/bookings` (creates a pending booking with server-side total calculation and stock validation)
  - `POST /api/payments/initialize` (Paystack initialize)
  - `GET /api/payments/verify/{reference}` (Paystack verify + finalize booking)
  - `POST /api/paystack/webhook` (signature verification + finalization)
  - `GET /api/bookings/lookup/{reservation_code}`
- **Test payment fallback (for development):**
  - `POST /api/payments/test-complete/{booking_id}` simulates a successful payment, confirms booking, deducts stock, assigns table.
- Business logic delivered:
  - Server-side totals (event fee per person × attendees + optional selections).
  - Stock validated at booking creation; stock deducted at payment confirmation.
  - Unique reservation code generation with `KAD` prefix.
  - Auto table assignment with admin override.
  - SMTP-based email confirmation (env-configured).

**Frontend (React + shadcn/ui)**
- Pages delivered:
  - Landing page
  - Booking wizard (4 steps): Personal Info → Guests → Catering → Review & Pay
  - Payment callback/confirmation page
  - Admin login
  - Admin dashboard (Overview, Bookings, Products, Dates, Settings)
- UX essentials delivered:
  - Mobile-first UI, sticky progress header, bottom action bar.
  - Real-time total breakdown in GHC.
  - Food toggle OFF skips menu selection.
  - Stock-aware quantity steppers.
  - Toast feedback (Sonner) for errors and actions.

**End of Phase 2 deliverables achieved:** full booking flow + admin panel + test payment completion + confirmation UI.

---

### Phase 3 — Testing, Hardening, and UX Polish
**Status:** ✅ Completed (E2E testing passed).

**Test results**
- Backend: **27/27 API tests passed (100%)**
- Frontend: all critical flows passed (booking wizard, totals, test payment, confirmation page, admin panel CRUD)

**Hardening delivered**
- Payment verification logic implemented server-side.
- Webhook signature verification present.
- Idempotent-safe behavior: verification returns booking if already confirmed.
- Mobile responsiveness validated.

---

### Phase 4 — Optional Enhancements (post-v1)
**Status:** ⏳ Not started (optional backlog).

**User stories / enhancements**
1. Vendor dashboards and reporting (top-selling items, vendor totals).
2. SMS confirmation (Twilio/Hubtel) in addition to email.
3. Inventory reservation with TTL (hold stock during checkout).
4. Editable bookings before payment (draft mode / cart persist).
5. Role-based access for admins/staff.
6. CSV export for bookings/payments.
7. Seating capacity logic (tables with capacity + overbooking prevention).

## 3. Next Actions
1. **Go-live configuration (required):**
   - Add Paystack keys to `/app/backend/.env`:
     - `PAYSTACK_SECRET_KEY=sk_test_...` (or `sk_live_...`)
   - Register webhook URL in Paystack dashboard:
     - `POST https://<your-domain>/api/paystack/webhook`
   - Ensure HTTPS is enabled for live mode.
2. **Live-mode validation:**
   - Run real Paystack payment through checkout.
   - Confirm callback verification finalizes booking.
   - Confirm webhook events are received and idempotent.
3. **Production readiness:**
   - Set SMTP credentials to enable real confirmation emails.
   - Rotate `JWT_SECRET`.
   - Consider adding rate limiting/logging/monitoring for payment endpoints.

## 4. Success Criteria
- **Paystack (Go-Live):**
  - Initialize → checkout → callback verify works using real keys.
  - Webhook signature verified; webhook processing idempotent.
- **V1 Functional:**
  - Users can complete booking with or without catering items.
  - Totals correct; stock deducted only on confirmed payment.
  - Reservation codes unique; table assignment works and is editable by admin.
  - Admin can manage products/dates/settings and view bookings/payments.
- **Stability:**
  - No duplicate confirmations on refresh/duplicate webhooks.
  - Mobile UI works across common screen sizes; critical flow completes reliably.
