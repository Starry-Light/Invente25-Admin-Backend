import React, { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'


export default function LoginPage(){
const [email, setEmail] = useState('admin@invente.local')
const [password, setPassword] = useState('password')
const [err, setErr] = useState(null)
const { login } = useAuth()
const nav = useNavigate()


const onSubmit = async (e) => {
e.preventDefault(); setErr(null)
try { await login(email,password); nav('/') }
catch(err){ setErr(err.response?.data?.error || String(err)) }
}


return (
<div className="max-w-md mx-auto mt-16 p-6 bg-white shadow rounded">
<h2 className="text-2xl mb-4">Login</h2>
<form onSubmit={onSubmit} className="space-y-3">
<div>
<label className="block text-sm">Email</label>
<input value={email} onChange={e=>setEmail(e.target.value)} className="w-full border p-2 rounded" />
</div>
<div>
<label className="block text-sm">Password</label>
<input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full border p-2 rounded" />
</div>
{err && <div className="text-red-500">{err}</div>}
<div className="flex justify-end">
<button className="px-4 py-2 bg-blue-600 text-white rounded">Login</button>
</div>
</form>
</div>
)
}