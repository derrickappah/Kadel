import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  GraduationCap, 
  Sparkles, 
  CheckCircle2, 
  Users, 
  Mail, 
  Phone, 
  User, 
  BookOpen, 
  ArrowRight, 
  BellRing, 
  Share2, 
  ChevronLeft,
  MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function LeadCapture() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    course: ""
  });

  const [loading, setLoading] = useState(false);
  const [submittedLead, setSubmittedLead] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.fullName.trim() || !formData.email.trim() || !formData.phone.trim() || !formData.course.trim()) {
      toast.error("Please fill in all required fields (Name, Email, Phone, and Course)");
      return;
    }

    setLoading(true);

    const payload = {
      full_name: formData.fullName,
      email: formData.email,
      phone: formData.phone,
      institution: "General",
      course: formData.course,
      estimated_guests: 10,
      expected_graduation_period: "Pending Announcement",
      notes: ""
    };

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
      const res = await fetch(`${backendUrl}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to submit interest. Please try again.");
      }

      setSubmittedLead(data);
      toast.success("Successfully joined the priority waitlist!");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Something went wrong. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleShareWhatsApp = () => {
    const text = `Hey! I just joined the KaDel Graduation Table priority list. If you're graduating soon, reserve early interest before official dates drop! Check it out here: ${window.location.origin}/leads`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleJoinWhatsAppGroup = () => {
    window.open("https://chat.whatsapp.com/FS08aeTr9zg7zVdUHA66uy?s=sw&p=i&mlu=4&amv=0", "_blank");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Top Header Navigation */}
      <header className="border-b border-border/60 bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => navigate('/')}>
            <img src="/logo.png" alt="KaDel Logo" className="h-9 w-auto object-contain rounded-xl shadow-sm" />
            <span className="font-display text-xl font-bold tracking-tight text-black dark:text-white">KaDel</span>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4 mr-1" /> Home
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/track')} className="hidden sm:flex border-border/80">
              Track Reservation
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-12 sm:py-16 px-4 sm:px-6 max-w-5xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {!submittedLead ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="space-y-10"
            >
              {/* Form Layout */}
              <div className="max-w-xl mx-auto w-full pt-2 space-y-6">
                {/* Header & Subtitle Outside Form */}
                <div className="text-center space-y-2">
                  <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground text-center">
                    Get Notified
                  </h1>
                  <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto leading-relaxed">
                    Fill in your details to get notified the second official graduation dates drop.
                  </p>
                  
                  {/* Kente Accent */}
                  <div className="flex justify-center pt-2">
                    <div className="flex gap-0.5 h-1 w-16 rounded-full overflow-hidden">
                      <div className="bg-[#FF3300] flex-1" />
                      <div className="bg-[#FFCC00] flex-1" />
                      <div className="bg-[#009933] flex-1" />
                    </div>
                  </div>
                </div>

                {/* Form Card */}
                <Card className="bg-card border-border/80 rounded-3xl shadow-xl overflow-hidden">
                  <CardContent className="p-6 sm:p-8 space-y-6">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      {/* Name */}
                      <div className="space-y-2">
                        <Label htmlFor="fullName" className="text-sm font-semibold flex items-center gap-1.5">
                          <User className="h-4 w-4 text-muted-foreground" />
                          Full Name (Graduate / Host) <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="fullName"
                          name="fullName"
                          placeholder="e.g. Abena Mensah"
                          value={formData.fullName}
                          onChange={handleChange}
                          required
                          className="rounded-xl h-11 border-border/80 focus-visible:ring-primary"
                        />
                      </div>

                      {/* Email & Phone Grid */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="email" className="text-sm font-semibold flex items-center gap-1.5">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            Email Address <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="abena@gmail.com"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="rounded-xl h-11 border-border/80 focus-visible:ring-primary"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="phone" className="text-sm font-semibold flex items-center gap-1.5">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            Phone / WhatsApp <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="phone"
                            name="phone"
                            type="tel"
                            placeholder="024 123 4567"
                            value={formData.phone}
                            onChange={handleChange}
                            required
                            className="rounded-xl h-11 border-border/80 focus-visible:ring-primary"
                          />
                        </div>
                      </div>

                      {/* Course */}
                      <div className="space-y-2">
                        <Label htmlFor="course" className="text-sm font-semibold flex items-center gap-1.5">
                          <BookOpen className="h-4 w-4 text-muted-foreground" />
                          Course / Program of Study <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="course"
                          name="course"
                          placeholder="e.g. BSc. Business Administration"
                          value={formData.course}
                          onChange={handleChange}
                          required
                          className="rounded-xl h-11 border-border/80 focus-visible:ring-primary"
                        />
                      </div>

                      {/* Submit */}
                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.99] mt-2"
                      >
                        {loading ? (
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                            <span>Joining Waitlist...</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <span>Join Priority Waitlist</span>
                            <ArrowRight className="h-5 w-5" />
                          </div>
                        )}
                      </Button>

                      <div className="rounded-2xl bg-secondary/40 border border-border/80 p-4 text-xs space-y-2.5 text-left">
                        <div className="font-bold text-foreground text-xs uppercase tracking-wider text-muted-foreground">
                          Table Reservation Prices
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="bg-card p-2.5 rounded-xl border border-border/60 text-center shadow-sm">
                            <span className="block text-[11px] font-medium text-muted-foreground">1–10 Guests</span>
                            <span className="font-extrabold text-foreground text-sm">GH¢900</span>
                          </div>
                          <div className="bg-card p-2.5 rounded-xl border border-border/60 text-center shadow-sm">
                            <span className="block text-[11px] font-medium text-muted-foreground">11–20 Guests</span>
                            <span className="font-extrabold text-foreground text-sm">GH¢1,800</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug pt-1">
                          <strong className="text-foreground font-semibold">NB:</strong> Catering menu options will be available after the official graduation date is released.
                        </p>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          ) : (
            /* Success State */
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="max-w-xl mx-auto py-8"
            >
              <Card className="bg-card border-border/80 rounded-3xl shadow-2xl overflow-hidden text-center p-8 sm:p-10 space-y-6">
                <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 text-emerald-600 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10" />
                </div>

                <div className="space-y-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 px-3 py-1 text-xs font-bold rounded-full">
                    Priority Waitlist Confirmed
                  </Badge>

                  <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                    You're on the Priority List!
                  </h2>

                  <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                    Thank you, <strong className="text-foreground">{submittedLead.data?.full_name}</strong>. We have registered your table reservation interest.
                  </p>
                </div>

                {/* Priority Lead Code Box */}
                <div className="p-4 rounded-2xl bg-muted/50 border border-border/80 max-w-sm mx-auto space-y-1">
                  <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Your VIP Priority Reference</span>
                  <div className="font-mono text-2xl font-black text-primary tracking-widest">
                    {submittedLead.lead_code}
                  </div>
                </div>

                <div className="text-xs text-muted-foreground bg-primary/5 p-4 rounded-2xl border border-primary/10 text-left space-y-2">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <BellRing className="h-4 w-4 text-primary" /> What happens next?
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                    <li>We track official graduation announcements.</li>
                    <li>As soon as dates drop, we send an instant SMS & WhatsApp alert to <strong>{submittedLead.data?.phone}</strong>.</li>
                    <li>You get priority access to confirm your table selection before public release.</li>
                  </ul>
                </div>

                <div className="pt-2 flex flex-col gap-3 max-w-xs mx-auto w-full">
                  <Button
                    onClick={handleShareWhatsApp}
                    variant="outline"
                    className="rounded-xl border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 font-semibold gap-2 h-11 w-full"
                  >
                    <Share2 className="h-4 w-4" /> Share with friends
                  </Button>

                  <Button
                    onClick={handleJoinWhatsAppGroup}
                    className="rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-11 w-full shadow-md shadow-emerald-600/20"
                  >
                    <MessageCircle className="h-4 w-4" /> Join WhatsApp group
                  </Button>

                  <Button
                    onClick={() => navigate('/')}
                    variant="ghost"
                    className="rounded-xl font-semibold text-muted-foreground hover:text-foreground h-10 w-full"
                  >
                    Back to Home
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} KaDel Ghana. Priority Table Reservations.</p>
      </footer>
    </div>
  );
}
