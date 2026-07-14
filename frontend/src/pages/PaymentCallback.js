import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, Loader2, GraduationCap, Copy, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SUCCESS_IMG = "https://images.unsplash.com/photo-1627556704290-2b1f5853ff78?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwxfHxncmFkdWF0aW9uJTIwY2VyZW1vbnklMjBjZWxlYnJhdGlvbnxlbnwwfHx8fDE3ODE1MDg1ODN8MA&ixlib=rb-4.1.0&q=85&w=800";

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying");
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    const verify = async () => {
      const reference = searchParams.get("reference") || searchParams.get("trxref");
      const isTest = searchParams.get("test") === "true";
      const bookingId = searchParams.get("booking_id");
      const code = searchParams.get("code");

      if (isTest && bookingId) {
        // Test mode - fetch booking directly
        try {
          if (code) {
            const res = await axios.get(`${API}/bookings/lookup/${code}`);
            setBooking(res.data);
            setStatus("success");
          } else {
            setStatus("success");
          }
        } catch {
          setStatus("success");
          setBooking({ reservation_code: code || "TEST", table_number: "T1" });
        }
        return;
      }

      if (!reference) {
        setStatus("failed");
        return;
      }

      // Poll up to 8 times with 3s delay (24s total) — handles webhook timing delays
      const MAX_RETRIES = 8;
      const RETRY_DELAY_MS = 3000;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await axios.get(`${API}/payments/verify/${reference}`);
          if (res.data.status === "success") {
            setBooking(res.data.booking);
            setStatus("success");
            return;
          }
        } catch {
          // Network error — keep retrying
        }

        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }

      // All retries exhausted
      setStatus("failed");
    };
    verify();
  }, [searchParams]);

  const copyCode = () => {
    if (booking?.reservation_code) {
      navigator.clipboard.writeText(booking.reservation_code);
      toast.success("Reservation code copied!");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="font-display font-semibold">KaDel</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {status === "verifying" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="font-display text-2xl font-semibold mb-2">Verifying Payment</h2>
            <p className="text-muted-foreground">Confirming your payment with Moolre — this may take up to 30 seconds...</p>
          </motion.div>
        )}

        {status === "success" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Success Banner */}
            <div className="relative rounded-2xl overflow-hidden mb-6">
              <img src={SUCCESS_IMG} alt="Celebration" className="w-full h-40 object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                <div className="text-white">
                  <CheckCircle className="h-8 w-8 mb-2" />
                  <h2 className="font-display text-2xl font-semibold">Reservation Confirmed!</h2>
                </div>
              </div>
            </div>

            <Card>
              <CardHeader className="text-center">
                <CardTitle className="font-display text-xl">Your Reservation Details</CardTitle>
                <div className="kente-bar w-16 mx-auto mt-2" />
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Reservation Code */}
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Reservation Code</p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-3xl font-bold tracking-widest text-primary" data-testid="reservation-code">
                      {booking?.reservation_code || "---"}
                    </span>
                    <button onClick={copyCode} className="p-2 rounded-lg hover:bg-secondary" data-testid="copy-reservation-code">
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {booking?.table_number && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Table Number</p>
                    <Badge variant="secondary" className="text-lg px-4 py-1" data-testid="table-number">
                      {booking.table_number}
                    </Badge>
                  </div>
                )}

                <Separator />

                {/* Booking Summary */}
                {booking && (
                  <div className="space-y-2.5 text-sm">
                    {[
                      { label: "Graduate", value: booking.graduate_name },
                      { label: "Program", value: booking.course },
                      { label: "Graduation Date", value: booking.graduation_date },
                      { label: "Guests", value: `${booking.attendees_count} guests` },
                      { label: "Total Paid", value: `GHC ${booking.total_amount?.toFixed(2)}`, highlight: true }
                    ].map((item, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-1.5 border-b border-border/40 last:border-0 gap-0.5 sm:gap-2">
                        <span className="text-muted-foreground font-medium shrink-0">{item.label}</span>
                        <span className={cn(
                          item.highlight ? "font-bold text-primary" : "font-semibold text-foreground",
                          "text-left sm:text-right break-all max-w-full sm:max-w-[70%]"
                        )}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />

                <div className="text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    A confirmation has been sent to your email. Please save your reservation code for check-in.
                  </p>
                  <Button onClick={() => navigate('/')} className="rounded-xl">
                    Back to Home <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {status === "failed" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="font-display text-2xl font-semibold mb-2">Payment Failed</h2>
            <p className="text-muted-foreground mb-6">Your payment could not be verified. Please try again.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={() => navigate('/')} className="rounded-xl">
                Go Home
              </Button>
              <Button onClick={() => navigate('/book')} className="rounded-xl">
                Try Again
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
