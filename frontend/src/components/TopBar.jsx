import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function TopBar() {
  const { user, logout } = useAuth();
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white shadow px-4 py-3">
      <div className="flex flex-col md:flex-row md:items-center gap-4 w-full md:w-auto">
        <h1 className="text-xl font-semibold">Invente25 — Admin Dashboard</h1>
        <nav className="flex flex-wrap gap-2 text-sm text-gray-600 mt-2 md:mt-0">
          <Link to="/" className="hover:underline">
            Home
          </Link>
          { user &&
          ["volunteer", "dept_admin", "super_admin"].includes(user.role) &&
          <Link to="/scan" className="hover:underline">
            Scan
          </Link>
}

          {/* show attendance link for relevant roles */}
          {user &&
            ["event_admin", "dept_admin", "super_admin"].includes(
              user.role
            ) && (
              <Link to="/attendance" className="hover:underline">
                Attendance
              </Link>
            )}
          {user && ["dept_admin", "super_admin"].includes(user.role) && (
            <Link to="/analytics" className="hover:underline">
              Analytics
            </Link>
          )}
          {user && ["volunteer", "dept_admin", "super_admin"].includes(user.role) && (
            <Link to="/tech-registration" className="hover:underline">
              Tech Registration
            </Link>
          )}
          {user && ["volunteer", "dept_admin", "super_admin"].includes(user.role) && (
            <Link to="/workshop-registration" className="hover:underline">
              Workshop Registration
            </Link>
          )}
          {user && ["volunteer", "dept_admin", "super_admin"].includes(user.role) && (
            <Link to="/non-tech-registration" className="hover:underline">
              Non-Tech Registration
            </Link>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        {user ? (
          <>
            <div className="text-sm">
              {user.email}{" "}
              <span className="text-xs text-gray-500">({user.role})</span>
            </div>
            {/* logout button need to make this redirect to login page */}
            <button
              className="px-3 py-1 rounded bg-red-500 text-white text-sm"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="px-3 py-1 rounded bg-blue-500 text-white text-sm"
          >
            Login
          </Link>
        )}
      </div>
    </div>
  );
}
