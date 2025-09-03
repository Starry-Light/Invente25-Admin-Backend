import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import TopBar from "./components/TopBar";
import Home from "./pages/Home";
import ScanPage from "./pages/Scan";
import AttendancePage from "./pages/Attendance";
import AnalyticsPage from "./pages/Analytics";
import LoginPage from "./pages/Login";
import TechRegistrationPage from "./pages/TechRegistration";
import WorkshopRegistrationPage from "./pages/WorkshopRegistration";
import NonTechRegistrationPage from "./pages/NonTechRegistration";
import SuperAdminDump from "./pages/SuperAdminDump";

function RequireAuth({ children, roles }) {
  // simple guard in App; more advanced guard is implemented in pages as needed
  // We'll rely on backend to enforce actual authorization.
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  if (roles) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (!roles.includes(payload.role))
        return <div className="p-4">Forbidden</div>;
    } catch (e) {
      return <Navigate to="/login" replace />;
    }
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-100">
          <TopBar />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Home />
                </RequireAuth>
              }
            />
            <Route
              path="/scan"
              element={
                <RequireAuth>
                  <ScanPage />
                </RequireAuth>
              }
            />

            <Route
              path="/attendance"
              element={
                <RequireAuth
                  roles={["volunteer", "event_admin", "dept_admin", "super_admin"]}
                >
                  <AttendancePage />
                </RequireAuth>
              }
            />
            <Route
              path="/analytics"
              element={
                <RequireAuth roles={["dept_admin", "super_admin"]}>
                  <AnalyticsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/tech-registration"
              element={
                <RequireAuth roles={["volunteer", "dept_admin", "super_admin"]}>
                  <TechRegistrationPage />
                </RequireAuth>
              }
            />
            <Route
              path="/workshop-registration"
              element={
                <RequireAuth roles={["volunteer", "dept_admin", "super_admin"]}>
                  <WorkshopRegistrationPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/dump"
              element={
                <RequireAuth roles={["super_admin"]}>
                  <SuperAdminDump />
                </RequireAuth>
              }
            />
            <Route
              path="/non-tech-registration"
              element={
                <RequireAuth roles={["volunteer", "dept_admin", "super_admin"]}>
                  <NonTechRegistrationPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<div className="p-6">Not found</div>} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}
