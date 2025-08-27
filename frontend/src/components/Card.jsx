import React from 'react'
import { Link } from 'react-router-dom'
export default function Card({ title, desc, to }){
return (
<Link to={to} className="block p-4 bg-white rounded shadow hover:shadow-md">
<h3 className="font-semibold">{title}</h3>
<p className="text-sm text-gray-600">{desc}</p>
</Link>
)
}