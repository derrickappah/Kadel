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
    <div className="min-h-screen bg-background pb-12">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur bg-background/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <span className="font-display text-xl font-semibold">KaDel</span>
            <span className="text-xs text-muted-foreground font-medium bg-secondary px-2 py-0.5 rounded-full">Ghana</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Home
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 pt-10">
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Table2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Track My Table</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your reservation code to track your status and see your assigned table.
          </p>
        </div>

        {/* Search Card */}
        <Card className="border-border/80 shadow-md mb-8">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Label htmlFor="code" className="sr-only">Reservation Code</Label>
                <Input
                  id="code"
                  placeholder="e.g. KAD123"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-11 md:h-10 text-base md:text-sm uppercase font-mono tracking-wider"
                  disabled={loading}
                />
              </div>
              <Button type="submit" disabled={loading} className="h-11 sm:h-10 px-6 font-semibold">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Find Details
                  </>
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
              {/* Table Assignment Hero Banner */}
              <Card className="border-border/80 overflow-hidden shadow-lg relative">
                <div className="kente-bar w-full h-1.5" />
                <CardContent className="pt-8 pb-8 text-center flex flex-col items-center">
                  <div className="relative">
                    {reservation.status === "confirmed" ? (
                      <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                        <CheckCircle2 className="h-10 w-10 text-emerald-500 animate-pulse" />
                      </div>
                    ) : (
                      <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                        <Clock className="h-10 w-10 text-amber-500 animate-pulse" />
                      </div>
                    )}
                    <Badge 
                      variant={reservation.status === "confirmed" ? "success" : "warning"}
                      className="absolute -top-1 -right-4 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize border"
                    >
                      {reservation.status}
                    </Badge>
                  </div>
                  
                  <h3 className="font-display text-xl font-bold text-foreground">
                    {reservation.status === "confirmed" ? "Reservation Confirmed!" : "Reservation Pending"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    Code: {reservation.reservation_code}
                  </p>

                  <Separator className="my-6 max-w-sm" />

                  {/* Large Table Indicator */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest block">
                      ASSIGNED TABLE
                    </span>
                    {reservation.table_number ? (
                      <motion.div 
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        className="inline-flex flex-col items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg border-4 border-background"
                      >
                        <span className="text-xs font-bold uppercase tracking-wider text-primary-foreground/70">Table</span>
                        <span className="text-3xl font-extrabold font-mono tracking-tight -mt-1">{reservation.table_number}</span>
                      </motion.div>
                    ) : (
                      <div className="inline-flex flex-col items-center justify-center px-6 py-4 rounded-2xl bg-secondary/80 text-muted-foreground border border-dashed border-border">
                        <Table2 className="h-6 w-6 mb-1 text-muted-foreground/60" />
                        <span className="text-xs font-semibold">Pending Assignment</span>
                      </div>
                    )}
                    {reservation.table_number && (
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-2">
                        <Sparkles className="h-3 w-3 text-primary" /> Present this table number at check-in
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Guest & Reservation Details */}
              <Card className="border-border/80 shadow-md">
                <CardHeader>
                  <CardTitle className="font-display text-lg">Details Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-start gap-2.5">
                      <GraduationCap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Graduate</p>
                        <p className="text-sm font-semibold text-foreground">{reservation.graduate_name}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Graduation Date</p>
                        <p className="text-sm font-semibold text-foreground">{reservation.graduation_date}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 col-span-1 sm:col-span-2">
                      <Briefcase className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Program</p>
                        <p className="text-sm font-semibold text-foreground">{reservation.course}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Users className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Guests</p>
                        <p className="text-sm font-semibold text-foreground">{reservation.attendees_count} Guests</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Amount Paid</p>
                        <p className="text-sm font-semibold text-foreground">GHC {reservation.total_amount?.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Email</p>
                        <p className="text-sm font-semibold text-foreground break-all">{reservation.email}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Phone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Phone / WhatsApp</p>
                        <p className="text-sm font-semibold text-foreground">{reservation.phone}</p>
                      </div>
                    </div>
                  </div>

                  {/* Catering details if any */}
                  {reservation.wants_food && reservation.selections && reservation.selections.length > 0 && (
                    <div className="pt-4 border-t border-border/40">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Selected Catering Items</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
                        {reservation.selections.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-secondary/30 px-3 py-1.5 rounded-lg border border-border/40 text-xs">
                            <span className="font-medium text-foreground">{item.product_name}</span>
                            <span className="font-bold text-primary bg-primary/5 px-2 py-0.5 rounded">x{item.quantity}</span>
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
              className="text-center p-8 bg-secondary/10 border border-border/60 rounded-2xl animate-fade-in"
            >
              <p className="text-sm text-muted-foreground font-medium">
                No reservation found with code <span className="font-mono text-foreground font-semibold">"{code}"</span>.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Please double check the spelling and try again.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
