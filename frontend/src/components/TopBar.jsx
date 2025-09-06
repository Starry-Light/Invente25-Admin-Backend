import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

// A small helper component to avoid repeating the role check logic
const NavLink = ({ to, requiredRoles, user, children, className = "" }) => {
  // Show the link if no specific roles are required, or if the user has one of the required roles.
  const isVisible = !requiredRoles || (user && requiredRoles.includes(user.role));

  if (!isVisible) {
    return null;
  }

  return (
    <Link to={to} className={`hover:text-blue-600 transition-colors ${className}`}>
      {children}
    </Link>
  );
};

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Define roles for clarity and to reduce repetition
  const registrationRoles = ["volunteer", "dept_admin", "super_admin"];
  const attendanceRoles = ["event_admin", "dept_admin", "super_admin"];
  const analyticsRoles = ["dept_admin", "super_admin"];

  // The navigation links are defined once and reused for both desktop and mobile views
  const navLinks = (
    <>
      <NavLink to="/" user={user}>Home</NavLink>
      <NavLink to="/scan" requiredRoles={registrationRoles} user={user}>Scan</NavLink>
      <NavLink to="/attendance" requiredRoles={attendanceRoles} user={user}>Attendance</NavLink>
      <NavLink to="/analytics" requiredRoles={analyticsRoles} user={user}>Analytics</NavLink>
      <NavLink to="/tech-registration" requiredRoles={registrationRoles} user={user}>Tech Registration</NavLink>
      <NavLink to="/workshop-registration" requiredRoles={registrationRoles} user={user}>Workshop Registration</NavLink>
      <NavLink to="/non-tech-registration" requiredRoles={registrationRoles} user={user}>Non-Tech Registration</NavLink>
    </>
  );

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Left Side: Title */}
        <Link to="/" className="text-xl font-bold text-gray-800">
          Invente'25 Admin
        </Link>

        {/* Center: Desktop Navigation */}
        <nav className="hidden items-center space-x-6 text-sm font-medium text-gray-600 md:flex">
          {navLinks}
        </nav>

        {/* Right Side: User Info & Actions */}
        <div className="flex items-center space-x-4">
          {user ? (
            <div className="hidden items-center space-x-4 md:flex">
              <div className="text-right text-sm">
                <div className="font-medium text-gray-800">{user.email}</div>
                <div className="text-xs text-gray-500">{user.role.replace('_', ' ')}</div>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-md bg-red-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-600"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="hidden rounded-md bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 md:block"
            >
              Login
            </Link>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 md:hidden"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? (
              <XMarkIcon className="h-6 w-6" />
            ) : (
              <Bars3Icon className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMenuOpen && (
        <div className="border-t border-gray-200 bg-white md:hidden">
          <nav className="flex flex-col space-y-4 p-4 text-base">
            {navLinks}
          </nav>
          <div className="border-t border-gray-200 p-4">
            {user ? (
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium text-gray-800">{user.email}</div>
                  <div className="text-xs text-gray-500">{user.role.replace('_', ' ')}</div>
                </div>
                <button
                  onClick={handleLogout}
                  className="rounded-md bg-red-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-600"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="block w-full rounded-md bg-blue-500 px-4 py-2 text-center font-semibold text-white shadow-sm hover:bg-blue-600"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}