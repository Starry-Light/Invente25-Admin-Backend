import React from "react";
import { Link } from "react-router-dom";
export default function Card({ title, desc, to }) {
  return (
    <Link to={to} className="block p-4 bg-white rounded shadow hover:shadow-md transition-shadow w-full">
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-gray-600 line-clamp-2">{desc}</p>
    </Link>
  );
}
