import React from "react";
import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("admin_token");

  if (!token) {
    // Redirect unauthenticated user to admin login while preserving intended target location
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return children;
}
