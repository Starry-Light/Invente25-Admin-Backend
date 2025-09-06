import React from "react";
import Card from "../components/Card";
import { useAuth } from "../hooks/useAuth";
import {
  QrCodeIcon,
  UserGroupIcon,
  ChartBarIcon,
  CpuChipIcon,
  WrenchScrewdriverIcon,
  PuzzlePieceIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";

export default function Home() {
  const { user } = useAuth();
  const role = user?.role || null;

  // Define roles to avoid repetition
  const registrationRoles = ["volunteer", "dept_admin", "super_admin"];
  const adminRoles = ["dept_admin", "super_admin"];

  // Add an `icon` property to each card
  const cards = [
    {
      title: "Scan Pass",
      desc: "Scan QR codes to view slots and participant details.",
      to: "/scan",
      roles: registrationRoles,
      icon: QrCodeIcon,
    },
    {
      title: "Attendance",
      desc: "Mark attendance for specific events and workshops.",
      to: "/attendance",
      roles: ["event_admin", ...adminRoles],
      icon: UserGroupIcon,
    },
    {
      title: "Analytics",
      desc: "View department and college registration statistics.",
      to: "/analytics",
      roles: adminRoles,
      icon: ChartBarIcon,
    },
    {
      title: "Tech Registration",
      desc: "Register participants for technical events.",
      to: "/tech-registration",
      roles: registrationRoles,
      icon: CpuChipIcon,
    },
    {
      title: "Workshop Registration",
      desc: "Register participants for workshops.",
      to: "/workshop-registration",
      roles: registrationRoles,
      icon: WrenchScrewdriverIcon,
    },
    {
      title: "Non-Tech Registration",
      desc: "Register participants for non-technical events.",
      to: "/non-tech-registration",
      roles: registrationRoles,
      icon: PuzzlePieceIcon,
    },
  ];

  const visibleCards = cards.filter((c) => {
    if (!c.roles) return true;
    if (!role) return false;
    return c.roles.includes(role);
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Improved Welcome Header */}
      <div className="mb-8 p-6 bg-white rounded-lg shadow-sm ring-1 ring-gray-900/5">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
          Welcome back!
        </h1>
        <p className="mt-2 text-base text-gray-600">
          Select an action from the dashboard below to get started.
        </p>
      </div>

      {/* Card Grid */}
      {visibleCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleCards.map((card) => (
            <Card
              key={card.to}
              title={card.title}
              desc={card.desc}
              to={card.to}
              icon={card.icon}
            />
          ))}
        </div>
      )}

      {/* Improved Empty State */}
      {visibleCards.length === 0 && user && (
        <div className="mt-6 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
             <LockClosedIcon className="h-6 w-6 text-gray-500" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No actions available</h3>
          <p className="mt-1 text-sm text-gray-500">
            Your current role does not have any assigned permissions.
            <br/>
            Please contact an administrator if you believe this is an error.
          </p>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} Invente'25 — All Rights Reserved.</p>
        <p className="mt-1">
          Made with love (for the backend ONLY) and insomnia, by Irfan :) 
        </p>
      </footer>
    </div>
  );
}