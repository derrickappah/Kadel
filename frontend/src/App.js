import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/pages/LandingPage";
import BookingWizard from "@/pages/BookingWizard";
import PaymentCallback from "@/pages/PaymentCallback";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import TrackTable from "@/pages/TrackTable";

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/book" element={<BookingWizard />} />
        <Route path="/track" element={<TrackTable />} />
        <Route path="/payment/callback" element={<PaymentCallback />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
