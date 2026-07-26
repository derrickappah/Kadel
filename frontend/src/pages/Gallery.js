import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Camera, ArrowRight, Table2, Calendar, Sparkles, Star, ShieldCheck, Mail, Phone 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import PhotoGallery from "@/components/PhotoGallery";

export default function Gallery() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Top Header Navigation */}
      <header className="border-b border-border/60 bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div 
            className="flex items-center gap-1.5 cursor-pointer" 
            onClick={() => navigate('/')}
            data-testid="nav-logo"
          >
            <img src="/logo.png" alt="KaDel Logo" className="h-9 w-auto object-contain rounded-xl shadow-sm" />
            <span className="font-display text-xl font-bold tracking-tight text-black dark:text-white">KaDel</span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button 
              onClick={() => navigate('/')} 
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Home
            </button>
            <button 
              onClick={() => navigate('/leads')} 
              className="text-primary font-semibold hover:text-primary/80 transition-colors cursor-pointer"
            >
              Priority Waitlist
            </button>
            <button 
              onClick={() => navigate('/book')} 
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Reserve Table
            </button>
            <button 
              onClick={() => navigate('/track')} 
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Track Table
            </button>
            <button 
              onClick={() => navigate('/gallery')} 
              className="text-foreground font-bold border-b-2 border-primary pb-0.5"
            >
              Photo Gallery
            </button>
          </nav>

          {/* Action Button */}
          <div className="flex items-center gap-3">
            <Button 
              size="sm" 
              className="rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 py-2 text-xs sm:text-sm shadow-md"
              onClick={() => navigate('/book')}
              data-testid="header-book-btn"
            >
              Reserve Table
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-12 space-y-16">
        {/* Gallery Hero Section */}
        <section className="text-center space-y-6 pt-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-4 max-w-2xl mx-auto"
          >
            {/* Ghana Kente Accent Bar Centered */}
            <div className="flex justify-center mb-4">
              <div className="flex gap-0.5 h-1.5 w-20 rounded-full overflow-hidden shadow-sm">
                <div className="bg-[#FF3300] flex-1" />
                <div className="bg-[#FFCC00] flex-1" />
                <div className="bg-[#009933] flex-1" />
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <Camera className="h-3.5 w-3.5" /> Official KaDel Moments
            </div>

            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
              Graduation Photo Gallery
            </h1>

            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed font-light">
              Take a glimpse at how graduates, families, and friends celebrate their milestone moments with KaDel Ghana's gourmet dining and reservation experience.
            </p>
          </motion.div>

          {/* Quick Stats Highlights */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-3 gap-4 max-w-xl mx-auto pt-2"
          >
            <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-sm text-center">
              <p className="font-display text-2xl sm:text-3xl font-extrabold text-primary">9</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">Featured Photos</p>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-sm text-center">
              <p className="font-display text-2xl sm:text-3xl font-extrabold text-primary">100%</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">Memorable Vibes</p>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-sm text-center">
              <p className="font-display text-2xl sm:text-3xl font-extrabold text-primary">5-Star</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">Graduate Rating</p>
            </div>
          </motion.div>
        </section>

        {/* Reusable Photo Gallery Component */}
        <section>
          <PhotoGallery showCategoryFilter={true} />
        </section>

        {/* CTA Banner */}
        <section className="pt-8">
          <div className="relative overflow-hidden rounded-3xl bg-card border border-border/80 p-8 sm:p-12 text-center shadow-sm">
            <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-5 max-w-xl mx-auto">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Ready to Create Your Graduation Memories?
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                Secure your table in advance and customize your catering menu for an unforgettable graduation dinner.
              </p>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button 
                  size="lg" 
                  className="w-full sm:w-auto rounded-xl text-sm sm:text-base px-8 py-6 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer" 
                  onClick={() => navigate('/book')} 
                  data-testid="gallery-cta-book-btn"
                >
                  Reserve Your Table <ArrowRight className="h-4 w-4" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline"
                  className="w-full sm:w-auto rounded-xl text-sm sm:text-base px-8 py-6 bg-card hover:bg-accent border-border/80 font-semibold cursor-pointer" 
                  onClick={() => navigate('/leads')} 
                  data-testid="gallery-cta-leads-btn"
                >
                  Join Priority List
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/80 bg-card/50 py-12 text-foreground/90 mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-1.5">
                <img src="/logo.png" alt="KaDel Logo" className="h-8 w-auto object-contain rounded-xl shadow-sm" />
                <span className="font-display text-xl font-bold tracking-wide text-black dark:text-white">KaDel</span>
              </div>
              <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                Reserve your table and select your preferred food and drinks to celebrate your graduation in style.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Navigation</h4>
              <ul className="space-y-2 text-xs">
                <li><button onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">Home</button></li>
                <li><button onClick={() => navigate('/leads')} className="text-primary font-semibold hover:text-primary/80">Priority List</button></li>
                <li><button onClick={() => navigate('/book')} className="text-muted-foreground hover:text-foreground">Reserve Table</button></li>
                <li><button onClick={() => navigate('/track')} className="text-muted-foreground hover:text-foreground">Track Table</button></li>
                <li><button onClick={() => navigate('/gallery')} className="text-muted-foreground hover:text-foreground font-semibold">Photo Gallery</button></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Support</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li><a href="mailto:reservations@kadelgh.com" className="hover:text-foreground flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-primary" /> reservations@kadelgh.com</a></li>
                <li><a href="https://wa.me/233241234567" target="_blank" rel="noopener noreferrer" className="hover:text-foreground flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-primary" /> WhatsApp Support</a></li>
              </ul>
            </div>
          </div>

          <Separator className="bg-border/60 my-6" />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} KaDel Ghana. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-foreground cursor-pointer" onClick={() => navigate('/privacy')}>Privacy Policy</span>
              <span className="hover:text-foreground cursor-pointer" onClick={() => navigate('/terms')}>Terms of Service</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
