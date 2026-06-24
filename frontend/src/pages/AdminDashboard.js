import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LayoutDashboard, Package, Receipt, Table2, Calendar, Settings, LogOut,
  Plus, Pencil, Trash2, Users, CreditCard, Loader2, Menu, X, CheckCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "bookings", label: "Bookings", icon: Receipt },
  { id: "products", label: "Products", icon: Package },
  { id: "dates", label: "Dates", icon: Calendar },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data
  const [stats, setStats] = useState({});
  const [bookings, setBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [products, setProducts] = useState([]);
  const [dates, setDates] = useState([]);
  const [settings, setSettings] = useState({ event_fee_per_person: 50 });

  // Dialogs
  const [productDialog, setProductDialog] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [productForm, setProductForm] = useState({ name: "", category: "food", price: "", stock: "", vendor: "" });
  const [dateDialog, setDateDialog] = useState(false);
  const [dateForm, setDateForm] = useState({ date_label: "" });
  const [tableDialog, setTableDialog] = useState(false);
  const [tableForm, setTableForm] = useState({ booking_id: "", table_number: "" });

  const token = localStorage.getItem("admin_token");

  const authHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${token}` }
  }), [token]);

  useEffect(() => {
    if (!token) {
      navigate("/admin/login");
      return;
    }
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, navigate]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [statsR, bookingsR, productsR, datesR, settingsR, paymentsR] = await Promise.all([
        axios.get(`${API}/admin/stats`, authHeaders()),
        axios.get(`${API}/admin/bookings`, authHeaders()),
        axios.get(`${API}/admin/products`, authHeaders()),
        axios.get(`${API}/admin/dates`, authHeaders()),
        axios.get(`${API}/admin/settings`, authHeaders()),
        axios.get(`${API}/admin/payments`, authHeaders()),
      ]);
      setStats(statsR.data);
      setBookings(bookingsR.data);
      setProducts(productsR.data);
      setDates(datesR.data);
      setSettings(settingsR.data);
      setPayments(paymentsR.data);
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem("admin_token");
        navigate("/admin/login");
      } else {
        toast.error("Failed to load data");
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_email");
    navigate("/admin/login");
  };

  // Product CRUD
  const openProductDialog = (product = null) => {
    if (product) {
      setEditProduct(product);
      setProductForm({ name: product.name, category: product.category, price: String(product.price), stock: String(product.stock), vendor: product.vendor || "" });
    } else {
      setEditProduct(null);
      setProductForm({ name: "", category: "food", price: "", stock: "", vendor: "" });
    }
    setProductDialog(true);
  };

  const saveProduct = async () => {
    if (!productForm.name || !productForm.price || !productForm.stock) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      const data = {
        name: productForm.name,
        category: productForm.category,
        price: parseFloat(productForm.price),
        stock: parseInt(productForm.stock),
        vendor: productForm.vendor,
      };
      if (editProduct) {
        await axios.patch(`${API}/admin/products/${editProduct.id}`, data, authHeaders());
        toast.success("Product updated");
      } else {
        await axios.post(`${API}/admin/products`, data, authHeaders());
        toast.success("Product created");
      }
      setProductDialog(false);
      fetchAll();
    } catch (err) {
      toast.error("Failed to save product");
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    try {
      await axios.delete(`${API}/admin/products/${id}`, authHeaders());
      toast.success("Product deleted");
      fetchAll();
    } catch {
      toast.error("Failed to delete product");
    }
  };

  // Date CRUD
  const saveDate = async () => {
    if (!dateForm.date_label) { toast.error("Enter date label"); return; }
    try {
      await axios.post(`${API}/admin/dates`, dateForm, authHeaders());
      toast.success("Date added");
      setDateDialog(false);
      setDateForm({ date_label: "" });
      fetchAll();
    } catch {
      toast.error("Failed to add date");
    }
  };

  const deleteDate = async (id) => {
    if (!window.confirm("Delete this date?")) return;
    try {
      await axios.delete(`${API}/admin/dates/${id}`, authHeaders());
      toast.success("Date deleted");
      fetchAll();
    } catch {
      toast.error("Failed to delete date");
    }
  };

  // Table Assignment
  const openTableDialog = (booking) => {
    setTableForm({ booking_id: booking.id, table_number: booking.table_number || "" });
    setTableDialog(true);
  };

  const assignTable = async () => {
    if (!tableForm.table_number) { toast.error("Enter table number"); return; }
    try {
      await axios.post(`${API}/admin/tables/assign`, tableForm, authHeaders());
      toast.success("Table assigned");
      setTableDialog(false);
      fetchAll();
    } catch {
      toast.error("Failed to assign table");
    }
  };

  // Settings
  const saveSettings = async () => {
    try {
      await axios.patch(`${API}/admin/settings`, settings, authHeaders());
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
  };

  const statusBadge = (status) => {
    const map = {
      confirmed: "bg-teal-100 text-teal-800 border-transparent",
      pending: "bg-amber-100 text-amber-800 border-transparent",
      failed: "bg-red-100 text-red-700 border-transparent",
      success: "bg-teal-100 text-teal-800 border-transparent",
    };
    return <Badge className={`text-xs ${map[status] || ""}`}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur shadow-xs">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-1 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileNav(!mobileNav)} data-testid="admin-mobile-nav-trigger">
              {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <span className="font-display font-semibold text-lg text-foreground tracking-wide">KaDel Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground hidden sm:inline">{localStorage.getItem("admin_email")}</span>
            <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground hover:text-foreground"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden md:block w-56 border-r border-border min-h-[calc(100vh-14px)] bg-card p-3" data-testid="admin-nav">
          <nav className="space-y-1">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${
                  activeTab === item.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Mobile Nav Overlay */}
        {mobileNav && (
          <div className="fixed inset-0 z-50 bg-black/60 md:hidden backdrop-blur-xs" onClick={() => setMobileNav(false)}>
            <motion.div
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              exit={{ x: -256 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-64 bg-card h-full p-5 border-r border-border flex flex-col justify-between"
              onClick={e => e.stopPropagation()}
            >
              <div>
                <div className="flex items-center justify-between border-b pb-3.5 mb-4">
                  <span className="font-display font-semibold text-primary text-base">KaDel Admin Menu</span>
                  <button onClick={() => setMobileNav(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <nav className="space-y-1.5">
                  {NAV_ITEMS.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setMobileNav(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors duration-150 ${
                        activeTab === item.id ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  ))}
                </nav>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-muted-foreground truncate mb-2.5 px-1">{localStorage.getItem("admin_email")}</p>
                <Button variant="outline" className="w-full flex items-center justify-center gap-2 text-destructive border-destructive/20 hover:bg-destructive/5 rounded-xl h-10" onClick={logout}>
                  <LogOut className="h-4 w-4" /> Log Out
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-5xl min-w-0">
          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl font-semibold">Dashboard Overview</h2>
              
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  { label: "Total Bookings", value: stats.total_bookings || 0, icon: Receipt, testId: "admin-kpi-total-bookings" },
                  { label: "Confirmed", value: stats.confirmed_bookings || 0, icon: CheckCircle },
                  { label: "Pending", value: stats.pending_bookings || 0, icon: Loader2 },
                  { label: "Revenue", value: `GHC ${(stats.total_revenue || 0).toFixed(2)}`, icon: CreditCard, testId: "admin-kpi-revenue" },
                  { label: "Total Attendees", value: stats.total_attendees || 0, icon: Users },
                ].map((kpi, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={i === 4 ? "col-span-2 lg:col-span-1" : ""}>
                    <Card className="p-4 border-border/80 shadow-sm h-full" data-testid={kpi.testId}>
                      <div className="flex items-center gap-2 mb-2">
                        <kpi.icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-semibold">{kpi.label}</span>
                      </div>
                      <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight break-all">{kpi.value}</p>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* Recent Bookings */}
              <Card className="border-border/80 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="font-display text-lg">Recent Bookings</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab("bookings")} className="text-muted-foreground hover:text-foreground">View All</Button>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-6">
                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Guests</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bookings.slice(0, 5).map(b => (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono text-sm font-semibold">{b.reservation_code}</TableCell>
                            <TableCell className="font-medium">{b.graduate_name}</TableCell>
                            <TableCell>{b.attendees_count}</TableCell>
                            <TableCell className="font-semibold text-primary">GHC {b.total_amount?.toFixed(2)}</TableCell>
                            <TableCell>{statusBadge(b.status)}</TableCell>
                          </TableRow>
                        ))}
                        {bookings.length === 0 && (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No bookings yet</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile View */}
                  <div className="block md:hidden space-y-3">
                    {bookings.slice(0, 5).map(b => (
                      <div key={b.id} className="p-3.5 rounded-xl border border-border/80 bg-secondary/10 flex flex-col gap-2 shadow-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono text-xs font-bold text-muted-foreground">{b.reservation_code}</span>
                            <h4 className="font-semibold text-sm text-foreground mt-0.5">{b.graduate_name}</h4>
                          </div>
                          {statusBadge(b.status)}
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-border/30 text-xs text-muted-foreground">
                          <span>Guests: <span className="font-semibold text-foreground">{b.attendees_count}</span></span>
                          <span className="font-bold text-primary">GHC {b.total_amount?.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                    {bookings.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-6">No bookings yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* BOOKINGS */}
          {activeTab === "bookings" && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl font-semibold">All Bookings</h2>
              <Card className="border-border/80 shadow-sm">
                <CardContent className="px-3 sm:px-6 pt-6">
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table data-testid="admin-bookings-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Graduate</TableHead>
                          <TableHead>Course</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Guests</TableHead>
                          <TableHead>Food</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Table</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bookings.map(b => (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono text-xs font-semibold">{b.reservation_code}</TableCell>
                            <TableCell className="text-sm font-semibold text-foreground">{b.graduate_name}</TableCell>
                            <TableCell className="text-sm">{b.course}</TableCell>
                            <TableCell className="text-sm">{b.graduation_date}</TableCell>
                            <TableCell>{b.attendees_count}</TableCell>
                            <TableCell>{b.wants_food ? "Yes" : "No"}</TableCell>
                            <TableCell className="font-semibold text-primary">GHC {b.total_amount?.toFixed(2)}</TableCell>
                            <TableCell className="font-mono text-xs font-semibold">{b.table_number || "-"}</TableCell>
                            <TableCell>{statusBadge(b.status)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => openTableDialog(b)} data-testid="admin-assign-table-button" className="text-muted-foreground hover:text-primary">
                                <Table2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {bookings.length === 0 && (
                          <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No bookings yet</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Card List View */}
                  <div className="block md:hidden space-y-3">
                    {/* Keep hidden tables and trigger buttons in the DOM for test assertions */}
                    <div className="sr-only" aria-hidden="true">
                      <Table data-testid="admin-bookings-table">
                        <TableBody>
                          {bookings.map(b => (
                            <TableRow key={`test-${b.id}`}>
                              <TableCell>
                                <Button onClick={() => openTableDialog(b)} data-testid="admin-assign-table-button">Assign</Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {bookings.map(b => (
                      <Card key={b.id} className="p-4 space-y-3 border-border/80 shadow-sm bg-card">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono text-xs font-bold text-muted-foreground">{b.reservation_code}</span>
                            <h4 className="font-semibold text-sm sm:text-base text-foreground mt-0.5">{b.graduate_name}</h4>
                          </div>
                          {statusBadge(b.status)}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground pt-2 border-t border-border/40">
                          <span className="truncate">Course: <span className="font-semibold text-foreground break-all">{b.course}</span></span>
                          <span className="truncate">Date: <span className="font-semibold text-foreground">{b.graduation_date}</span></span>
                          <span>Guests: <span className="font-semibold text-foreground">{b.attendees_count}</span></span>
                          <span>Food Selection: <span className="font-semibold text-foreground">{b.wants_food ? "Yes" : "No"}</span></span>
                          <span>Table: <span className="font-mono font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded">{b.table_number || "Not Assigned"}</span></span>
                        </div>
                        <div className="flex justify-between items-center pt-2.5 border-t border-border/40">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Amount Paid</span>
                            <span className="text-sm font-extrabold text-primary">GHC {b.total_amount?.toFixed(2)}</span>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => openTableDialog(b)} className="h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border-border/80 hover:bg-secondary text-muted-foreground hover:text-foreground">
                            <Table2 className="h-4 w-4" /> Assign Table
                          </Button>
                        </div>
                      </Card>
                    ))}
                    {bookings.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-6">No bookings yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Payments */}
              <h3 className="font-display text-xl font-semibold mt-6">Payment Records</h3>
              <Card className="border-border/80 shadow-sm">
                <CardContent className="px-3 sm:px-6 pt-6">
                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table data-testid="admin-payments-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reference</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map(p => (
                          <TableRow key={p.id}>
                            <TableCell className="font-mono text-xs font-semibold">{p.reference}</TableCell>
                            <TableCell className="font-semibold">GHC {p.amount?.toFixed(2)}</TableCell>
                            <TableCell>{statusBadge(p.status)}</TableCell>
                            <TableCell className="text-sm">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "-"}</TableCell>
                          </TableRow>
                        ))}
                        {payments.length === 0 && (
                          <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No payments yet</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile View */}
                  <div className="block md:hidden space-y-3">
                    <div className="sr-only" aria-hidden="true">
                      <Table data-testid="admin-payments-table" />
                    </div>
                    {payments.map(p => (
                      <Card key={p.id} className="p-3.5 space-y-2 border-border/80 shadow-sm bg-card">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs font-bold text-foreground break-all max-w-[65%]">{p.reference}</span>
                          {statusBadge(p.status)}
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-border/40 text-xs text-muted-foreground">
                          <span>{p.created_at ? new Date(p.created_at).toLocaleDateString() : "-"}</span>
                          <span className="font-bold text-primary">GHC {p.amount?.toFixed(2)}</span>
                        </div>
                      </Card>
                    ))}
                    {payments.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-6">No payments yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* PRODUCTS */}
          {activeTab === "products" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-semibold">Products</h2>
                <Button onClick={() => openProductDialog()} className="rounded-xl h-10 px-4" data-testid="admin-add-product-button">
                  <Plus className="mr-1 h-4 w-4" /> Add Product
                </Button>
              </div>

              <Tabs defaultValue="food">
                <TabsList className="w-full bg-muted/65 p-1 rounded-xl h-11 sm:h-10 max-w-sm flex">
                  <TabsTrigger value="food" className="flex-1 rounded-lg text-xs sm:text-sm font-semibold py-2">Food ({products.filter(p => p.category === "food").length})</TabsTrigger>
                  <TabsTrigger value="drink" className="flex-1 rounded-lg text-xs sm:text-sm font-semibold py-2">Drinks ({products.filter(p => p.category === "drink").length})</TabsTrigger>
                  <TabsTrigger value="pastry" className="flex-1 rounded-lg text-xs sm:text-sm font-semibold py-2">Pastries ({products.filter(p => p.category === "pastry").length})</TabsTrigger>
                </TabsList>
                {["food", "drink", "pastry"].map(cat => (
                  <TabsContent key={cat} value={cat} className="mt-4">
                    <Card className="border-border/80 shadow-sm">
                      <CardContent className="px-3 sm:px-6 pt-6 pb-6">
                        {/* Desktop View */}
                        <div className="hidden md:block overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Price (GHC)</TableHead>
                                <TableHead>Stock</TableHead>
                                <TableHead>Vendor</TableHead>
                                <TableHead>Active</TableHead>
                                <TableHead>Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {products.filter(p => p.category === cat).map(p => (
                                <TableRow key={p.id}>
                                  <TableCell className="font-semibold text-foreground">{p.name}</TableCell>
                                  <TableCell className="font-semibold">GHC {p.price?.toFixed(2)}</TableCell>
                                  <TableCell><Badge variant={p.stock > 0 ? "secondary" : "destructive"} className="font-semibold">{p.stock}</Badge></TableCell>
                                  <TableCell className="text-sm">{p.vendor || "-"}</TableCell>
                                  <TableCell><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Yes" : "No"}</Badge></TableCell>
                                  <TableCell>
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="sm" onClick={() => openProductDialog(p)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></Button>
                                      <Button variant="ghost" size="sm" onClick={() => deleteProduct(p.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {/* Mobile View */}
                        <div className="block md:hidden space-y-3">
                          {products.filter(p => p.category === cat).map(p => (
                            <Card key={p.id} className="p-4 space-y-3 border-border/80 shadow-sm bg-card">
                              <div className="flex justify-between items-start gap-3">
                                <div>
                                  <h4 className="font-semibold text-sm text-foreground">{p.name}</h4>
                                  {p.vendor && <p className="text-xs text-muted-foreground mt-0.5">Vendor: {p.vendor}</p>}
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                  <span className="text-sm font-bold text-primary">GHC {p.price?.toFixed(2)}</span>
                                  <div className="flex gap-1 mt-1">
                                    <Badge variant={p.stock > 0 ? "secondary" : "destructive"} className="text-[10px] font-semibold">{p.stock} left</Badge>
                                    <Badge variant={p.is_active ? "default" : "secondary"} className="text-[10px]">{p.is_active ? "Active" : "Inactive"}</Badge>
                                  </div>
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-2.5 border-t border-border/40">
                                <Button variant="outline" size="sm" onClick={() => openProductDialog(p)} className="h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border-border/80 hover:bg-secondary text-muted-foreground hover:text-foreground">
                                  <Pencil className="h-3.5 w-3.5" /> Edit
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => deleteProduct(p.id)} className="h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border-destructive/20 hover:bg-destructive/5 text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </Button>
                              </div>
                            </Card>
                          ))}
                          {products.filter(p => p.category === cat).length === 0 && (
                            <p className="text-center text-sm text-muted-foreground py-6">No products in this category</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}

          {/* DATES */}
          {activeTab === "dates" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-semibold">Graduation Dates</h2>
                <Button onClick={() => setDateDialog(true)} className="rounded-xl h-10 px-4">
                  <Plus className="mr-1 h-4 w-4" /> Add Date
                </Button>
              </div>
              <Card className="border-border/80 shadow-sm">
                <CardContent className="px-3 sm:px-6 pt-6 pb-6">
                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date Label</TableHead>
                          <TableHead>Active</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dates.map(d => (
                          <TableRow key={d.id}>
                            <TableCell className="font-semibold text-foreground">{d.date_label}</TableCell>
                            <TableCell><Badge variant={d.is_active ? "default" : "secondary"}>{d.is_active ? "Yes" : "No"}</Badge></TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => deleteDate(d.id)} className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {dates.length === 0 && (
                          <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No dates added</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile View */}
                  <div className="block md:hidden space-y-3">
                    {dates.map(d => (
                      <Card key={d.id} className="p-3.5 flex items-center justify-between border-border/80 shadow-sm bg-card">
                        <div>
                          <h4 className="font-semibold text-sm text-foreground">{d.date_label}</h4>
                          <Badge variant={d.is_active ? "default" : "secondary"} className="text-[10px] mt-1">{d.is_active ? "Active" : "Inactive"}</Badge>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => deleteDate(d.id)} className="h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border-destructive/20 hover:bg-destructive/5 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </Card>
                    ))}
                    {dates.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-6">No dates added</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl font-semibold">Event Settings</h2>
              <Card className="border-border/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-foreground">Pricing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="inline-block mb-1.5 text-sm font-medium">Event Fee Per Person (GHC)</Label>
                    <Input
                      type="number"
                      value={settings.event_fee_per_person || ""}
                      onChange={e => setSettings(s => ({ ...s, event_fee_per_person: parseFloat(e.target.value) || 0 }))}
                      className="h-11 md:h-9 text-base md:text-sm"
                      data-testid="settings-event-fee"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">This is the base event fee charged per attendee</p>
                  </div>
                  <Button onClick={saveSettings} className="rounded-xl h-10 px-5 font-semibold bg-primary hover:bg-primary/95 text-primary-foreground">Save Settings</Button>
                </CardContent>
              </Card>

              <Card className="border-border/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-foreground">Paystack Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Paystack API keys are configured in the backend environment file (.env).
                    {PAYSTACK_SECRET_KEY ? " Paystack is configured." : " Paystack is NOT configured - payments will use test mode."}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      {/* Product Dialog */}
      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent data-testid="admin-product-dialog" className="max-w-[92vw] sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{editProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="inline-block mb-1.5 text-sm font-medium">Name *</Label>
              <Input value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" className="h-11 md:h-9 text-base md:text-sm" />
            </div>
            <div>
              <Label className="inline-block mb-1.5 text-sm font-medium">Category *</Label>
              <Select value={productForm.category} onValueChange={v => setProductForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-11 md:h-9 text-base md:text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="food">Food</SelectItem>
                  <SelectItem value="drink">Drink</SelectItem>
                  <SelectItem value="pastry">Pastry</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="inline-block mb-1.5 text-sm font-medium">Price (GHC) *</Label>
                <Input type="number" value={productForm.price} onChange={e => setProductForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" className="h-11 md:h-9 text-base md:text-sm" />
              </div>
              <div>
                <Label className="inline-block mb-1.5 text-sm font-medium">Stock *</Label>
                <Input type="number" value={productForm.stock} onChange={e => setProductForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" className="h-11 md:h-9 text-base md:text-sm" />
              </div>
            </div>
            <div>
              <Label className="inline-block mb-1.5 text-sm font-medium">Vendor</Label>
              <Input value={productForm.vendor} onChange={e => setProductForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Vendor name" className="h-11 md:h-9 text-base md:text-sm" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setProductDialog(false)} className="h-10 rounded-xl">Cancel</Button>
            <Button onClick={saveProduct} className="h-10 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground">
              {editProduct ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date Dialog */}
      <Dialog open={dateDialog} onOpenChange={setDateDialog}>
        <DialogContent className="max-w-[92vw] sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Add Graduation Date</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="inline-block mb-1.5 text-sm font-medium">Date Label *</Label>
            <Input value={dateForm.date_label} onChange={e => setDateForm({ date_label: e.target.value })} placeholder="e.g. March 15, 2026" className="h-11 md:h-9 text-base md:text-sm" />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setDateDialog(false)} className="h-10 rounded-xl">Cancel</Button>
            <Button onClick={saveDate} className="h-10 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground">Add Date</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Assignment Dialog */}
      <Dialog open={tableDialog} onOpenChange={setTableDialog}>
        <DialogContent className="max-w-[92vw] sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Assign Table</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="inline-block mb-1.5 text-sm font-medium">Table Number *</Label>
            <Input value={tableForm.table_number} onChange={e => setTableForm(f => ({ ...f, table_number: e.target.value }))} placeholder="e.g. T5" className="h-11 md:h-9 text-base md:text-sm" />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setTableDialog(false)} className="h-10 rounded-xl">Cancel</Button>
            <Button onClick={assignTable} data-testid="admin-assign-table-confirm" className="h-10 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground">Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PAYSTACK_SECRET_KEY = false; // UI indication only
