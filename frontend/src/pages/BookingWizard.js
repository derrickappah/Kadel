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

  // Data from API
  const [dates, setDates] = useState([]);
  const [products, setProducts] = useState([]);
  const [eventFee, setEventFee] = useState(50);

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
        setEventFee(settingsRes.data.event_fee_per_person || 50);
      } catch (e) {
        toast.error("Failed to load data. Please refresh.");
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

  const baseCost = eventFee * attendeesCount;
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
      if (!form.course.trim()) { toast.error("Please enter course"); return false; }
      if (!form.graduationDate) { toast.error("Please select graduation date"); return false; }
      if (!form.phone.trim()) { toast.error("Please enter phone number"); return false; }
      if (!form.email.trim() || !form.email.includes("@")) { toast.error("Please enter a valid email"); return false; }
    }
    if (s === 1) {
      if (attendeesCount < 1) { toast.error("Please enter valid number of attendees"); return false; }
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
    if (totalCost <= 0) {
      toast.error("Total must be greater than 0");
      return;
    }
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
        if (errMsg.includes("Paystack not configured")) {
          toast.error("Paystack not configured. Using test mode...");
          // Use test-complete endpoint
          const testRes = await axios.post(`${API}/payments/test-complete/${bookingId}`);
          if (testRes.data.status === "success") {
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
          <Card key={item.id} className="p-3" data-testid="menu-item-card">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.name}</span>
                  <Badge variant="secondary" className="text-xs">GHC {item.price.toFixed(2)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.stock > 0 ? `${item.stock} packs available` : "Sold out"}
                  {item.vendor && ` · ${item.vendor}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="qty-btn"
                  onClick={() => updateQty(item.id, -1)}
                  disabled={qty === 0}
                  data-testid="menu-item-quantity-decrease"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-8 text-center text-sm font-medium">{qty}</span>
                <button
                  className="qty-btn"
                  onClick={() => updateQty(item.id, 1)}
                  disabled={item.stock <= qty}
                  data-testid="menu-item-quantity-increase"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 backdrop-blur bg-background/80 border-b border-border" data-testid="booking-stepper">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <GraduationCap className="h-5 w-5 text-primary" />
              <span className="font-display font-semibold">GradTable</span>
            </button>
            <span className="text-xs text-muted-foreground" data-testid="booking-stepper-current-step">
              Step {step + 1} of 4
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
          <div className="flex justify-between mt-2">
            {STEP_LABELS.map((s, i) => (
              <div key={i} className={`flex items-center gap-1 text-xs ${
                i <= step ? 'text-primary font-medium' : 'text-muted-foreground'
              }`}>
                {i < step ? <CheckCircle className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
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
                    <Label htmlFor="graduateName">Graduate Name *</Label>
                    <Input id="graduateName" placeholder="Full name" value={form.graduateName}
                      onChange={e => setForm(p => ({ ...p, graduateName: e.target.value }))}
                      data-testid="input-graduate-name" />
                  </div>
                  <div>
                    <Label htmlFor="course">Course *</Label>
                    <Input id="course" placeholder="e.g. BSc Computer Science" value={form.course}
                      onChange={e => setForm(p => ({ ...p, course: e.target.value }))}
                      data-testid="input-course" />
                  </div>
                  <div>
                    <Label>Date of Graduation *</Label>
                    <Select value={form.graduationDate} onValueChange={v => setForm(p => ({ ...p, graduationDate: v }))}>
                      <SelectTrigger data-testid="graduation-date-picker">
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
                    <Label htmlFor="phone">Phone / WhatsApp Number *</Label>
                    <Input id="phone" placeholder="+233 XX XXX XXXX" value={form.phone}
                      onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                      data-testid="input-phone" />
                  </div>
                  <div>
                    <Label htmlFor="email">Official Gmail Account *</Label>
                    <Input id="email" type="email" placeholder="your.name@gmail.com" value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
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
                  <p className="text-sm text-muted-foreground">How many people will be attending?</p>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={attendeesOption} onValueChange={setAttendeesOption} data-testid="attendees-radio">
                    <div className="space-y-3">
                      {["10", "20"].map(val => (
                        <label key={val} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors duration-150 ${
                          attendeesOption === val ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/50'
                        }`}>
                          <RadioGroupItem value={val} />
                          <div>
                            <span className="font-medium">{val} People</span>
                            <p className="text-xs text-muted-foreground">Event fee: GHC {(eventFee * parseInt(val)).toFixed(2)}</p>
                          </div>
                        </label>
                      ))}
                      <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors duration-150 ${
                        attendeesOption === 'more' ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/50'
                      }`}>
                        <RadioGroupItem value="more" />
                        <div className="flex-1">
                          <span className="font-medium">More</span>
                          <p className="text-xs text-muted-foreground">Enter custom number</p>
                        </div>
                      </label>
                    </div>
                  </RadioGroup>
                  {attendeesOption === "more" && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
                      <Label htmlFor="customAttendees">Number of People</Label>
                      <Input
                        id="customAttendees"
                        type="number"
                        min="1"
                        placeholder="Enter number"
                        value={customAttendees}
                        onChange={e => setCustomAttendees(e.target.value)}
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
                    <p className="text-sm text-muted-foreground">Would you like food to be taken care of?</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-4 rounded-xl border border-border">
                      <div>
                        <span className="font-medium">Add food, drinks & pastries</span>
                        <p className="text-xs text-muted-foreground">Select items for your celebration</p>
                      </div>
                      <Switch
                        checked={wantsFood}
                        onCheckedChange={setWantsFood}
                        data-testid="food-toggle-switch"
                      />
                    </div>
                  </CardContent>
                </Card>

                {wantsFood && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Card>
                      <CardContent className="pt-6">
                        <Tabs defaultValue="food" data-testid="menu-tabs">
                          <TabsList className="w-full">
                            <TabsTrigger value="food" className="flex-1">Food</TabsTrigger>
                            <TabsTrigger value="drink" className="flex-1">Drinks</TabsTrigger>
                            <TabsTrigger value="pastry" className="flex-1">Pastries</TabsTrigger>
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
                  <p className="text-sm text-muted-foreground">Confirm your booking details</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Personal Info Summary */}
                  <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Booking Details</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-muted-foreground">Name</span><span className="font-medium">{form.graduateName}</span>
                      <span className="text-muted-foreground">Course</span><span className="font-medium">{form.course}</span>
                      <span className="text-muted-foreground">Graduation</span><span className="font-medium">{form.graduationDate}</span>
                      <span className="text-muted-foreground">Phone</span><span className="font-medium">{form.phone}</span>
                      <span className="text-muted-foreground">Email</span><span className="font-medium">{form.email}</span>
                      <span className="text-muted-foreground">Guests</span><span className="font-medium">{attendeesCount}</span>
                    </div>
                  </div>

                  <Separator />

                  {/* Cost Breakdown */}
                  <div data-testid="booking-total-summary">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Cost Breakdown</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Event Fee ({attendeesCount} guests x GHC {eventFee.toFixed(2)})</span>
                        <span className="font-medium">GHC {baseCost.toFixed(2)}</span>
                      </div>
                      {wantsFood && selectionsList.length > 0 && (
                        <>
                          <Separator className="my-2" />
                          <p className="text-xs font-semibold text-muted-foreground">FOOD & BEVERAGES</p>
                          {selectionsList.map(s => (
                            <div key={s.product_id} className="flex justify-between text-sm">
                              <span>{s.product_name} x{s.quantity}</span>
                              <span>GHC {s.subtotal.toFixed(2)}</span>
                            </div>
                          ))}
                        </>
                      )}
                      <Separator className="my-2" />
                      <div className="flex justify-between text-base font-bold" data-testid="booking-total-amount">
                        <span>Total</span>
                        <span className="text-primary">GHC {totalCost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur px-4 py-3 z-30">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex-1">
            {step > 0 && (
              <Button variant="secondary" onClick={goBack} className="rounded-xl">
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
            )}
          </div>
          <div className="text-center">
            {(step >= 2) && (
              <div className="text-sm">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-bold text-primary">GHC {totalCost.toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className="flex-1 flex justify-end">
            {step < 3 ? (
              <Button onClick={goNext} className="rounded-xl">
                Next <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handlePay}
                disabled={isSubmitting || totalCost <= 0}
                className="rounded-xl bg-primary"
                data-testid="paystack-pay-button"
              >
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                  <>Pay with Paystack <CreditCard className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
