import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GraduationCap, Users, Utensils, CreditCard, CheckCircle, ArrowRight, Shield, Phone, Table2, Mail, ShieldCheck } from "lucide-react";

const HERO_IMG = "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwyfHxncmFkdWF0aW9uJTIwY2VyZW1vbnklMjBjZWxlYnJhdGlvbnxlbnwwfHx8fDE3ODE1MDg1ODN8MA&ixlib=rb-4.1.0&q=85&w=800";

const steps = [
  { icon: Users, title: "Register", desc: "Fill in your details and select your graduation date" },
  { icon: Table2, title: "Reserve Table", desc: "Select number of guests and secure your table" },
  { icon: Utensils, title: "Catering Service", desc: "Select preferred dishes, drinks & pastries for your celebration" },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur bg-background/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-semibold">KaDel</span>
            <span className="text-xs text-muted-foreground font-medium bg-secondary px-2 py-0.5 rounded-full">Ghana</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/track')} data-testid="nav-track">
              Track Table
            </Button>
            <Button size="sm" onClick={() => navigate('/book')} data-testid="nav-book-now">
              Reserve Now <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-gradient relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="kente-bar w-20 mb-6" />
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground leading-tight">
                Celebrate Your
                <span className="block text-primary">Graduation</span>
                in Style
              </h1>
              <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-lg">
                Reserve a Table with Us. Choose your menu, and pay securely.
                Everything you need for a memorable celebration.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" className="rounded-xl text-base px-8" onClick={() => navigate('/book')} data-testid="hero-book-now">
                  Reserve a Table <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="secondary" className="rounded-xl text-base px-6" onClick={() => navigate('/track')} data-testid="hero-track-table">
                  Track Table
                </Button>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="hidden lg:block"
            >
              <div className="relative rounded-2xl overflow-hidden shadow-xl">
                <img src={HERO_IMG} alt="Graduation celebration" className="w-full h-80 object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold">How It Works</h2>
            <p className="mt-2 text-muted-foreground">Reserve a table with us in 3 simple steps.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
              >
                <Card className="p-6 text-center h-full hover:shadow-md transition-shadow duration-150">
                  <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <s.icon className="h-7 w-7 text-primary" />
                  </div>
                  <div className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-secondary rounded-full px-3 py-1 mb-3">
                    Step {i + 1}
                  </div>
                  <h3 className="font-display text-lg font-semibold mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-14 bg-card border-y border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center gap-2">
              <Shield className="h-8 w-8 text-primary" />
              <h4 className="font-semibold">Secure Payments</h4>
              <p className="text-sm text-muted-foreground">Powered by Paystack - trusted by millions</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="h-8 w-8 text-primary" />
              <h4 className="font-semibold">Instant Confirmation</h4>
              <p className="text-sm text-muted-foreground">Get your reservation code immediately after payment</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Phone className="h-8 w-8 text-primary" />
              <h4 className="font-semibold">WhatsApp Support</h4>
              <p className="text-sm text-muted-foreground">Reach us anytime for assistance</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4">Ready to Celebrate?</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">Don't miss out on securing your spot. Reserve a table with us today!</p>
          <Button size="lg" className="rounded-xl text-base px-10" onClick={() => navigate('/book')} data-testid="cta-book-now">
            Reserve a Table with Us. <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/80 bg-card/50 py-16 text-foreground/90">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            {/* Brand Section */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-bold tracking-wide text-primary">KaDel</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                Reserve your table and select your preferred food and drinks to celebrate your graduation in style.
              </p>
            </div>

            {/* Quick Links */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Navigation</h4>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-muted-foreground hover:text-foreground transition-colors duration-150">
                    Home
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate('/book')} className="text-muted-foreground hover:text-foreground transition-colors duration-150">
                    Reserve a Table
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate('/track')} className="text-muted-foreground hover:text-foreground transition-colors duration-150" data-testid="footer-track">
                    Track My Table
                  </button>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Support</h4>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a href="mailto:reservations@kadelgh.com" className="text-muted-foreground hover:text-foreground transition-colors duration-150 flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0 text-primary/70" />
                    reservations@kadelgh.com
                  </a>
                </li>
                <li>
                  <a href="https://wa.me/233241234567" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors duration-150 flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-primary/70" />
                    WhatsApp Support
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <Separator className="bg-border/60 my-8" />

          {/* Bottom copyright */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} KaDel Ghana. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <span className="hover:text-foreground cursor-pointer transition-colors">Privacy Policy</span>
              <span className="hover:text-foreground cursor-pointer transition-colors">Terms of Service</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
