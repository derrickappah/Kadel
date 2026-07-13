import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPolicy() {
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
            <Shield className="h-5 w-5" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Privacy Policy</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">Last updated: July 13, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
            <p>
              When you use KaDel to book a table reservation, we collect personal information necessary to process your request. This includes your name, program, graduation date, phone/WhatsApp number, and email address. We also store details of your catering selections.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. How We Use Your Information</h2>
            <p>
              We use the collected information to confirm your booking, allocate table resources, prepare catering services, and email you transaction receipts and confirmation codes. Your contact details may be used to reach out to you regarding your reservation.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. Payment Processing</h2>
            <p>
              All payment transactions are securely processed through Paystack. We do not store or have access to your raw payment details (such as credit card numbers or banking passwords). Paystack handles all financial details in accordance with standard financial regulations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Data Security</h2>
            <p>
              We implement a variety of standard security measures to safeguard your personal data. Reservation details are stored in secure databases with strict access controls to prevent unauthorized access, alteration, or disclosure.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">5. Contact Us</h2>
            <p>
              If you have any questions or concerns regarding this Privacy Policy, feel free to contact our administration team at <a href="mailto:reservations@kadelgh.com" className="text-primary hover:underline">reservations@kadelgh.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
