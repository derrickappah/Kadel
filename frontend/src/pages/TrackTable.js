import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  Search, Loader2, ArrowLeft, Table2, Calendar, Users, 
  Mail, Phone, CheckCircle2, Clock, MapPin, Sparkles, GraduationCap, Briefcase 
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function TrackTable() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [reservation, setReservation] = useState(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("Please enter a reservation code");
      return;
    }
    
    setLoading(true);
    setSearched(false);
    setReservation(null);
    
    try {
      const res = await axios.get(`${API}/bookings/lookup/${code.toUpperCase().trim()}`);
      setReservation(res.data);
      setSearched(true);
      toast.success("Reservation details loaded successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || "Reservation not found. Please verify the code.");
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-10 sm:py-16 px-4">
      <div className="max-w-2xl mx-auto pb-32">
        {/* Back navigation link */}
        <button 
          onClick={() => navigate('/')} 
          className="group mb-8 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          <span>Back to Home</span>
        </button>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Table2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Track Reservation
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
            Enter your reservation code to view your table assignment, guest headcount, and catering details.
          </p>
        </div>

        {/* Search Input Box */}
        <Card className="border-border/80 shadow-lg rounded-2xl mb-8 overflow-hidden">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="code"
                  placeholder="ENTER RESERVATION CODE (e.g. KAD123)"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-12 pl-11 text-base uppercase font-mono tracking-widest border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl"
                  disabled={loading}
                />
              </div>
              <Button type="submit" disabled={loading} size="lg" className="h-12 px-8 font-bold rounded-xl active:scale-98 transition-all">
                {loading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Searching...</>
                ) : (
                  "Find Details"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Results */}
        <AnimatePresence mode="wait">
          {reservation && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* Premium Ticket Card */}
              <Card className="border-border/80 overflow-hidden shadow-xl rounded-2xl relative bg-card">
                {/* Ghana Kente Accent Flag at the very top */}
                <div className="flex gap-0 h-1.5 w-full">
                  <div className="bg-[#FF3300] flex-1" />
                  <div className="bg-[#FFCC00] flex-1" />
                  <div className="bg-[#009933] flex-1" />
                </div>
                
                <CardContent className="pt-8 pb-8 px-6 sm:px-8 text-center flex flex-col items-center">
                  {/* Status Ring Badge */}
                  <div className="relative mb-4">
                    {reservation.status === "confirmed" ? (
                      <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="h-9 w-9 text-emerald-500" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                        <Clock className="h-9 w-9 text-amber-500 animate-pulse" />
                      </div>
                    )}
                  </div>
                  
                  <Badge 
                    variant={reservation.status === "confirmed" ? "success" : "warning"}
                    className="px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm border"
                  >
                    {reservation.status}
                  </Badge>

                  <h3 className="font-display text-2xl font-black text-foreground mt-4">
                    {reservation.status === "confirmed" ? "Reservation Confirmed!" : "Pending Confirmation"}
                  </h3>
                  <p className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest mt-1">
                    Code: {reservation.reservation_code}
                  </p>

                  <Separator className="my-6 max-w-sm border-border/60" />

                  {/* Large Glowing Table Assignment circle */}
                  <div className="space-y-3">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest block">
                      Assigned Table
                    </span>
                    {reservation.table_number ? (
                      <motion.div 
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        className="inline-flex flex-col items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-lg shadow-primary/20 border-4 border-background"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground/75">Table</span>
                        <span className="text-4xl font-extrabold font-mono tracking-tight -mt-0.5">{reservation.table_number}</span>
                      </motion.div>
                    ) : (
                      <div className="inline-flex flex-col items-center justify-center px-8 py-5 rounded-2xl bg-secondary/50 text-muted-foreground border border-dashed border-border">
                        <Table2 className="h-6 w-6 mb-1 text-muted-foreground/60" />
                        <span className="text-xs font-bold">Pending Assignment</span>
                      </div>
                    )}
                    {reservation.table_number && (
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 mt-2 bg-secondary/50 px-4 py-1.5 rounded-full font-medium">
                        <Sparkles className="h-3.5 w-3.5 text-primary" /> Present this table number at check-in
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Details Summary Card */}
              <Card className="border-border/80 shadow-lg rounded-2xl overflow-hidden bg-card">
                <CardHeader className="bg-secondary/10 border-b border-border/40 py-4 px-6">
                  <CardTitle className="font-display text-base font-bold text-foreground">Reservation Details</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
                    <div className="flex items-start gap-3">
                      <GraduationCap className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Graduate</p>
                        <p className="text-sm font-bold text-foreground">{reservation.graduate_name}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Graduation Date</p>
                        <p className="text-sm font-bold text-foreground">{reservation.graduation_date}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 col-span-1 sm:col-span-2 border-t border-border/30 pt-3">
                      <Briefcase className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Program</p>
                        <p className="text-sm font-bold text-foreground">{reservation.course}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 border-t border-border/30 pt-3">
                      <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Guests</p>
                        <p className="text-sm font-bold text-foreground">{reservation.attendees_count} Guests</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 border-t border-border/30 pt-3">
                      <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Amount Paid</p>
                        <p className="text-sm font-bold text-foreground">GHC {reservation.total_amount?.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 col-span-1 sm:col-span-2 border-t border-border/30 pt-3">
                      <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Email Address</p>
                        <p className="text-sm font-bold text-foreground break-all">{reservation.email}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 col-span-1 sm:col-span-2 border-t border-border/30 pt-3">
                      <Phone className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Phone / WhatsApp</p>
                        <p className="text-sm font-bold text-foreground">{reservation.phone}</p>
                      </div>
                    </div>
                  </div>

                  {/* Catering details if any */}
                  {reservation.wants_food && reservation.selections && reservation.selections.length > 0 && (
                    <div className="pt-5 border-t border-border/60">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Selected Catering Items</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {reservation.selections.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-secondary/35 px-4 py-2.5 rounded-xl border border-border/40 text-xs">
                            <span className="font-semibold text-foreground">{item.product_name}</span>
                            <span className="font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-lg">x{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* No results prompt */}
          {searched && !reservation && !loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center p-8 bg-destructive/5 border border-destructive/10 rounded-2xl animate-fade-in"
            >
              <p className="text-sm text-destructive font-semibold">
                No reservation found with code <span className="font-mono text-foreground font-extrabold uppercase">"{code}"</span>.
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">
                Please double check the spelling and try again.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
