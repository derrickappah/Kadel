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
  LayoutDashboard, Package, Receipt, Table2, Calendar, Settings, LogOut, GraduationCap,
  Plus, Pencil, Trash2, Users, CreditCard, Loader2, Menu, X
} from "lucide-react";

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
      <div className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-1" onClick={() => setMobileNav(!mobileNav)} data-testid="admin-mobile-nav-trigger">
              {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <GraduationCap className="h-6 w-6 text-primary" />
            <span className="font-display font-semibold">GradTable Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">{localStorage.getItem("admin_email")}</span>
            <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden md:block w-56 border-r border-border min-h-[calc(100vh-56px)] bg-card p-3" data-testid="admin-nav">
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
          <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setMobileNav(false)}>
            <motion.div
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              className="w-64 bg-card h-full p-4 border-r border-border"
              onClick={e => e.stopPropagation()}
            >
              <nav className="space-y-1 mt-4">
                {NAV_ITEMS.map(item => (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setMobileNav(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                      activeTab === item.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                ))}
              </nav>
            </motion.div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-5xl">
          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl font-semibold">Dashboard Overview</h2>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  { label: "Total Bookings", value: stats.total_bookings || 0, icon: Receipt, testId: "admin-kpi-total-bookings" },
                  { label: "Confirmed", value: stats.confirmed_bookings || 0, icon: Receipt },
                  { label: "Pending", value: stats.pending_bookings || 0, icon: Receipt },
                  { label: "Revenue", value: `GHC ${(stats.total_revenue || 0).toFixed(2)}`, icon: CreditCard, testId: "admin-kpi-revenue" },
                  { label: "Total Attendees", value: stats.total_attendees || 0, icon: Users },
                ].map((kpi, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card className="p-4" data-testid={kpi.testId}>
                      <div className="flex items-center gap-2 mb-2">
                        <kpi.icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{kpi.label}</span>
                      </div>
                      <p className="text-xl font-bold">{kpi.value}</p>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* Recent Bookings */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="font-display text-lg">Recent Bookings</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab("bookings")}>View All</Button>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
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
                            <TableCell className="font-mono text-sm">{b.reservation_code}</TableCell>
                            <TableCell>{b.graduate_name}</TableCell>
                            <TableCell>{b.attendees_count}</TableCell>
                            <TableCell>GHC {b.total_amount?.toFixed(2)}</TableCell>
                            <TableCell>{statusBadge(b.status)}</TableCell>
                          </TableRow>
                        ))}
                        {bookings.length === 0 && (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No bookings yet</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* BOOKINGS */}
          {activeTab === "bookings" && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl font-semibold">All Bookings</h2>
              <Card>
                <CardContent className="pt-6">
                  <div className="overflow-x-auto">
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
                            <TableCell className="font-mono text-xs">{b.reservation_code}</TableCell>
                            <TableCell className="text-sm">{b.graduate_name}</TableCell>
                            <TableCell className="text-sm">{b.course}</TableCell>
                            <TableCell className="text-sm">{b.graduation_date}</TableCell>
                            <TableCell>{b.attendees_count}</TableCell>
                            <TableCell>{b.wants_food ? "Yes" : "No"}</TableCell>
                            <TableCell className="font-medium">GHC {b.total_amount?.toFixed(2)}</TableCell>
                            <TableCell>{b.table_number || "-"}</TableCell>
                            <TableCell>{statusBadge(b.status)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => openTableDialog(b)} data-testid="admin-assign-table-button">
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
                </CardContent>
              </Card>

              {/* Payments */}
              <h3 className="font-display text-xl font-semibold mt-6">Payment Records</h3>
              <Card>
                <CardContent className="pt-6">
                  <div className="overflow-x-auto">
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
                            <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                            <TableCell>GHC {p.amount?.toFixed(2)}</TableCell>
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
                </CardContent>
              </Card>
            </div>
          )}

          {/* PRODUCTS */}
          {activeTab === "products" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-semibold">Products</h2>
                <Button onClick={() => openProductDialog()} className="rounded-xl" data-testid="admin-add-product-button">
                  <Plus className="mr-1 h-4 w-4" /> Add Product
                </Button>
              </div>

              <Tabs defaultValue="food">
                <TabsList>
                  <TabsTrigger value="food">Food ({products.filter(p => p.category === "food").length})</TabsTrigger>
                  <TabsTrigger value="drink">Drinks ({products.filter(p => p.category === "drink").length})</TabsTrigger>
                  <TabsTrigger value="pastry">Pastries ({products.filter(p => p.category === "pastry").length})</TabsTrigger>
                </TabsList>
                {["food", "drink", "pastry"].map(cat => (
                  <TabsContent key={cat} value={cat}>
                    <Card>
                      <CardContent className="pt-6">
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
                                <TableCell className="font-medium">{p.name}</TableCell>
                                <TableCell>{p.price?.toFixed(2)}</TableCell>
                                <TableCell><Badge variant={p.stock > 0 ? "secondary" : "destructive"}>{p.stock}</Badge></TableCell>
                                <TableCell className="text-sm">{p.vendor || "-"}</TableCell>
                                <TableCell><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Yes" : "No"}</Badge></TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => openProductDialog(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => deleteProduct(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
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
                <Button onClick={() => setDateDialog(true)} className="rounded-xl">
                  <Plus className="mr-1 h-4 w-4" /> Add Date
                </Button>
              </div>
              <Card>
                <CardContent className="pt-6">
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
                          <TableCell className="font-medium">{d.date_label}</TableCell>
                          <TableCell><Badge variant={d.is_active ? "default" : "secondary"}>{d.is_active ? "Yes" : "No"}</Badge></TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => deleteDate(d.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {dates.length === 0 && (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No dates added</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl font-semibold">Event Settings</h2>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pricing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Event Fee Per Person (GHC)</Label>
                    <Input
                      type="number"
                      value={settings.event_fee_per_person || ""}
                      onChange={e => setSettings(s => ({ ...s, event_fee_per_person: parseFloat(e.target.value) || 0 }))}
                      data-testid="settings-event-fee"
                    />
                    <p className="text-xs text-muted-foreground mt-1">This is the base event fee charged per attendee</p>
                  </div>
                  <Button onClick={saveSettings} className="rounded-xl">Save Settings</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Paystack Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
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
        <DialogContent data-testid="admin-product-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">{editProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" />
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={productForm.category} onValueChange={v => setProductForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="food">Food</SelectItem>
                  <SelectItem value="drink">Drink</SelectItem>
                  <SelectItem value="pastry">Pastry</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price (GHC) *</Label>
                <Input type="number" value={productForm.price} onChange={e => setProductForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>Stock *</Label>
                <Input type="number" value={productForm.stock} onChange={e => setProductForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div>
              <Label>Vendor</Label>
              <Input value={productForm.vendor} onChange={e => setProductForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Vendor name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setProductDialog(false)}>Cancel</Button>
            <Button onClick={saveProduct}>{editProduct ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date Dialog */}
      <Dialog open={dateDialog} onOpenChange={setDateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Add Graduation Date</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Date Label *</Label>
            <Input value={dateForm.date_label} onChange={e => setDateForm({ date_label: e.target.value })} placeholder="e.g. March 15, 2026" />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDateDialog(false)}>Cancel</Button>
            <Button onClick={saveDate}>Add Date</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Assignment Dialog */}
      <Dialog open={tableDialog} onOpenChange={setTableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Assign Table</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Table Number *</Label>
            <Input value={tableForm.table_number} onChange={e => setTableForm(f => ({ ...f, table_number: e.target.value }))} placeholder="e.g. T5" />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTableDialog(false)}>Cancel</Button>
            <Button onClick={assignTable} data-testid="admin-assign-table-confirm">Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PAYSTACK_SECRET_KEY = false; // UI indication only
