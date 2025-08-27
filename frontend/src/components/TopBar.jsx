
import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'


export default function TopBar(){
const { user, logout } = useAuth()
return (
<div className="flex items-center justify-between bg-white shadow px-4 py-3">
<div className="flex items-center gap-4">
<h1 className="text-xl font-semibold">Invente25 — Admin Dashboard</h1>
<nav className="space-x-2 text-sm text-gray-600">
<Link to="/" className="hover:underline">Home</Link>
<Link to="/scan" className="hover:underline">Scan</Link>
<Link to="/unverified" className="hover:underline">Unverified</Link>
{/* show attendance link for relevant roles */}
{user && ['event_admin','dept_admin','super_admin'].includes(user.role) && (
<Link to="/attendance" className="hover:underline">Attendance</Link>
)}
{user && ['dept_admin','super_admin'].includes(user.role) && (
<Link to="/analytics" className="hover:underline">Analytics</Link>
)}
</nav>
</div>
<div className="flex items-center gap-4">
{user ? (
<>
<div className="text-sm">{user.email} <span className="text-xs text-gray-500">({user.role})</span></div>
<button className="px-3 py-1 rounded bg-red-500 text-white text-sm" onClick={logout}>Logout</button>
</>
) : (
<Link to="/login" className="px-3 py-1 rounded bg-blue-500 text-white text-sm">Login</Link>
)}
</div>
</div>
)
}