import React, { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'


export default function UnverifiedPage(){
const { authAxios } = useAuth()
const [rows, setRows] = useState([])
const [loading, setLoading] = useState(false)
const [msg, setMsg] = useState(null)


const fetchRows = async () => {
setLoading(true)
try { const resp = await authAxios.get('/passes?verified=false&payment_method=cash'); setRows(resp.data.rows || []) }
catch(err){ setMsg(err.response?.data?.error || String(err)) }
finally{ setLoading(false) }
}


useEffect(()=>{ fetchRows() }, [])


const markPaid = async (passId) => {
setMsg(null)
try { await authAxios.post(`/passes/${passId}/mark-cash-paid`); await fetchRows() }
catch(err){ setMsg(err.response?.data?.error || String(err)) }
}


return (
<div className="p-6">
<h2 className="text-xl font-semibold mb-4">Unverified Cash Payments</h2>
{msg && <div className="text-red-500 mb-3">{msg}</div>}
{loading ? <div>Loading...</div> : (
<div className="space-y-2">
{rows.length === 0 && <div className="text-sm text-gray-500">No unverified cash passes.</div>}
{rows.map(r => (
<div key={r.id} className="p-3 bg-white rounded shadow flex justify-between items-center">
<div>
<div className="font-medium">{r.id}</div>
<div className="text-sm text-gray-600">{r.user_email} — created: {new Date(r.created_at).toLocaleString()}</div>
</div>
<div className="flex gap-2">
<button className="px-3 py-1 bg-green-600 text-white rounded" onClick={()=>markPaid(r.id)}>Mark Paid</button>
</div>
</div>
))}
</div>
)}
</div>
)
}