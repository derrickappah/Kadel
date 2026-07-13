import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GraduationCap, Users, Utensils, CreditCard, CheckCircle, ArrowRight, Shield, Phone, Table2, Mail, ShieldCheck, Star } from "lucide-react";

const HERO_IMG = "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwyfHxncmFkdWF0aW9uJTIwY2VyZW1vbnklMjBjZWxlYnJhdGlvbnxlbnwwfHx8fDE3ODE1MDg1ODN8MA&ixlib=rb-4.1.0&q=85&w=800";

const steps = [
  { icon: Users, title: "Register", desc: "Fill in your details and select your graduation date" },
  { icon: Table2, title: "Reserve Table", desc: "Select number of guests and secure your table" },
  { icon: Utensils, title: "Catering Service", desc: "Select preferred dishes, drinks & pastries for your celebration" },
];

const testimonials = [
  {
    name: "Abena Mensah",
    program: "BSc. Computer Science, Class of 2025",
    quote: "Reserving a table was extremely easy, and the catering was incredible. It made my graduation dinner stress-free and truly special for my family.",
    initials: "AM"
  },
  {
    name: "Kwame Osei",
    program: "BA. Communication Studies, Class of 2025",
    quote: "Loved the food and drink selections! Paystack checkout was fast, and tracking my reservation details was seamless. Highly recommend KaDel.",
    initials: "KO"
  },
  {
    name: "Naa Adjeley",
    program: "BSc. Business Administration, Class of 2025",
    quote: "Customer support was amazing when I wanted to add more guests. The table setup was beautiful and my guests had a wonderful time.",
    initials: "NA"
  }
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">


      {/* Hero */}
      <section 
        className="relative bg-cover bg-center bg-no-repeat py-28 sm:py-36 lg:py-48 flex items-center justify-center"
        style={{ backgroundImage: `url(${HERO_IMG})` }}
      >
        {/* Dark overlay for contrast */}
        <div className="absolute inset-0 bg-black/60" />

        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            {/* Ghana Kente Accent Bar Centered */}
            <div className="flex justify-center mb-6">
              <div className="flex gap-0.5 h-1.5 w-24 rounded-full overflow-hidden shadow-sm">
                <div className="bg-[#FF3300] flex-1" />
                <div className="bg-[#FFCC00] flex-1" />
                <div className="bg-[#009933] flex-1" />
              </div>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
              Celebrate Your Graduation in Style
            </h1>
            
            <p className="text-base sm:text-lg md:text-xl text-zinc-200 max-w-xl mx-auto leading-relaxed font-light">
              Reserve a Table with Us. Choose your menu, and pay securely. Everything you need for a memorable celebration.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <Button 
                size="lg" 
                className="rounded-xl text-base px-8 py-6 w-full sm:w-auto bg-primary hover:bg-primary/95 text-primary-foreground font-semibold shadow-lg shadow-primary/20 active:scale-98 transition-all"
                onClick={() => navigate('/book')} 
                data-testid="hero-book-now"
              >
                Reserve a Table <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="rounded-xl text-base px-8 py-6 w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border-white/25 backdrop-blur-sm font-semibold active:scale-98 transition-all"
                onClick={() => navigate('/track')} 
                data-testid="hero-track-table"
              >
                Track Table
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16 space-y-3">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">How It Works</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-base sm:text-lg">
              Reserve a table with us in 3 simple steps.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-8">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                >
                  <Card className="relative overflow-hidden group p-8 bg-card border border-border/70 hover:border-primary/45 rounded-3xl shadow-sm hover:shadow-lg hover:-translate-y-1.5 transition-all duration-300 h-full flex flex-col items-start text-left">
                    {/* Step Watermark Number */}
                    <div className="absolute top-4 right-8 text-7xl font-extrabold text-muted-foreground/5 select-none font-display tracking-tighter">
                      0{i + 1}
                    </div>

                    {/* Icon Wrapper */}
                    <div className="w-14 h-14 rounded-2xl bg-primary/5 text-primary flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-primary/10 transition-all duration-300">
                      <Icon className="h-7 w-7" />
                    </div>

                    {/* Title & Description */}
                    <h3 className="font-display text-xl font-bold text-foreground mb-3">{s.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 bg-background border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16 space-y-3">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Loved by Graduates</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-base sm:text-lg">
              Here is how we helped previous graduates make their milestone celebration memorable.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
              >
                <Card className="relative p-8 bg-card border border-border/80 rounded-3xl h-full flex flex-col justify-between hover:shadow-md hover:border-primary/20 transition-all duration-300">
                  <div className="space-y-4">
                    {/* Stars */}
                    <div className="flex gap-1 text-amber-500">
                      {[...Array(5)].map((_, idx) => (
                        <Star key={idx} className="h-4 w-4 fill-amber-500" />
                      ))}
                    </div>

                    {/* Quote */}
                    <p className="text-sm text-muted-foreground italic leading-relaxed">
                      "{t.quote}"
                    </p>
                  </div>

                  <div className="flex items-center gap-3.5 pt-6 mt-6 border-t border-border/60">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-display text-sm font-bold shrink-0">
                      {t.initials}
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground text-sm leading-tight">{t.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.program}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
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
              <span className="hover:text-foreground cursor-pointer transition-colors" onClick={() => navigate('/privacy')}>Privacy Policy</span>
              <span className="hover:text-foreground cursor-pointer transition-colors" onClick={() => navigate('/terms')}>Terms of Service</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
