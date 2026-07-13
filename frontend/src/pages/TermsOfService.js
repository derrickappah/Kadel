import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Terms of Service</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">Last updated: July 13, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">1. Agreement to Terms</h2>
            <p>
              By accessing and using KaDel, you agree to comply with and be bound by these Terms of Service. If you do not agree to these terms, please do not use the application to reserve tables or purchase catering options.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. Reservations and Allocation</h2>
            <p>
              Reservations are only confirmed upon successful verification of payment through our designated payment gateway (Paystack). Table numbers are assigned by our event organizers and are subject to availability.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. Catering and Menu Policy</h2>
            <p>
              Catering requests must be selected at the time of booking. Although we strive to ensure all requested items are prepared as selected, food selections depend on ingredient availability and stock. Product images are illustrative.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Refund and Cancellation Policy</h2>
            <p>
              All reservation and catering fees are non-refundable once payment is completed, unless the event itself is cancelled by the administration team. Any changes to guest counts or selections must be requested at least 72 hours prior to the graduation date.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">5. Modifications of Service</h2>
            <p>
              We reserve the right to modify, suspend, or terminate the reservation system at any time without notice. We are not liable for any issues, delays, or errors arising from third-party services (such as Paystack or host servers).
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
