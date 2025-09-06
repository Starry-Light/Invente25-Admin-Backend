import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

export default function Card({ title, desc, to, icon: IconComponent }) {
  return (
    <Link
      to={to}
      className="group block rounded-lg bg-white p-6 shadow-md ring-1 ring-gray-900/5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
    >
      <div className="flex items-center space-x-4">
        {IconComponent && (
          <div className="flex-shrink-0 rounded-lg bg-blue-500 p-3 text-white shadow-sm">
            <IconComponent className="h-6 w-6" />
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <p className="mt-1 text-sm text-gray-500">{desc}</p>
        </div>
        <div className="text-gray-300 transition-transform duration-300 group-hover:text-blue-500 group-hover:translate-x-1">
            <ArrowRightIcon className="h-5 w-5" />
        </div>
      </div>
    </Link>
  );
}