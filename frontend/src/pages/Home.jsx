import React from "react";
import Card from "../components/Card";
import { useAuth } from "../hooks/useAuth";

export default function Home() {
  const { user } = useAuth();
  const role = user?.role || null;

  // define cards and which roles may see them (null means visible to all authenticated roles)
  const cards = [
    {
      title: "Scan pass",
      desc: "Scan or paste passId to view slots and assign.",
      to: "/scan",
      roles: [  "volunteer", "dept_admin", "super_admin"],
    },
    {
      title: "Unverified",
      desc: "See cash payments that need marking as paid.",
      to: "/unverified",
      roles: ["volunteer", "dept_admin", "super_admin"],
    },
    {
      title: "Attendance",
      desc: "Mark attendance for events (event admins).",
      to: "/attendance",
      roles: ["event_admin", "dept_admin", "super_admin"],
    },
    {
      title: "Analytics",
      desc: "Department / college stats (admins).",
      to: "/analytics",
      roles: ["dept_admin", "super_admin"],
    },
  ];

  // filter based on role
  const visible = cards.filter((c) => {
    if (!c.roles) return true;
    if (!role) return false;
    return c.roles.includes(role);
  });

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-2">
        Welcome{user ? `, ${user.email}` : ""}
      </h2>
      <p className="text-sm text-gray-600">
        Use the nav to scan tickets, verify cash payments, and manage
        attendance.
      </p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {visible.map((c) => (
          <Card key={c.to} title={c.title} desc={c.desc} to={c.to} />
        ))}
      </div>

      {visible.length === 0 && (
        <div className="mt-6 p-4 bg-white rounded shadow text-gray-600">
          You do not have access to any dashboard actions. Contact an
          administrator.
        </div>
      )}
    </div>
  );
}
