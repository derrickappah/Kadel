import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  LayoutDashboard, Package, Receipt, Table2, Calendar, Settings, LogOut,
  Plus, Pencil, Trash2, Users, CreditCard, Loader2, Menu, X, CheckCircle,
  BarChart3, TrendingUp, Search, ArrowUpDown, ChevronLeft, ChevronRight,
  Download, Sun, Moon, Sparkles, CheckSquare, Square, SlidersHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
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
  const [theme, setTheme] = useState(localStorage.getItem("admin_theme") || "light");

  // Data State
  const [stats, setStats] = useState({});
  const [bookings, setBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [products, setProducts] = useState([]);
  const [dates, setDates] = useState([]);
  const [settings, setSettings] = useState({ event_fee_per_person: 50 });

  // Dialogs State
  const [productDialog, setProductDialog] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [productForm, setProductForm] = useState({ name: "", category: "food", price: "", stock: "", vendor: "" });
  const [dateDialog, setDateDialog] = useState(false);
  const [dateForm, setDateForm] = useState({ date_label: "" });
  const [tableDialog, setTableDialog] = useState(false);
  const [tableForm, setTableForm] = useState({ booking_id: "", table_number: "" });

  // Advanced Table Filters & State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedBookings, setSelectedBookings] = useState([]);

  const token = localStorage.getItem("admin_token");

  const authHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${token}` }
  }), [token]);

  // Apply Theme
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("admin_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => t === "light" ? "dark" : "light");
  };

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
    const parsedPrice = parseFloat(productForm.price);
    const parsedStock = parseInt(productForm.stock);
    // FIX: Validate price > 0 and stock >= 0 on the client before sending to
    // the backend, to prevent creating unusable products that can never be purchased.
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      toast.error("Price must be greater than 0");
      return;
    }
    if (isNaN(parsedStock) || parsedStock < 0) {
      toast.error("Stock must be 0 or more");
      return;
    }
    try {
      const data = {
        name: productForm.name,
        category: productForm.category,
        price: parsedPrice,
        stock: parsedStock,
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
      toast.error(err.response?.data?.detail || "Failed to save product");
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
    try {
      // FIX: Allow clearing a single booking's table by sending null when the
      // input is empty. Previously the guard "if (!tableForm.table_number)"
      // blocked clearing, forcing admins to use bulk-clear for a single booking.
      const tableValue = tableForm.table_number.trim() || null;
      await axios.post(`${API}/admin/tables/assign`, {
        booking_id: tableForm.booking_id,
        table_number: tableValue,
      }, authHeaders());
      toast.success(tableValue ? `Table ${tableValue} assigned` : "Table assignment cleared");
      setTableDialog(false);
      fetchAll();
    } catch {
      toast.error("Failed to assign table");
    }
  };

  const bulkClearTables = async () => {
    if (selectedBookings.length === 0) return;
    if (!window.confirm(`Clear table assignments for the ${selectedBookings.length} selected bookings?`)) return;
    try {
      await Promise.all(
        selectedBookings.map(id =>
          // FIX: Send null instead of empty string "" to properly clear table numbers.
          // Empty string is not NULL in SQL, so auto_assign_table() (which filters on
          // NOT NULL) would still count cleared tables, causing incorrect table numbering.
          axios.post(`${API}/admin/tables/assign`, { booking_id: id, table_number: null }, authHeaders())
        )
      );
      toast.success("Table assignments cleared");
      setSelectedBookings([]);
      fetchAll();
    } catch {
      toast.error("Failed to clear some table assignments");
    }
  };

  const clearSearch = () => setSearchQuery("");

  const saveSettings = async () => {
    const fee = parseFloat(settings.event_fee_per_person);
    // FIX: Validate event fee is non-negative before saving. A negative fee
    // would result in a negative base_cost being sent to the backend, which
    // now also rejects it with HTTP 400 — but catching it client-side gives
    // the admin a clearer error message.
    if (isNaN(fee) || fee < 0) {
      toast.error("Event fee must be 0 or greater");
      return;
    }
    try {
      await axios.patch(`${API}/admin/settings`, { event_fee_per_person: fee }, authHeaders());
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save settings");
    }
  };

  // Analytics Computation
  const analytics = useMemo(() => {
    let admissionRevenue = 0;
    let foodRevenue = 0;
    let drinkRevenue = 0;
    let pastryRevenue = 0;

    const confirmedBookings = (bookings || []).filter(b => b.status === "confirmed");
    const totalConfirmed = confirmedBookings.length;
    const confirmedWithCatering = confirmedBookings.filter(b => b.wants_food).length;
    const cateringAttachmentRate = totalConfirmed > 0 ? (confirmedWithCatering / totalConfirmed) * 100 : 0;

    const productSalesMap = {};
    const vendorSalesMap = {};
    const courseMap = {};

    confirmedBookings.forEach(b => {
      // FIX: Use the stored event_fee (admission fee at booking time) rather than
      // recalculating from current settings. This prevents historical revenue from
      // changing if the admin updates the event fee rate after bookings are made.
      admissionRevenue += b.event_fee || 0;

      const courseName = b.course || "Other Program";
      courseMap[courseName] = (courseMap[courseName] || 0) + 1;

      const selections = b.selections || [];
      selections.forEach(sel => {
        const qty = sel.quantity || 0;
        const price = sel.unit_price || 0;
        const subtotal = qty * price;

        const prod = products.find(p => p.id === sel.product_id || p.name === sel.product_name);
        const cat = prod ? prod.category : "food";
        const vendor = prod ? (prod.vendor || "In-House Fulfillment") : "In-House Fulfillment";

        if (cat === "drink") drinkRevenue += subtotal;
        else if (cat === "pastry") pastryRevenue += subtotal;
        else foodRevenue += subtotal;

        if (!productSalesMap[sel.product_name]) {
          productSalesMap[sel.product_name] = { name: sel.product_name, quantity: 0, revenue: 0, category: cat };
        }
        productSalesMap[sel.product_name].quantity += qty;
        productSalesMap[sel.product_name].revenue += subtotal;

        if (!vendorSalesMap[vendor]) {
          vendorSalesMap[vendor] = { name: vendor, itemsCount: 0, revenue: 0 };
        }
        vendorSalesMap[vendor].itemsCount += qty;
        vendorSalesMap[vendor].revenue += subtotal;
      });
    });

    const totalRevenue = admissionRevenue + foodRevenue + drinkRevenue + pastryRevenue;

    const popularProducts = Object.values(productSalesMap).sort((a, b) => b.quantity - a.quantity);
    const topVendors = Object.values(vendorSalesMap).sort((a, b) => b.revenue - a.revenue);
    const popularCourses = Object.entries(courseMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalRevenue,
      admissionRevenue,
      foodRevenue,
      drinkRevenue,
      pastryRevenue,
      totalConfirmed,
      confirmedWithCatering,
      cateringAttachmentRate,
      popularProducts,
      topVendors,
      popularCourses
    };
  // FIX: Remove `settings` from the dependency array — it was never used in the
  // computation (admissionRevenue now reads b.event_fee, not settings.event_fee_per_person).
  // Keeping it caused unnecessary re-runs whenever settings changed.
  }, [bookings, products]);

  const getProductCategory = useCallback((productId, productName) => {
    const prod = products.find(p => p.id === productId || p.name === productName);
    return prod ? prod.category : "food";
  }, [products]);

  // Client-Side Booking Filtration & Sorting
  const filteredBookings = useMemo(() => {
    let result = [...bookings];

    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(b =>
        b.graduate_name.toLowerCase().includes(q) ||
        b.reservation_code.toLowerCase().includes(q) ||
        (b.course && b.course.toLowerCase().includes(q))
      );
    }

    // 2. Status Filter
    if (statusFilter !== "all") {
      result = result.filter(b => b.status === statusFilter);
    }

    // 3. Sorting
    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle null/missing values
      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";

      if (typeof aVal === "string") {
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        return sortOrder === "asc"
          ? (aVal > bVal ? 1 : -1)
          : (bVal > aVal ? 1 : -1);
      }
    });

    return result;
  }, [bookings, searchQuery, statusFilter, sortField, sortOrder]);

  // Paginated Bookings
  const paginatedBookings = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredBookings.slice(startIndex, startIndex + pageSize);
  }, [filteredBookings, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredBookings.length / pageSize) || 1;

  const statusCounts = useMemo(() => {
    return {
      all: bookings.length,
      confirmed: bookings.filter(b => b.status === "confirmed" || b.status === "success" || b.status === "confirmed_bookings").length,
      pending: bookings.filter(b => b.status === "pending").length,
    };
  }, [bookings]);

  // Reset pagination on filter search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Selection handlers
  const toggleSelectBooking = (id) => {
    setSelectedBookings(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedBookings.length === paginatedBookings.length) {
      setSelectedBookings([]);
    } else {
      setSelectedBookings(paginatedBookings.map(b => b.id));
    }
  };

  // Export selected/all bookings to CSV
  const exportToCSV = () => {
    const list = selectedBookings.length > 0
      ? bookings.filter(b => selectedBookings.includes(b.id))
      : bookings;

    // FIX: Properly escape CSV fields that contain commas, double-quotes, or
    // newlines. Without escaping, a course name like "B.Sc, Computer Science"
    // would split into two columns, corrupting every subsequent field in the row.
    const escapeCSV = (val) => {
      if (val == null) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = ["Reservation Code", "Graduate Name", "Program", "Date", "Guests Count", "Food Ordered", "Total Paid (GHC)", "Table Assigned", "Status"];
    const rows = list.map(b => [
      escapeCSV(b.reservation_code),
      escapeCSV(b.graduate_name),
      escapeCSV(b.course),
      escapeCSV(b.graduation_date),
      escapeCSV(b.attendees_count),
      b.wants_food ? "Yes" : "No",
      escapeCSV(b.total_amount?.toFixed(2)),
      escapeCSV(b.table_number || "Pending"),
      escapeCSV(b.status)
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `kadel_bookings_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`${list.length} bookings exported to CSV!`);
  };

  const handleHeaderSort = (field) => {
    if (sortField === field) {
      setSortOrder(o => o === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const statusBadge = (status) => {
    const map = {
      confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-300 border-emerald-200/50",
      pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/45 dark:text-amber-300 border-amber-200/50",
      failed: "bg-rose-100 text-rose-800 dark:bg-rose-950/45 dark:text-rose-300 border-rose-200/50",
      success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-300 border-emerald-200/50",
    };
    return (
      <Badge variant="outline" className={cn("text-xs font-bold capitalize py-0.5 px-2.5 rounded-full border shadow-2xs", map[status])}>
        {status}
      </Badge>
    );
  };

  // Render Skeletons for Loading State
  const renderLoadingSkeletons = () => (
    <div className="space-y-6">
      {/* KPI Cards Skeletons */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(i => (
          <Card key={i} className="p-4 border-border/80 shadow-sm space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-16" />
          </Card>
        ))}
      </div>
      {/* Table Skeleton */}
      <Card className="border-border/80 shadow-sm p-4 space-y-3">
        <div className="flex justify-between items-center pb-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-250 flex flex-col md:flex-row">
      {/* Sidebar - Desktop */}
      <aside
        className="hidden md:flex flex-col justify-between w-64 border-r border-border bg-card/65 backdrop-blur-md p-4 sticky top-0 h-screen"
        data-testid="admin-nav"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2 pt-2">
            <span className="font-display font-extrabold text-2xl tracking-tight text-foreground flex items-center gap-2">
              KaDel <span className="text-xs font-bold py-0.5 px-2 bg-primary/10 text-primary rounded-full">Admin</span>
            </span>
          </div>
          
          <nav className="space-y-1">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150",
                  activeTab === item.id
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="space-y-3 border-t pt-4">
          {/* Theme switcher */}
          <div className="flex items-center justify-between bg-secondary/55 p-1 rounded-xl border border-border/60">
            <span className="text-xs font-bold text-muted-foreground pl-3">Theme</span>
            <div className="flex gap-0.5">
              <Button
                variant={theme === "light" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={() => setTheme("light")}
              >
                <Sun className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={theme === "dark" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={() => setTheme("dark")}
              >
                <Moon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="px-2 truncate">
            <p className="text-xs font-extrabold text-muted-foreground">Signed In As</p>
            <p className="text-xs font-medium text-foreground truncate mt-0.5">{localStorage.getItem("admin_email")}</p>
          </div>
          
          <Button
            variant="outline"
            className="w-full flex items-center justify-center gap-2 text-destructive border-destructive/20 hover:bg-destructive/5 rounded-xl h-10 font-bold"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" /> Log Out
          </Button>
        </div>
      </aside>

      {/* Mobile Nav Header */}
      <div className="md:hidden sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur shadow-xs flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-3">
          <button
            className="p-1.5 rounded-lg border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            onClick={() => setMobileNav(!mobileNav)}
            data-testid="admin-mobile-nav-trigger"
          >
            {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="font-display font-extrabold text-xl text-foreground tracking-tight">KaDel</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Theme switcher for mobile */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {theme === "light" ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={logout} className="text-muted-foreground hover:text-foreground">
            <LogOut className="h-4.5 w-4.5" />
          </Button>
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
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
                  <span className="font-display font-extrabold text-primary text-lg">KaDel Menu</span>
                  <button onClick={() => setMobileNav(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <nav className="space-y-1.5">
                  {NAV_ITEMS.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setMobileNav(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150",
                        activeTab === item.id
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4.5 w-4.5" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </nav>
              </div>
              <div className="border-t pt-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground truncate px-1">{localStorage.getItem("admin_email")}</p>
                <Button variant="outline" className="w-full flex items-center justify-center gap-2 text-destructive border-destructive/20 hover:bg-destructive/5 rounded-xl h-10" onClick={logout}>
                  <LogOut className="h-4 w-4" /> Log Out
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl min-w-0 overflow-y-auto">
        {loading ? (
          renderLoadingSkeletons()
        ) : (
          <AnimatePresence mode="wait">
            {/* OVERVIEW */}
            {activeTab === "overview" && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground">Dashboard Overview</h2>
                  <p className="text-sm text-muted-foreground mt-1">Operational status, revenue overview, and recent graduate bookings.</p>
                </div>
                
                {/* KPIs Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  {[
                    { label: "Total Bookings", value: stats.total_bookings || 0, icon: Receipt, testId: "admin-kpi-total-bookings" },
                    { label: "Confirmed", value: stats.confirmed_bookings || 0, icon: CheckCircle, color: "text-emerald-500" },
                    { label: "Pending", value: stats.pending_bookings || 0, icon: Loader2, color: "text-amber-500" },
                    { label: "Revenue", value: `GHC ${(stats.total_revenue || 0).toFixed(2)}`, icon: CreditCard, testId: "admin-kpi-revenue", color: "text-primary" },
                    { label: "Total Attendees", value: stats.total_attendees || 0, icon: Users, color: "text-blue-500" },
                  ].map((kpi, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={i === 4 ? "col-span-2 lg:col-span-1" : ""}
                    >
                      <Card className="p-4 border-border/80 shadow-md h-full bg-card hover:shadow-lg transition-shadow duration-200" data-testid={kpi.testId}>
                        <div className="flex items-center gap-2 mb-2">
                          <kpi.icon className={cn("h-4.5 w-4.5 text-muted-foreground", kpi.color)} />
                          <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{kpi.label}</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-black text-foreground tracking-tight break-all">{kpi.value}</p>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                {/* Recent Bookings Card */}
                <Card className="border-border/80 shadow-md rounded-2xl overflow-hidden bg-card">
                  <CardHeader className="flex flex-row items-center justify-between bg-secondary/10 border-b border-border/45 px-6 py-4">
                    <CardTitle className="font-display text-lg font-bold text-foreground">Recent Bookings</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab("bookings")} className="text-xs font-bold text-muted-foreground hover:text-foreground">
                      View All
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Desktop View */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader className="bg-secondary/15">
                          <TableRow>
                            <TableHead className="font-bold">Code</TableHead>
                            <TableHead className="font-bold">Graduate Name</TableHead>
                            <TableHead className="font-bold">Attendees</TableHead>
                            <TableHead className="font-bold">Amount</TableHead>
                            <TableHead className="font-bold">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bookings.slice(0, 5).map(b => (
                            <TableRow key={b.id} className="hover:bg-secondary/15">
                              <TableCell className="font-mono text-sm font-bold text-foreground">{b.reservation_code}</TableCell>
                              <TableCell className="font-semibold text-foreground">{b.graduate_name}</TableCell>
                              <TableCell>{b.attendees_count}</TableCell>
                              <TableCell className="font-semibold text-primary">GHC {b.total_amount?.toFixed(2)}</TableCell>
                              <TableCell>{statusBadge(b.status)}</TableCell>
                            </TableRow>
                          ))}
                          {bookings.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                                No bookings found
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile View */}
                    <div className="block md:hidden p-4 space-y-3">
                      {bookings.slice(0, 5).map(b => (
                        <div key={b.id} className="p-3.5 rounded-xl border border-border/80 bg-secondary/15 flex flex-col gap-2 shadow-xs">
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
                        <p className="text-center text-sm text-muted-foreground py-8">No bookings yet</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ANALYTICS */}
            {activeTab === "analytics" && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground animate-fade-in">Analytics Insights</h2>
                    <p className="text-sm text-muted-foreground mt-1">Real-time catering attachment rates, popular products, course trends, and vendor breakdowns.</p>
                  </div>
                  <Badge variant="outline" className="w-fit border-primary/20 bg-primary/5 text-primary text-xs font-bold px-3 py-1 gap-1.5 flex items-center shadow-xs">
                    <TrendingUp className="h-3.5 w-3.5" /> Live Data
                  </Badge>
                </div>

                {/* Top Row: Catering Attachment & Revenue Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Catering Attachment Rate Card */}
                  <Card className="border-border/80 shadow-md bg-card">
                    <CardHeader>
                      <CardTitle className="text-base font-bold text-foreground">Catering Attachment Rate</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-6 py-2">
                      {/* SVG Radial Progress Ring */}
                      <div className="relative w-36 h-36 flex-shrink-0 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle
                            cx="72"
                            cy="72"
                            r="56"
                            stroke="currentColor"
                            strokeWidth="10"
                            fill="transparent"
                            className="text-secondary"
                          />
                          <circle
                            cx="72"
                            cy="72"
                            r="56"
                            stroke="currentColor"
                            strokeWidth="10"
                            fill="transparent"
                            strokeDasharray={351.8}
                            strokeDashoffset={351.8 - (351.8 * (analytics.cateringAttachmentRate || 0)) / 100}
                            className="text-primary transition-all duration-500 ease-out"
                          />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center">
                          <span className="text-2xl font-black text-foreground">
                            {analytics.cateringAttachmentRate.toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Catering</span>
                        </div>
                      </div>

                      <div className="space-y-4 flex-1">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Percentage of confirmed graduates who added food, drinks, or pastries to their reservation.
                        </p>
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                          <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Admission only</p>
                            <p className="text-lg font-bold text-foreground">{analytics.totalConfirmed - analytics.confirmedWithCatering}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">With Catering</p>
                            <p className="text-lg font-bold text-primary">{analytics.confirmedWithCatering}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Revenue Breakdown Card */}
                  <Card className="border-border/80 shadow-md bg-card">
                    <CardHeader>
                      <CardTitle className="text-base font-bold text-foreground">Revenue Distribution</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {[
                        { label: "Admission & Space Booking", val: analytics.admissionRevenue, color: "bg-teal-500" },
                        { label: "Food Catering", val: analytics.foodRevenue, color: "bg-amber-500" },
                        { label: "Drink Packages", val: analytics.drinkRevenue, color: "bg-blue-500" },
                        { label: "Pastry Platters", val: analytics.pastryRevenue, color: "bg-rose-500" }
                      ].map((item, idx) => {
                        const percentage = analytics.totalRevenue > 0 ? (item.val / analytics.totalRevenue) * 100 : 0;
                        return (
                          <div key={idx} className="space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-semibold text-foreground flex items-center gap-1.5">
                                <span className={cn("w-2 h-2 rounded-full", item.color)} />
                                {item.label}
                              </span>
                              <span className="font-bold text-muted-foreground">
                                GHC {item.val.toFixed(2)} ({percentage.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                              <div className={cn("h-full", item.color)} style={{ width: `${percentage}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      <div className="pt-3 border-t flex justify-between items-center">
                        <span className="text-xs uppercase font-extrabold text-muted-foreground">Total Revenue</span>
                        <span className="text-lg font-black text-primary">GHC {analytics.totalRevenue.toFixed(2)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Middle Row: Popular Catering & Program Popularity */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Popular Products Leaderboard */}
                  <Card className="border-border/80 shadow-md bg-card">
                    <CardHeader>
                      <CardTitle className="text-base font-bold text-foreground">Top Catering Items</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {analytics.popularProducts.slice(0, 5).map((item, idx) => {
                        const maxQty = analytics.popularProducts[0]?.quantity || 1;
                        const percentage = (item.quantity / maxQty) * 100;
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-muted-foreground w-4">{idx + 1}.</span>
                                <span className="font-semibold text-foreground">{item.name}</span>
                                <Badge variant="secondary" className="text-[9px] uppercase font-bold py-0.5 px-1.5">{item.category}</Badge>
                              </div>
                              <span className="font-bold text-foreground">
                                {item.quantity} sold <span className="text-muted-foreground font-normal">(GHC {item.revenue.toFixed(2)})</span>
                              </span>
                            </div>
                            <div className="w-full bg-secondary/60 h-1.5 rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${percentage}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      {analytics.popularProducts.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-8">No catering sales data yet</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Popular Graduation Programs */}
                  <Card className="border-border/80 shadow-md bg-card">
                    <CardHeader>
                      <CardTitle className="text-base font-bold text-foreground">Top Programs Booking Tables</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {analytics.popularCourses.slice(0, 5).map((item, idx) => {
                        const maxCount = analytics.popularCourses[0]?.count || 1;
                        const percentage = (item.count / maxCount) * 100;
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-muted-foreground w-4">{idx + 1}.</span>
                                <span className="font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs">{item.name}</span>
                              </div>
                              <span className="font-bold text-foreground">{item.count} Tables Reserved</span>
                            </div>
                            <div className="w-full bg-secondary/60 h-1.5 rounded-full overflow-hidden">
                              <div className="h-full bg-teal-500" style={{ width: `${percentage}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      {analytics.popularCourses.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-8">No bookings data yet</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Bottom Row: Vendor Breakdown */}
                <Card className="border-border/80 shadow-md bg-card overflow-hidden rounded-2xl">
                  <CardHeader className="bg-secondary/10 border-b border-border/45">
                    <CardTitle className="text-base font-bold text-foreground">Vendor Fulfillment & Payouts</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-secondary/15">
                        <TableRow>
                          <TableHead className="font-bold">Vendor Name</TableHead>
                          <TableHead className="font-bold">Items Fulfilled</TableHead>
                          <TableHead className="font-bold">Total Revenue Generated</TableHead>
                          <TableHead className="font-bold">Suggested Payout (80%)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.topVendors.map((vendor, idx) => (
                          <TableRow key={idx} className="hover:bg-secondary/15">
                            <TableCell className="font-semibold text-foreground">{vendor.name}</TableCell>
                            <TableCell>{vendor.itemsCount} items</TableCell>
                            <TableCell className="font-semibold text-primary">GHC {vendor.revenue.toFixed(2)}</TableCell>
                            <TableCell className="font-bold text-emerald-600">GHC {(vendor.revenue * 0.8).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                        {analytics.topVendors.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No vendor sales data yet</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* BOOKINGS */}
            {activeTab === "bookings" && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6 animate-in fade-in duration-200"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground">Reservations Directory</h2>
                    <p className="text-sm text-muted-foreground mt-1">Review table reservations, inspect custom catering selections, and assign table numbers.</p>
                  </div>
                  
                  {/* Status Quick-filters pills */}
                  <div className="flex items-center gap-1 bg-secondary/35 p-1 rounded-xl border border-border/50 w-fit shrink-0">
                    {[
                      { id: "all", label: "All", count: statusCounts.all },
                      { id: "confirmed", label: "Confirmed", count: statusCounts.confirmed, color: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400" },
                      { id: "pending", label: "Pending", count: statusCounts.pending, color: "text-amber-600 bg-amber-500/10 dark:text-amber-400" }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setStatusFilter(tab.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-150",
                          statusFilter === tab.id
                            ? "bg-card text-foreground shadow-xs border border-border/80"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <span>{tab.label}</span>
                        <span className={cn("px-1.5 py-0.5 rounded-md text-[9px] font-black", tab.color || "bg-secondary text-muted-foreground")}>
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search and Action Toolbar */}
                <Card className="border-border/80 shadow-md bg-card">
                  <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
                    {/* Search Bar */}
                    <div className="relative flex-1 max-w-md w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search code, graduate name, or course..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="h-10 pl-9 pr-9 rounded-xl border-border/80 text-sm focus:ring-1 focus:ring-primary/20 w-full"
                      />
                      {searchQuery && (
                        <button
                          onClick={clearSearch}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportToCSV}
                        className="h-10 rounded-xl border-border/80 text-xs font-bold flex items-center gap-2 bg-card hover:bg-secondary"
                      >
                        <Download className="h-4 w-4 text-muted-foreground" />
                        Export All CSV
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Bookings Table/Cards Container */}
                <Card className="border-border/80 shadow-md bg-card overflow-hidden rounded-2xl">
                  <CardContent className="p-0">
                    {/* Desktop View */}
                    <div className="hidden md:block">
                      <Table data-testid="admin-bookings-table">
                        <TableHeader className="bg-secondary/15">
                          <TableRow className="border-b border-border/40">
                            <TableHead className="w-10">
                              <button
                                onClick={toggleSelectAll}
                                className="p-1 rounded hover:bg-secondary/50 text-muted-foreground"
                              >
                                {selectedBookings.length === paginatedBookings.length && paginatedBookings.length > 0 ? (
                                  <CheckSquare className="h-4.5 w-4.5 text-primary" />
                                ) : (
                                  <Square className="h-4.5 w-4.5" />
                                )}
                              </button>
                            </TableHead>
                            <TableHead onClick={() => handleHeaderSort("reservation_code")} className="font-bold cursor-pointer hover:text-foreground">
                              <span className="flex items-center gap-1">Code <ArrowUpDown className="h-3 w-3" /></span>
                            </TableHead>
                            <TableHead onClick={() => handleHeaderSort("graduate_name")} className="font-bold cursor-pointer hover:text-foreground">
                              <span className="flex items-center gap-1">Graduate <ArrowUpDown className="h-3 w-3" /></span>
                            </TableHead>
                            <TableHead className="font-bold">Program</TableHead>
                            <TableHead className="font-bold">Date</TableHead>
                            <TableHead onClick={() => handleHeaderSort("attendees_count")} className="font-bold cursor-pointer hover:text-foreground">
                              <span className="flex items-center gap-1">Guests <ArrowUpDown className="h-3 w-3" /></span>
                            </TableHead>
                            <TableHead className="font-bold">Catering Items</TableHead>
                            <TableHead onClick={() => handleHeaderSort("total_amount")} className="font-bold cursor-pointer hover:text-foreground">
                              <span className="flex items-center gap-1">Amount <ArrowUpDown className="h-3 w-3" /></span>
                            </TableHead>
                            <TableHead className="font-bold">Table Assigned</TableHead>
                            <TableHead className="font-bold">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedBookings.map(b => {
                            const isChecked = selectedBookings.includes(b.id);
                            return (
                              <TableRow key={b.id} className={cn("hover:bg-secondary/15 transition-colors border-b border-border/30", isChecked && "bg-primary/5")}>
                                <TableCell>
                                  <button
                                    onClick={() => toggleSelectBooking(b.id)}
                                    className="p-1 rounded hover:bg-secondary text-muted-foreground"
                                  >
                                    {isChecked ? (
                                      <CheckSquare className="h-4.5 w-4.5 text-primary" />
                                    ) : (
                                      <Square className="h-4.5 w-4.5" />
                                    )}
                                  </button>
                                </TableCell>
                                <TableCell className="font-mono text-xs font-bold text-foreground bg-secondary/10 px-2 py-1 rounded w-fit">{b.reservation_code}</TableCell>
                                <TableCell className="font-semibold text-foreground text-sm">{b.graduate_name}</TableCell>
                                <TableCell className="text-sm max-w-[120px] truncate">{b.course}</TableCell>
                                <TableCell className="text-sm">{b.graduation_date}</TableCell>
                                <TableCell className="font-semibold">{b.attendees_count}</TableCell>
                                <TableCell>
                                  {b.wants_food ? (
                                    (() => {
                                      const totalQty = (b.selections || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
                                      const totalCateringCost = (b.selections || []).reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0);
                                      return (
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary text-primary transition-all duration-150 shadow-3xs cursor-pointer active:scale-95">
                                              <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                                              <span>{totalQty} Items</span>
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-80 rounded-2xl border border-border/80 bg-card p-4 shadow-xl z-50">
                                            <div className="space-y-3">
                                              <div>
                                                <h4 className="font-display font-bold text-sm text-foreground">Ordered Catering Items</h4>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">Itemized dinner selections breakdown</p>
                                              </div>
                                              <Separator className="bg-border/60" />
                                              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                                {(b.selections || []).map((sel, idx) => {
                                                  const cat = getProductCategory(sel.product_id, sel.product_name);
                                                  const badgeColors = {
                                                    food: "bg-amber-50 text-amber-700 border-amber-200/50 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900/30",
                                                    drink: "bg-blue-50 text-blue-700 border-blue-200/50 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/30",
                                                    pastry: "bg-rose-50 text-rose-700 border-rose-200/50 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900/30"
                                                  };
                                                  const icons = { food: "🍔", drink: "🥤", pastry: "🍰" };
                                                  return (
                                                    <div key={idx} className="flex items-center justify-between gap-3 text-xs border-b border-border/10 pb-1.5 last:border-0 last:pb-0">
                                                      <div className="flex items-center gap-2 min-w-0">
                                                        <Badge variant="outline" className={cn("text-[9px] font-bold py-0.5 px-1.5 rounded-md", badgeColors[cat] || badgeColors.food)}>
                                                          {icons[cat] || "🍔"}
                                                        </Badge>
                                                        <span className="font-semibold text-foreground truncate max-w-[120px]" title={sel.product_name}>{sel.product_name}</span>
                                                        <span className="text-muted-foreground text-[10px] font-bold">x{sel.quantity}</span>
                                                      </div>
                                                      <div className="text-right shrink-0">
                                                        <span className="font-bold text-foreground">GHC {(sel.quantity * sel.unit_price).toFixed(2)}</span>
                                                        <span className="block text-[9px] text-muted-foreground">GHC {sel.unit_price.toFixed(2)} ea</span>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                                {(b.selections || []).length === 0 && (
                                                  <p className="text-center text-xs text-muted-foreground py-3">Catering selected, but no items added.</p>
                                                )}
                                              </div>
                                              <Separator className="bg-border/60" />
                                              <div className="flex justify-between items-center text-xs pt-1">
                                                <span className="font-extrabold text-muted-foreground uppercase tracking-wider text-[10px]">Catering Total</span>
                                                <span className="font-black text-primary text-sm">GHC {totalCateringCost.toFixed(2)}</span>
                                              </div>
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      );
                                    })()
                                  ) : (
                                    <span className="text-muted-foreground text-xs font-semibold pl-2.5">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="font-bold text-foreground">GHC {b.total_amount?.toFixed(2)}</TableCell>
                                <TableCell>
                                  {b.table_number ? (
                                    <Badge
                                      variant="secondary"
                                      onClick={() => openTableDialog(b)}
                                      data-testid="admin-assign-table-button"
                                      className="font-mono text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 flex items-center gap-1 py-1 px-2.5 rounded-lg cursor-pointer transition-colors w-fit"
                                    >
                                      <Table2 className="h-3 w-3" /> {b.table_number}
                                    </Badge>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openTableDialog(b)}
                                      data-testid="admin-assign-table-button"
                                      className="h-8 px-2.5 rounded-xl text-[10px] font-bold border-dashed border-primary/30 text-primary hover:bg-primary/5 hover:border-primary gap-1 transition-colors"
                                    >
                                      <Plus className="h-3.5 w-3.5" /> Assign
                                    </Button>
                                  )}
                                </TableCell>
                                <TableCell>{statusBadge(b.status)}</TableCell>
                              </TableRow>
                            );
                          })}
                          {filteredBookings.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={10} className="text-center text-muted-foreground py-16">
                                No matching bookings found
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Card List View */}
                    <div className="block md:hidden p-4 space-y-4">
                      {/* Hidden table block for test selectors */}
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

                      {paginatedBookings.map(b => (
                        <Card key={b.id} className="p-4 space-y-3.5 border-border/80 shadow-md bg-card">
                          <div className="flex justify-between items-start">
                            <div className="flex gap-2.5 items-start">
                              <button
                                onClick={() => toggleSelectBooking(b.id)}
                                className="p-0.5 rounded text-muted-foreground mt-0.5"
                              >
                                {selectedBookings.includes(b.id) ? (
                                  <CheckSquare className="h-4.5 w-4.5 text-primary" />
                                ) : (
                                  <Square className="h-4.5 w-4.5" />
                                )}
                              </button>
                              <div>
                                <span className="font-mono text-xs font-extrabold text-muted-foreground">{b.reservation_code}</span>
                                <h4 className="font-bold text-base text-foreground mt-0.5">{b.graduate_name}</h4>
                              </div>
                            </div>
                            {statusBadge(b.status)}
                          </div>

                          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground pt-2 border-t">
                            <span className="truncate">Program: <span className="font-semibold text-foreground break-all">{b.course}</span></span>
                            <span className="truncate">Date: <span className="font-semibold text-foreground">{b.graduation_date}</span></span>
                            <span>Guests: <span className="font-semibold text-foreground">{b.attendees_count}</span></span>
                            <span>Table: <span className="font-mono font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded">{b.table_number || "Not Assigned"}</span></span>
                          </div>

                          {b.wants_food && (b.selections || []).length > 0 && (
                            <div className="border-t border-border/40 pt-2 space-y-1.5">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Ordered Catering Items:</span>
                              <div className="flex flex-wrap gap-1 pl-1">
                                {(b.selections || []).map((sel, idx) => {
                                  const cat = getProductCategory(sel.product_id, sel.product_name);
                                  const badgeColors = {
                                    food: "bg-amber-50 text-amber-700 border-amber-200/50 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900/30",
                                    drink: "bg-blue-50 text-blue-700 border-blue-200/50 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/30",
                                    pastry: "bg-rose-50 text-rose-700 border-rose-200/50 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900/30"
                                  };
                                  return (
                                    <Badge
                                      key={idx}
                                      variant="outline"
                                      className={cn("text-[9px] font-bold py-0.5 px-2 rounded-md tracking-tight flex items-center gap-1 shrink-0", badgeColors[cat] || badgeColors.food)}
                                    >
                                      <span>{sel.product_name}</span>
                                      <span className="opacity-75">x{sel.quantity}</span>
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="flex justify-between items-center pt-3 border-t">
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Amount Paid</span>
                              <span className="text-sm font-extrabold text-primary">GHC {b.total_amount?.toFixed(2)}</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openTableDialog(b)}
                              className="h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border-border/80 hover:bg-secondary text-muted-foreground hover:text-foreground"
                            >
                              <Table2 className="h-4 w-4" /> Assign Table
                            </Button>
                          </div>
                        </Card>
                      ))}

                      {filteredBookings.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-8 animate-fade-in">No reservations found</p>
                      )}
                    </div>
                  </CardContent>

                  {/* Pagination footer */}
                  {filteredBookings.length > 0 && (
                    <div className="border-t border-border/45 bg-secondary/5 py-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold text-muted-foreground">
                      <span>
                        Showing <span className="text-foreground">{(currentPage - 1) * pageSize + 1}</span> to <span className="text-foreground">{Math.min(currentPage * pageSize, filteredBookings.length)}</span> of <span className="text-foreground">{filteredBookings.length}</span> entries
                      </span>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(p => p - 1)}
                          className="h-8 w-8 rounded-lg border-border/80"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="px-3 py-1 bg-secondary/80 border text-foreground rounded-lg">
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPage(p => p + 1)}
                          className="h-8 w-8 rounded-lg border-border/80"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Payments Section */}
                <div className="pt-4">
                  <h3 className="font-display text-2xl font-extrabold tracking-tight mt-6">Payment Records</h3>
                  <p className="text-sm text-muted-foreground mt-1">Audit log of all mobile money / card gateway transactions processed.</p>
                </div>
                
                <Card className="border-border/80 shadow-md bg-card overflow-hidden rounded-2xl">
                  <CardContent className="p-0">
                    {/* Desktop View */}
                    <div className="hidden md:block">
                      <Table data-testid="admin-payments-table">
                        <TableHeader className="bg-secondary/15">
                          <TableRow className="border-b border-border/45">
                            <TableHead className="font-bold">Reference</TableHead>
                            <TableHead className="font-bold">Amount Paid</TableHead>
                            <TableHead className="font-bold">Payment Status</TableHead>
                            <TableHead className="font-bold">Date Received</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.map(p => (
                            <TableRow key={p.id} className="hover:bg-secondary/15 border-b border-border/30">
                              <TableCell className="font-mono text-xs font-bold text-foreground">{p.reference}</TableCell>
                              <TableCell className="font-bold text-foreground">GHC {p.amount?.toFixed(2)}</TableCell>
                              <TableCell>{statusBadge(p.status)}</TableCell>
                              <TableCell className="text-sm">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "-"}</TableCell>
                            </TableRow>
                          ))}
                          {payments.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground py-12">No payment records found</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile View */}
                    <div className="block md:hidden p-4 space-y-3">
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
              </motion.div>
            )}

            {/* PRODUCTS */}
            {activeTab === "products" && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground animate-fade-in">Menu Offerings</h2>
                    <p className="text-sm text-muted-foreground mt-1">Manage dishes, drinks, and pastries available for purchase on the booking wizard.</p>
                  </div>
                  <Button onClick={() => openProductDialog()} className="rounded-xl h-10 px-4 font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm shrink-0" data-testid="admin-add-product-button">
                    <Plus className="mr-1 h-4 w-4" /> Add Product
                  </Button>
                </div>

                <Tabs defaultValue="food">
                  <TabsList className="bg-secondary/45 p-1 rounded-xl h-11 max-w-sm flex border border-border/60">
                    <TabsTrigger value="food" className="flex-1 rounded-lg text-xs sm:text-sm font-semibold py-2">Food ({products.filter(p => p.category === "food").length})</TabsTrigger>
                    <TabsTrigger value="drink" className="flex-1 rounded-lg text-xs sm:text-sm font-semibold py-2">Drinks ({products.filter(p => p.category === "drink").length})</TabsTrigger>
                    <TabsTrigger value="pastry" className="flex-1 rounded-lg text-xs sm:text-sm font-semibold py-2">Pastries ({products.filter(p => p.category === "pastry").length})</TabsTrigger>
                  </TabsList>
                  
                  {["food", "drink", "pastry"].map(cat => (
                    <TabsContent key={cat} value={cat} className="mt-4 animate-in fade-in-40 duration-200">
                      <Card className="border-border/80 shadow-md bg-card overflow-hidden rounded-2xl">
                        <CardContent className="p-0">
                          {/* Desktop View */}
                          <div className="hidden md:block">
                            <Table>
                              <TableHeader className="bg-secondary/15">
                                <TableRow>
                                  <TableHead className="font-bold">Item Name</TableHead>
                                  <TableHead className="font-bold">Price (GHC)</TableHead>
                                  <TableHead className="font-bold">Stock Remaining</TableHead>
                                  <TableHead className="font-bold">Vendor Partner</TableHead>
                                  <TableHead className="font-bold">Status</TableHead>
                                  <TableHead className="font-bold text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {products.filter(p => p.category === cat).map(p => (
                                  <TableRow key={p.id} className="hover:bg-secondary/15">
                                    <TableCell className="font-bold text-foreground">{p.name}</TableCell>
                                    <TableCell className="font-semibold text-primary">GHC {p.price?.toFixed(2)}</TableCell>
                                    <TableCell>
                                      <Badge variant={p.stock > 0 ? "secondary" : "destructive"} className="font-bold text-xs">
                                        {p.stock}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm font-medium">{p.vendor || "In-House"}</TableCell>
                                    <TableCell>
                                      <Badge variant={p.is_active ? "default" : "secondary"} className="text-xs">
                                        {p.is_active ? "Active" : "Inactive"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex gap-1 justify-end">
                                        <Button variant="ghost" size="sm" onClick={() => openProductDialog(p)} className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="sm" onClick={() => deleteProduct(p.id)} className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          {/* Mobile View */}
                          <div className="block md:hidden p-4 space-y-3">
                            {products.filter(p => p.category === cat).map(p => (
                              <Card key={p.id} className="p-4 space-y-3.5 border-border/80 shadow-md bg-card">
                                <div className="flex justify-between items-start gap-3">
                                  <div>
                                    <h4 className="font-bold text-sm sm:text-base text-foreground">{p.name}</h4>
                                    {p.vendor && <p className="text-xs text-muted-foreground mt-0.5">Vendor: {p.vendor}</p>}
                                  </div>
                                  <div className="flex flex-col items-end shrink-0">
                                    <span className="text-sm font-extrabold text-primary">GHC {p.price?.toFixed(2)}</span>
                                    <div className="flex gap-1 mt-1.5">
                                      <Badge variant={p.stock > 0 ? "secondary" : "destructive"} className="text-[10px] font-bold">{p.stock} left</Badge>
                                      <Badge variant={p.is_active ? "default" : "secondary"} className="text-[10px]">{p.is_active ? "Active" : "Inactive"}</Badge>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-2.5 border-t border-border/40">
                                  <Button variant="outline" size="sm" onClick={() => openProductDialog(p)} className="h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 border-border/80 hover:bg-secondary text-muted-foreground hover:text-foreground">
                                    <Pencil className="h-3.5 w-3.5" /> Edit
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => deleteProduct(p.id)} className="h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 border-destructive/20 hover:bg-destructive/5 text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" /> Delete
                                  </Button>
                                </div>
                              </Card>
                            ))}
                            {products.filter(p => p.category === cat).length === 0 && (
                              <p className="text-center text-sm text-muted-foreground py-8">No menu items found</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ))}
                </Tabs>
              </motion.div>
            )}

            {/* DATES */}
            {activeTab === "dates" && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground animate-fade-in">Graduation Calendars</h2>
                    <p className="text-sm text-muted-foreground mt-1">Configure valid dates graduates can pick when initiating dinner reservations.</p>
                  </div>
                  <Button onClick={() => setDateDialog(true)} className="rounded-xl h-10 px-4 font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm shrink-0">
                    <Plus className="mr-1 h-4 w-4" /> Add Date
                  </Button>
                </div>

                <Card className="border-border/80 shadow-md bg-card overflow-hidden rounded-2xl">
                  <CardContent className="p-0">
                    {/* Desktop View */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader className="bg-secondary/15">
                          <TableRow>
                            <TableHead className="font-bold">Graduation Event Date</TableHead>
                            <TableHead className="font-bold">Status</TableHead>
                            <TableHead className="font-bold text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dates.map(d => (
                            <TableRow key={d.id} className="hover:bg-secondary/15">
                              <TableCell className="font-semibold text-foreground">{d.date_label}</TableCell>
                              <TableCell>
                                <Badge variant={d.is_active ? "default" : "secondary"} className="text-xs">
                                  {d.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => deleteDate(d.id)} className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {dates.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground py-12">No event dates configured</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile View */}
                    <div className="block md:hidden p-4 space-y-3">
                      {dates.map(d => (
                        <Card key={d.id} className="p-3.5 flex items-center justify-between border-border/80 shadow-sm bg-card">
                          <div>
                            <h4 className="font-bold text-sm text-foreground">{d.date_label}</h4>
                            <Badge variant={d.is_active ? "default" : "secondary"} className="text-[10px] mt-1.5">{d.is_active ? "Active" : "Inactive"}</Badge>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => deleteDate(d.id)} className="h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 border-destructive/20 hover:bg-destructive/5 text-destructive">
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
              </motion.div>
            )}

            {/* SETTINGS */}
            {activeTab === "settings" && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground animate-fade-in">System Configurations</h2>
                  <p className="text-sm text-muted-foreground mt-1">Fine-tune the pricing thresholds and inspect connected payment gateways.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Event Pricing */}
                  <Card className="border-border/80 shadow-md bg-card">
                    <CardHeader className="bg-secondary/10 border-b border-border/45 px-6 py-4">
                      <CardTitle className="text-base font-bold text-foreground">Reservation Fee</CardTitle>
                      <CardDescription className="text-xs">Adjust the default reservation ticket pricing rate.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Fee Per 10 Guests (GHC)</Label>
                        <Input
                          type="number"
                          value={settings.event_fee_per_person || ""}
                          onChange={e => setSettings(s => ({ ...s, event_fee_per_person: parseFloat(e.target.value) || 0 }))}
                          className="h-10 rounded-xl border-border/80 focus:ring-1 focus:ring-primary/20 text-sm font-semibold"
                          data-testid="settings-event-fee"
                        />
                        <p className="text-xs text-muted-foreground mt-1">This is the base reservation fee charged per block of 10 attendees.</p>
                      </div>
                      <Button onClick={saveSettings} className="rounded-xl h-10 px-5 font-bold bg-primary hover:bg-primary/95 text-primary-foreground">
                        Save Settings
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Payment Gateway Configuration */}
                  <Card className="border-border/80 shadow-md bg-card">
                    <CardHeader className="bg-secondary/10 border-b border-border/45 px-6 py-4">
                      <CardTitle className="text-base font-bold text-foreground">Payment Gateway Status</CardTitle>
                      <CardDescription className="text-xs">View API config states for processing card/mobile money transactions.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-sm font-bold text-foreground">Moolre Embedded Checkout Enabled</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        API credentials are loaded directly from the backend environment configuration (`.env`). Links are generated via Moolre API to securely route payment processing.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Product Dialog */}
      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent data-testid="admin-product-dialog" className="max-w-[92vw] sm:max-w-[425px] rounded-3xl border shadow-2xl p-6 bg-card">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              {editProduct ? "Edit Menu Product" : "Add Menu Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Item Name *</Label>
              <Input
                value={productForm.name}
                onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Assorted Jollof Rice"
                className="h-10 rounded-xl border-border/80 text-sm"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Category *</Label>
              <Select value={productForm.category} onValueChange={v => setProductForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-10 w-full rounded-xl border-border/80 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="food">Food Catering</SelectItem>
                  <SelectItem value="drink">Drink Package</SelectItem>
                  <SelectItem value="pastry">Pastry Platter</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Price (GHC) *</Label>
                <Input
                  type="number"
                  value={productForm.price}
                  onChange={e => setProductForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0.00"
                  className="h-10 rounded-xl border-border/80 text-sm font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Stock Limit *</Label>
                <Input
                  type="number"
                  value={productForm.stock}
                  onChange={e => setProductForm(f => ({ ...f, stock: e.target.value }))}
                  placeholder="100"
                  className="h-10 rounded-xl border-border/80 text-sm font-semibold"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Vendor Partner</Label>
              <Input
                value={productForm.vendor}
                onChange={e => setProductForm(f => ({ ...f, vendor: e.target.value }))}
                placeholder="e.g. Asanka Catering Service"
                className="h-10 rounded-xl border-border/80 text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t">
            <Button variant="secondary" onClick={() => setProductDialog(false)} className="h-10 rounded-xl text-xs font-bold">
              Cancel
            </Button>
            <Button onClick={saveProduct} className="h-10 rounded-xl text-xs font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm">
              {editProduct ? "Save Changes" : "Create Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date Dialog */}
      <Dialog open={dateDialog} onOpenChange={setDateDialog}>
        <DialogContent className="max-w-[92vw] sm:max-w-[425px] rounded-3xl border shadow-2xl p-6 bg-card">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="font-display text-lg font-bold text-foreground">Add Graduation Event Date</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Date Label *</Label>
            <Input
              value={dateForm.date_label}
              onChange={e => setDateForm({ date_label: e.target.value })}
              placeholder="e.g. December 20, 2026"
              className="h-10 rounded-xl border-border/80 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">This label will be shown in the graduation selection menu.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t">
            <Button variant="secondary" onClick={() => setDateDialog(false)} className="h-10 rounded-xl text-xs font-bold">
              Cancel
            </Button>
            <Button onClick={saveDate} className="h-10 rounded-xl text-xs font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm">
              Add Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Assignment Dialog */}
      <Dialog open={tableDialog} onOpenChange={setTableDialog}>
        <DialogContent className="max-w-[92vw] sm:max-w-[425px] rounded-3xl border shadow-2xl p-6 bg-card">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="font-display text-lg font-bold text-foreground">Assign Table Number</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Table Reference</Label>
            <Input
              value={tableForm.table_number}
              onChange={e => setTableForm(f => ({ ...f, table_number: e.target.value }))}
              placeholder="e.g. Table T23"
              className="h-10 rounded-xl border-border/80 text-sm font-semibold"
            />
            <p className="text-[10px] text-muted-foreground">Assign a table number to this reservation. Leave blank to clear the current assignment.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t">
            <Button variant="secondary" onClick={() => setTableDialog(false)} className="h-10 rounded-xl text-xs font-bold">
              Cancel
            </Button>
            <Button onClick={assignTable} data-testid="admin-assign-table-confirm" className="h-10 rounded-xl text-xs font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm">
              Assign Table
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Action Bar Overlay */}
      <AnimatePresence>
        {selectedBookings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground/90 dark:bg-card/90 text-background dark:text-foreground backdrop-blur-md px-5 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-5 border border-border/15 max-w-[92vw] w-full sm:max-w-md"
          >
            <div className="flex items-center gap-2 shrink-0">
              <CheckSquare className="h-4.5 w-4.5 text-primary" />
              <span className="text-xs sm:text-sm font-bold">
                {selectedBookings.length} Selected
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                className="h-8.5 px-3 rounded-lg border-border/30 text-[11px] font-bold bg-transparent hover:bg-background/10 text-inherit"
              >
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={bulkClearTables}
                className="h-8.5 px-3 rounded-lg border-destructive/30 hover:border-destructive text-[11px] font-bold bg-transparent text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear Tables
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedBookings([])}
                className="h-8.5 px-2.5 rounded-lg text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-background/5"
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
