// src/pages/Unverified.jsx
import React, { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export default function UnverifiedPage(){
  const { authAxios } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [query, setQuery] = useState('')

  const fetchRows = async () => {
    setLoading(true)
    try { const resp = await authAxios.get('/passes?verified=false&payment_method=cash'); setRows(resp.data.rows || []) }
    catch(err){ setMsg(err.response?.data?.error || String(err)) }
    finally{ setLoading(false) }
  }

  useEffect(()=>{ fetchRows() }, [])

  const debouncedQuery = useDebounced(query, 300)

  // filter rows by email OR name (if backend returned a name field like user_name or name)
  const filtered = useMemo(() => {
    if (!debouncedQuery) return rows
    const q = debouncedQuery.trim().toLowerCase()
    return rows.filter(r => {
      const email = (r.user_email || '').toLowerCase()
      const name = (r.user_name || r.name || '').toLowerCase()
      return email.includes(q) || name.includes(q)
    })
  }, [rows, debouncedQuery])

  const markPaid = async (passId) => {
    setMsg(null)
    try { await authAxios.post(`/passes/${passId}/mark-cash-paid`); await fetchRows() }
    catch(err){ setMsg(err.response?.data?.error || String(err)) }
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Unverified Cash Payments</h2>

      <div className="mb-4 flex gap-2">
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by email or name" className="flex-1 border p-2 rounded" />
        <button onClick={fetchRows} className="px-3 py-1 bg-blue-600 text-white rounded">Refresh</button>
      </div>

      {msg && <div className="text-red-500 mb-3">{msg}</div>}
      {loading ? <div>Loading...</div> : (
        <div className="space-y-2">
          {filtered.length === 0 && <div className="text-sm text-gray-500">No unverified cash passes.</div>}
          {filtered.map(r => (
            <div key={r.id} className="p-3 bg-white rounded shadow flex justify-between items-center">
              <div>
                <div className="font-medium">{r.id}</div>
                <div className="text-sm text-gray-600">{r.user_email}{r.name ? ` — ${r.name}` : ''} — created: {new Date(r.created_at).toLocaleString()}</div>
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
