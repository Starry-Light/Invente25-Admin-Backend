// src/pages/Attendance.jsx
import React, { useCallback, useRef, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
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

// Helper function to detect pass type from passId
function detectPassType(passId) {
  if (passId.endsWith('$t') || passId.endsWith('$T')) return 'technical';
  if (passId.endsWith('$n') || passId.endsWith('$N')) return 'non-technical';
  if (passId.endsWith('$w') || passId.endsWith('$W')) return 'workshop';
  if (passId.endsWith('$h') || passId.endsWith('$H')) return 'hackathon';
  return 'technical'; // Default for backward compatibility
}

export default function AttendancePage() {
  const { authAxios, user } = useAuth()
  const [searchParams] = useSearchParams()
  const [passId, setPassId] = useState('')
  const [pass, setPass] = useState(null)
  const [slots, setSlots] = useState([])
  const [event, setEvent] = useState(null)
  const [teamMembers, setTeamMembers] = useState([])
  const [passType, setPassType] = useState(null)
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)
  const [marking, setMarking] = useState(false)

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
        setEvent(null)
        setTeamMembers([])
        setPassType(null)
        setMsg('No pass data returned')
        setLoading(false)
        return
      }
      
      const p = resp.data.pass
      const type = resp.data.passType
      setPass(p)
      setPassType(type)

      if (type === 'technical') {
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
        setSlots(visible)
        setEvent(null)
        setTeamMembers([])
      } else if (type === 'non-technical' || type === 'workshop') {
        setEvent(resp.data.event)
        setSlots([])
        setTeamMembers([])
      } else if (type === 'hackathon') {
        setTeamMembers(resp.data.teamMembers || [])
        setSlots([])
        setEvent(null)
      }
    } catch (err) {
      setPass(null)
      setSlots([])
      setEvent(null)
      setTeamMembers([])
      setPassType(null)
      setMsg(err?.response?.data?.error || String(err))
      console.error('Attendance load error', err)
    } finally {
      setLoading(false)
    }
  }, [authAxios, user])

  // Handle passId from URL parameter (redirected from scan page)
  useEffect(() => {
    const urlPassId = searchParams.get('passId');
    if (urlPassId) {
      setPassId(urlPassId);
      load(urlPassId);
    }
  }, [searchParams, load]);

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

  const markAtt = async (slot_no = null) => {
    if (!pass || !pass.pass_id) {
      setMsg('No pass loaded')
      return
    }
    setMsg(null)
    setMarking(true)
    try {
      const payload = slot_no ? { slot_no } : {}
      await authAxios.post(`/scan/${pass.pass_id}/attend`, payload)
      // reload for latest state
      await load(pass.pass_id)
    } catch (err) {
      setMsg(err?.response?.data?.error || String(err))
      console.error('markAtt error', err)
    } finally {
      setMarking(false)
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
          {msg && <div className="text-red-500 mb-3">{msg}<br />Try reloading/logging out and back in</div>}
          {loading && <div className="text-sm text-gray-500 mb-3">Loading...</div>}

          {pass ? (
            <div className="bg-white p-4 rounded shadow">
              <h3 className="font-semibold break-words">Pass: {pass.pass_id}</h3>
              <p className="text-sm text-gray-600">
                Owner: {pass.user_email || pass.leader_email || '—'}
              </p>
              <p className="text-sm text-gray-500">
                Type: {passType?.charAt(0).toUpperCase() + passType?.slice(1) || 'Unknown'}
              </p>

              {passType === 'technical' && (
                <div className="mt-4">
                  <h4 className="font-semibold">Slots</h4>
                  <div className="space-y-2 mt-2">
                    {slots.length === 0 && <div className="text-sm text-gray-500">No slots visible for this pass (or none belong to your department)</div>}
                    {slots.map(s => (
                      <div key={s.slot_no} className="p-3 border rounded flex justify-between items-center">
                        <div>
                          <div className="text-sm font-medium">Slot {s.slot_no} - {s.event_name || `Event ${s.event_id}`}</div>
                          <div className="text-xs text-gray-500">Assigned: {s.created_at ? new Date(s.created_at).toLocaleString() : '-'}</div>
                          <div className="text-xs text-gray-500">Attended: {s.attended ? 'Yes' : 'No'}</div>
                        </div>

                        <div className="flex gap-2">
                          {!s.attended && (
                            <button
                              className="px-3 py-1 bg-green-600 text-white rounded"
                              onClick={() => markAtt(s.slot_no)}
                              disabled={marking}
                            >
                              {marking ? 'Marking...' : 'Mark Present'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(passType === 'non-technical' || passType === 'workshop') && event && (
                <div className="mt-4">
                  <h4 className="font-semibold">Event</h4>
                  <div className="p-3 border rounded">
                    <div className="text-sm font-medium">{event.event_name}</div>
                    <div className="text-xs text-gray-500">Type: {event.event_type}</div>
                    <div className="text-xs text-gray-500">Attended: {event.attended ? 'Yes' : 'No'}</div>
                    
                    {!event.attended && (
                      <button
                        className="mt-2 px-3 py-1 bg-green-600 text-white rounded"
                        onClick={() => markAtt()}
                        disabled={marking}
                      >
                        {marking ? 'Marking...' : 'Mark Present'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {passType === 'hackathon' && (
                <div className="mt-4">
                  <h4 className="font-semibold">Hackathon Team</h4>
                  <div className="p-3 border rounded mb-3">
                    <div className="text-sm font-medium">Team: {pass.team_name}</div>
                    <div className="text-xs text-gray-500">Track: {pass.track}</div>
                    <div className="text-xs text-gray-500">Attended: {pass.attended ? 'Yes' : 'No'}</div>
                    
                    {!pass.attended && (
                      <button
                        className="mt-2 px-3 py-1 bg-green-600 text-white rounded"
                        onClick={() => markAtt()}
                        disabled={marking}
                      >
                        {marking ? 'Marking...' : 'Mark Present'}
                      </button>
                    )}
                  </div>
                  
                  <h5 className="font-medium mb-2">Team Members</h5>
                  <div className="space-y-2">
                    {teamMembers.map((member, index) => (
                      <div key={index} className="p-2 border rounded text-sm">
                        <div className="font-medium">{member.full_name}</div>
                        <div className="text-xs text-gray-500">{member.email}</div>
                        {member.institution && <div className="text-xs text-gray-500">{member.institution}</div>}
                        {member.phone_number && <div className="text-xs text-gray-500">{member.phone_number}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No pass loaded</div>
          )}
        </div>
      </div>
    </div>
  )
}
