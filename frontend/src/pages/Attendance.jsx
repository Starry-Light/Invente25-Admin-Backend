// src/pages/Attendance.jsx
import React, { useCallback, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import QRScanner from '../components/QRScanner'

/**
 * normalizeDecoded: extracts last path segment from URLs, trims quotes/whitespace.
 */
function normalizeDecoded(raw) {
  if (!raw || typeof raw !== 'string') return raw
  let s = raw.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  try {
    const u = new URL(s)
    const parts = (u.pathname || '').split('/').filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
    return s
  } catch (e) {
    // not a URL
  }
  if (s.includes('/')) {
    const parts = s.split('/').filter(Boolean)
    if (parts.length > 0) s = parts[parts.length - 1]
  }
  return s
}

export default function AttendancePage() {
  const { authAxios, user } = useAuth()
  const [passId, setPassId] = useState('')
  const [pass, setPass] = useState(null)
  const [slots, setSlots] = useState([])
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)
  const [marking, setMarking] = useState({}) // map event_id -> bool

  // to ignore duplicate quick scans
  const lastScannedRef = useRef({ id: null, ts: 0 })

  const load = useCallback(async (id) => {
    if (!id) return
    setMsg(null)
    setLoading(true)
    try {
      const resp = await authAxios.get(`/scan/${id}`)
      if (!resp || !resp.data || !resp.data.pass) {
        setPass(null)
        setSlots([])
        setMsg('No pass data returned')
        setLoading(false)
        return
      }
      const p = resp.data.pass
      const all = resp.data.slots || []
      // client-side visibility filtering (backend enforces too)
      const visible = all.filter(s => {
        if (!user) return false
        if (user.role === 'super_admin' || user.role === 'dept_admin') return true
        if (user.role === 'event_admin') {
          return s.department_id === user.department_id
        }
        return false
      })
      setPass(p)
      setSlots(visible)
    } catch (err) {
      setPass(null)
      setSlots([])
      setMsg(err?.response?.data?.error || String(err))
      console.error('Attendance load error', err)
    } finally {
      setLoading(false)
    }
  }, [authAxios, user])

  const onQrResult = useCallback((decodedText) => {
    if (!decodedText) return
    const normalized = normalizeDecoded(decodedText)

    // ignore duplicates within short window (e.g. 800ms)
    const now = Date.now()
    if (lastScannedRef.current.id === normalized && (now - lastScannedRef.current.ts) < 800) {
      return
    }
    lastScannedRef.current = { id: normalized, ts: now }

    setPassId(normalized)
    load(normalized)
  }, [load])

  const markAtt = async (event_id, attended) => {
    if (!pass || !pass.id) {
      setMsg('No pass loaded')
      return
    }
    setMsg(null)
    setMarking(prev => ({ ...prev, [event_id]: true }))
    try {
      await authAxios.post(`/passes/${pass.id}/attendance`, { event_id, attended })
      // reload slots for latest state
      await load(pass.id)
    } catch (err) {
      setMsg(err?.response?.data?.error || String(err))
      console.error('markAtt error', err)
    } finally {
      setMarking(prev => ({ ...prev, [event_id]: false }))
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Mark Attendance</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div>
          <div className="flex gap-2 mb-2">
            <input
              value={passId}
              onChange={e => setPassId(e.target.value)}
              placeholder="paste passId here"
              className="flex-1 border p-2 rounded"
            />
            <button
              onClick={() => {
                const normalized = normalizeDecoded(passId)
                setPassId(normalized)
                load(normalized)
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              Load
            </button>
          </div>

          <div className="text-sm text-gray-500 mb-2">Or scan QR using camera</div>
          {/* stopOnResult=true so scanner auto-stops for attendance flows */}
          <QRScanner onResult={onQrResult} stopOnResult={true} />
        </div>

        <div>
          {msg && <div className="text-red-500 mb-3">{msg}</div>}
          {loading && <div className="text-sm text-gray-500 mb-3">Loading...</div>}

          {pass ? (
            <div className="bg-white p-4 rounded shadow">
              <h3 className="font-semibold break-words">Pass: {pass.id}</h3>
              <p className="text-sm text-gray-600">
                Owner: {pass.user_email || '—'}{' '}
                {pass.payment_method ? `— Payment: ${pass.payment_method}` : ''} — Verified: {pass.verified ? 'Yes' : 'No'}
              </p>

              <div className="mt-4">
                <h4 className="font-semibold">Slots</h4>
                <div className="space-y-2 mt-2">
                  {slots.length === 0 && <div className="text-sm text-gray-500">No slots visible for this pass (or none belong to your department)</div>}
                  {slots.map(s => (
                    <div key={s.slot_no} className="p-3 border rounded flex justify-between items-center">
                      <div>
                        <div className="text-sm font-medium">Slot {s.slot_no} - {s.event_name || `Event ${s.event_id}`}</div>
                        <div className="text-xs text-gray-500">Assigned: {s.assigned_at ? new Date(s.assigned_at).toLocaleString() : '-'}</div>
                        <div className="text-xs text-gray-500">Attended: {s.attended ? 'Yes' : 'No'}</div>
                      </div>

                      <div className="flex gap-2">
                        {!s.attended ? (
                          <button
                            className="px-3 py-1 bg-green-600 text-white rounded"
                            onClick={() => markAtt(s.event_id, true)}
                            disabled={Boolean(marking[s.event_id])}
                          >
                            {marking[s.event_id] ? 'Marking...' : 'Mark Present'}
                          </button>
                        ) : (
                          <button
                            className="px-3 py-1 bg-yellow-600 text-white rounded"
                            onClick={() => markAtt(s.event_id, false)}
                            disabled={Boolean(marking[s.event_id])}
                          >
                            {marking[s.event_id] ? 'Updating...' : 'Unmark'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">No pass loaded</div>
          )}
        </div>
      </div>
    </div>
  )
}
