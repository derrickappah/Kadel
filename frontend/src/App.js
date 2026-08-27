import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/pages/LandingPage";
import BookingWizard from "@/pages/BookingWizard";
import PaymentCallback from "@/pages/PaymentCallback";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import TrackTable from "@/pages/TrackTable";
import ProtectedRoute from "@/components/ProtectedRoute";

import LeadCapture from "@/pages/LeadCapture";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/leads" element={<LeadCapture />} />
        <Route path="/book" element={<BookingWizard />} />
        <Route path="/track" element={<TrackTable />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/payment/callback" element={<PaymentCallback />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Navigate to="/admin/overview" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/:tab"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
