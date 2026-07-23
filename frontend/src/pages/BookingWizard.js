import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { GraduationCap, ArrowLeft, ArrowRight, User, Users, Utensils, CreditCard, Minus, Plus, Loader2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEP_LABELS = [
  { icon: User, label: "Personal Info" },
  { icon: Users, label: "Guests" },
  { icon: Utensils, label: "Catering" },
  { icon: CreditCard, label: "Review & Pay" },
];

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

export default function BookingWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Data from API
  const [dates, setDates] = useState([]);
  const [products, setProducts] = useState([]);
  const [eventFee, setEventFee] = useState(0);

  // Form state
  const [form, setForm] = useState({
    graduateName: "", course: "", graduationDate: "", phone: "", email: "",
  });
  const [attendeesOption, setAttendeesOption] = useState("10");
  const [customAttendees, setCustomAttendees] = useState("");
  const [wantsFood, setWantsFood] = useState(false);
  const [selections, setSelections] = useState({});

  const attendeesCount = attendeesOption === "more" ? (parseInt(customAttendees) || 0) : parseInt(attendeesOption);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [datesRes, productsRes, settingsRes] = await Promise.all([
          axios.get(`${API}/dates`),
          axios.get(`${API}/products`),
          axios.get(`${API}/event-settings`),
        ]);
        setDates(datesRes.data);
        setProducts(productsRes.data);
        setEventFee(settingsRes.data.event_fee_per_person || 0);
      } catch (e) {
        toast.error("Failed to load data. Please refresh.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const foodItems = useMemo(() => products.filter(p => p.category === "food"), [products]);
  const drinkItems = useMemo(() => products.filter(p => p.category === "drink"), [products]);
  const pastryItems = useMemo(() => products.filter(p => p.category === "pastry"), [products]);

  const updateQty = useCallback((productId, delta) => {
    setSelections(prev => {
      const curr = prev[productId]?.quantity || 0;
      const next = Math.max(0, curr + delta);
      if (next === 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      const product = products.find(p => p.id === productId);
      if (!product) return prev;
      if (next > product.stock) {
        toast.error(`Only ${product.stock} packs available for ${product.name}`);
        return prev;
      }
      return { ...prev, [productId]: { product, quantity: next } };
    });
  }, [products]);

  const chargedAttendees = Math.ceil(attendeesCount / 10) * 10;
  const baseCost = Math.ceil(attendeesCount / 10) * eventFee;
  const foodCost = Object.values(selections).reduce((sum, s) => sum + s.product.price * s.quantity, 0);
  const totalCost = baseCost + (wantsFood ? foodCost : 0);

  const selectionsList = useMemo(() =>
    Object.entries(selections).map(([pid, s]) => ({
      product_id: pid,
      product_name: s.product.name,
      quantity: s.quantity,
      unit_price: s.product.price,
      subtotal: s.product.price * s.quantity,
    })),
  [selections]);

  // Validation
  const validateStep = (s) => {
    if (s === 0) {
      if (!form.graduateName.trim()) { toast.error("Please enter graduate name"); return false; }
      if (!form.course.trim()) { toast.error("Please enter program"); return false; }
      if (!form.graduationDate) { toast.error("Please select graduation date"); return false; }
      if (!form.phone.trim()) { toast.error("Please enter phone number"); return false; }
      if (!form.email.trim() || !form.email.includes("@")) { toast.error("Please enter a valid email"); return false; }
    }
    if (s === 1) {
      // FIX: Validate that custom attendee count is a positive integer >= 1
      if (attendeesOption === "more") {
        const parsed = parseInt(customAttendees, 10);
        if (!customAttendees || isNaN(parsed) || parsed < 1 || String(parsed) !== customAttendees.trim()) {
          toast.error("Please enter a valid number of attendees (minimum 1)");
          return false;
        }
      }
      if (attendeesCount < 1) { toast.error("Please enter valid number of attendees"); return false; }
    }
    if (s === 2) {
      // FIX: Warn (but don't block) when catering is enabled but no items selected
      if (wantsFood && selectionsList.length === 0) {
        toast.warning("You enabled catering but haven't selected any items. You can continue, or go back to add items.");
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setDirection(1);
    setStep(prev => Math.min(prev + 1, 3));
  };
  const goBack = () => {
    setDirection(-1);
    setStep(prev => Math.max(prev - 1, 0));
  };

  const handlePay = async () => {
    // FIX: Re-run full validation for all steps before submitting.
    // A user who navigates back (to step 0 or 1) after reaching step 3 could
    // corrupt their form data; without re-validation the bad data reaches the API.
    for (let s = 0; s <= 2; s++) {
      if (!validateStep(s)) return;
    }
    // FIX: Allow zero-cost bookings (free events) to proceed. The old guard
    // `totalCost <= 0` blocked legitimate free-entry events where eventFee = 0.
    // The backend will create the booking; payment initialization will fail for
    // zero amounts and the test-complete path handles them gracefully.
    setIsSubmitting(true);
    try {
      // Create booking
      const bookingRes = await axios.post(`${API}/bookings`, {
        graduate_name: form.graduateName,
        course: form.course,
        graduation_date: form.graduationDate,
        phone: form.phone,
        email: form.email,
        attendees_count: attendeesCount,
        wants_food: wantsFood,
        selections: wantsFood ? selectionsList : [],
      });
      const { id: bookingId } = bookingRes.data;

      // Initialize payment
      const callbackUrl = `${window.location.origin}/payment/callback`;
      try {
        const payRes = await axios.post(`${API}/payments/initialize`, {
          booking_id: bookingId,
          callback_url: callbackUrl,
        });
        // Redirect to Paystack
        window.location.href = payRes.data.authorization_url;
      } catch (payErr) {
        const errMsg = payErr.response?.data?.detail || "Payment initialization failed";
        if (errMsg.includes("Moolre not configured")) {
          toast.error("Payment gateway not configured. Using test mode...");
          // Use test-complete endpoint
          const testRes = await axios.post(`${API}/payments/test-complete/${bookingId}`);
          if (testRes.data.status === "success" || testRes.data.status === "already_confirmed") {
            navigate(`/payment/callback?test=true&booking_id=${bookingId}&code=${testRes.data.booking.reservation_code}`);
          }
        } else {
          toast.error(errMsg);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Booking failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = ((step + 1) / 4) * 100;

  const renderMenuItems = (items, categoryLabel) => (
    <div className="grid gap-3">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No {categoryLabel} available</p>
      ) : items.map(item => {
        const qty = selections[item.id]?.quantity || 0;
        return (
          <Card key={item.id} className="p-3 sm:p-4 border-border/80 shadow-sm" data-testid="menu-item-card">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm sm:text-base text-foreground">{item.name}</span>
                  <Badge variant="secondary" className="text-xs font-medium">GHC {item.price.toFixed(2)}</Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${item.stock > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  <span>{item.stock > 0 ? `${item.stock} packs available` : "Sold out"}</span>
                  {item.vendor && <span className="text-muted-foreground/60"> · {item.vendor}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-secondary active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                  onClick={() => updateQty(item.id, -1)}
                  disabled={qty === 0}
                  data-testid="menu-item-quantity-decrease"
                >
                  <Minus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
                <span className="w-8 text-center text-sm font-semibold text-foreground select-none">{qty}</span>
                <button
                  className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-secondary active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                  onClick={() => updateQty(item.id, 1)}
                  disabled={item.stock <= qty}
                  data-testid="menu-item-quantity-increase"
                >
                  <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading reservation details...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 sm:py-12">
      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 pb-32">
        {/* Redesigned Steps Indicator */}
        <div className="mb-10 relative z-0" data-testid="booking-stepper">
          <div className="relative flex items-center justify-between">
            {/* Background connecting line starting/ending at bubble centers */}
            <div className="absolute left-5 right-5 top-5 -translate-y-1/2 h-0.5 bg-muted z-0" />
            
            {/* Active progress connecting line */}
            <div className="absolute left-5 right-5 top-5 -translate-y-1/2 h-0.5 z-0">
              <div 
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>

            {STEP_LABELS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isCompleted = i < step;
              
              return (
                <div key={i} className="flex flex-col items-center gap-2 relative">
                  {/* Step Bubble */}
                  <div 
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-background z-10",
                      isCompleted 
                        ? "bg-primary border-primary text-primary-foreground shadow-md shadow-primary/10" 
                        : isActive 
                        ? "border-primary text-primary ring-4 ring-primary/10 shadow-sm" 
                        : "border-muted text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-5 w-5 shrink-0" />
                    ) : (
                      <Icon className="h-4.5 w-4.5 shrink-0" />
                    )}
                  </div>

                  {/* Label Text */}
                  <span 
                    className={cn(
                      "text-[10px] sm:text-xs font-semibold tracking-wide transition-colors duration-200",
                      isActive ? "text-primary font-bold" : isCompleted ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Step 0: Personal Info */}
            {step === 0 && (
              <Card data-testid="booking-step-card">
                <CardHeader>
                  <CardTitle className="font-display text-xl">Personal Information</CardTitle>
                  <p className="text-sm text-muted-foreground">Enter the graduate's details</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="graduateName" className="inline-block mb-1.5 text-sm font-medium">Graduate Name *</Label>
                    <Input id="graduateName" placeholder="Full name" value={form.graduateName}
                      onChange={e => setForm(p => ({ ...p, graduateName: e.target.value }))}
                      className="h-11 md:h-9 text-base md:text-sm"
                      data-testid="input-graduate-name" />
                  </div>
                  <div>
                    <Label htmlFor="course" className="inline-block mb-1.5 text-sm font-medium">Program *</Label>
                    <Input id="course" placeholder="e.g. BSc Computer Science" value={form.course}
                      onChange={e => setForm(p => ({ ...p, course: e.target.value }))}
                      className="h-11 md:h-9 text-base md:text-sm"
                      data-testid="input-course" />
                  </div>
                  <div>
                    <Label className="inline-block mb-1.5 text-sm font-medium">Graduation Date *</Label>
                    <Select value={form.graduationDate} onValueChange={v => setForm(p => ({ ...p, graduationDate: v }))}>
                      <SelectTrigger className="h-11 md:h-9 text-base md:text-sm w-full" data-testid="graduation-date-picker">
                        <SelectValue placeholder="Select graduation date" />
                      </SelectTrigger>
                      <SelectContent>
                        {dates.map(d => (
                          <SelectItem key={d.id} value={d.date_label}>{d.date_label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="phone" className="inline-block mb-1.5 text-sm font-medium">Phone Number / WhatsApp Number *</Label>
                    <Input id="phone" placeholder="+233 XX XXX XXXX" value={form.phone}
                      onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                      className="h-11 md:h-9 text-base md:text-sm"
                      data-testid="input-phone" />
                  </div>
                  <div>
                    <Label htmlFor="email" className="inline-block mb-1.5 text-sm font-medium">Email *</Label>
                    <Input id="email" type="email" placeholder="your.name@gmail.com" value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      className="h-11 md:h-9 text-base md:text-sm"
                      data-testid="input-email" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 1: Guests */}
            {step === 1 && (
              <Card data-testid="booking-step-card">
                <CardHeader>
                  <CardTitle className="font-display text-xl">Number of Guests</CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={attendeesOption} onValueChange={setAttendeesOption} data-testid="attendees-radio">
                    <div className="space-y-3">
                      {["10", "20"].map(val => (
                        <label key={val} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors duration-150 ${
                          attendeesOption === val ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-secondary/50'
                        }`}>
                          <RadioGroupItem value={val} />
                          <div>
                            <span className="font-semibold text-sm sm:text-base">{val} Guests</span>
                            <p className="text-xs text-muted-foreground mt-0.5">Reservation Fee: GHC {(Math.ceil(parseInt(val) / 10) * eventFee).toFixed(2)}</p>
                          </div>
                        </label>
                      ))}
                      <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors duration-150 ${
                        attendeesOption === 'more' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-secondary/50'
                      }`}>
                        <RadioGroupItem value="more" />
                        <div className="flex-1">
                          <span className="font-semibold text-sm sm:text-base">More</span>
                          <p className="text-xs text-muted-foreground mt-0.5">Enter custom number</p>
                        </div>
                      </label>
                    </div>
                  </RadioGroup>
                  {attendeesOption === "more" && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
                      <Label htmlFor="customAttendees" className="inline-block mb-1.5 text-sm font-medium">Number of People</Label>
                      <Input
                        id="customAttendees"
                        type="number"
                        min="1"
                        placeholder="Enter number"
                        value={customAttendees}
                        onChange={e => setCustomAttendees(e.target.value)}
                        className="h-11 md:h-9 text-base md:text-sm"
                        data-testid="attendees-custom-input"
                      />
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 2: Catering */}
            {step === 2 && (
              <div className="space-y-4">
                <Card data-testid="booking-step-card">
                  <CardHeader>
                    <CardTitle className="font-display text-xl">Catering Options</CardTitle>
                    <p className="text-sm text-muted-foreground">Let KaDel handle your refreshment stress free.</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm">
                      <div className="pr-3">
                        <span className="font-semibold text-sm sm:text-base">Add food, drinks & pastries</span>
                        <p className="text-xs text-muted-foreground mt-0.5">Tap the button to select.</p>
                      </div>
                      <Switch
                        checked={wantsFood}
                        onCheckedChange={setWantsFood}
                        data-testid="food-toggle-switch"
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </CardContent>
                </Card>

                {wantsFood && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Card>
                      <CardContent className="pt-6 px-3 sm:px-6">
                        <Tabs defaultValue="food" data-testid="menu-tabs">
                          <TabsList className="w-full bg-muted/60 p-1 rounded-xl h-11 sm:h-10">
                            <TabsTrigger value="food" className="flex-1 rounded-lg text-xs sm:text-sm font-medium py-2">Food</TabsTrigger>
                            <TabsTrigger value="drink" className="flex-1 rounded-lg text-xs sm:text-sm font-medium py-2">Drinks</TabsTrigger>
                            <TabsTrigger value="pastry" className="flex-1 rounded-lg text-xs sm:text-sm font-medium py-2">Pastries</TabsTrigger>
                          </TabsList>
                          <TabsContent value="food" className="mt-4">
                            {renderMenuItems(foodItems, "food items")}
                          </TabsContent>
                          <TabsContent value="drink" className="mt-4">
                            {renderMenuItems(drinkItems, "drinks")}
                          </TabsContent>
                          <TabsContent value="pastry" className="mt-4">
                            {renderMenuItems(pastryItems, "pastries")}
                          </TabsContent>
                        </Tabs>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </div>
            )}

            {/* Step 3: Review & Pay */}
            {step === 3 && (
              <Card data-testid="booking-step-card">
                <CardHeader>
                  <CardTitle className="font-display text-xl">Review & Pay</CardTitle>
                  <p className="text-sm text-muted-foreground">Confirm your reservation details.</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Personal Info Summary */}
                  <div className="bg-secondary/40 border border-border/40 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Booking Details</h4>
                    <div className="flex flex-col gap-2.5">
                      {[
                        { label: "Name", value: form.graduateName },
                        { label: "Program", value: form.course },
                        { label: "Graduation Date", value: form.graduationDate },
                        { label: "Phone", value: form.phone },
                        { label: "Email", value: form.email },
                        { label: "Guests", value: `${attendeesCount} guests` },
                      ].map((item, idx) => (
                        <div key={idx} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-1.5 border-b border-border/40 last:border-0 text-sm gap-0.5 sm:gap-2">
                          <span className="text-muted-foreground font-medium shrink-0">{item.label}</span>
                          <span className="font-semibold text-foreground text-left sm:text-right break-all max-w-full sm:max-w-[70%]">
                            {item.value || "---"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Cost Breakdown */}
                  <div data-testid="booking-total-summary" className="space-y-3">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Cost Breakdown</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Table Reservation Fee (Charged for {chargedAttendees} guests @ GHC {(eventFee / 10).toFixed(2)} / guest)</span>
                        <span className="font-semibold text-foreground">GHC {baseCost.toFixed(2)}</span>
                      </div>
                      {wantsFood && selectionsList.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-border/40">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">FOOD & BEVERAGES</p>
                          {selectionsList.map(s => (
                            <div key={s.product_id} className="flex justify-between text-sm pl-2 border-l-2 border-primary/20">
                              <span className="text-muted-foreground">{s.product_name} <span className="font-mono text-xs font-semibold text-foreground bg-secondary/80 px-1.5 py-0.5 rounded">x{s.quantity}</span></span>
                              <span className="font-medium text-foreground">GHC {s.subtotal.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <Separator className="my-3" />
                      <div className="flex justify-between items-center text-base sm:text-lg font-bold" data-testid="booking-total-amount">
                        <span className="text-foreground">Total Amount</span>
                        <span className="text-primary text-lg sm:text-xl font-extrabold">GHC {totalCost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          {step < 3 ? (
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Price</span>
              <span className="text-base sm:text-lg font-extrabold text-primary" data-testid="booking-total-amount-sticky">
                GHC {totalCost.toFixed(2)}
              </span>
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2.5">
            {step > 0 && (
              <Button 
                variant="outline" 
                onClick={goBack} 
                className="h-11 px-4 sm:px-5 rounded-xl border-border hover:bg-secondary text-muted-foreground hover:text-foreground active:scale-95 transition-all duration-150 flex items-center gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            )}
            {step < 3 ? (
              <Button 
                onClick={goNext} 
                className="h-11 px-6 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-95 transition-all duration-150"
              >
                Next <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handlePay}
                disabled={isSubmitting}
                className="h-11 px-6 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-95 transition-all duration-150"
                data-testid="paystack-pay-button"
              >
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                  <>Pay GHC {totalCost.toFixed(2)} <CreditCard className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
