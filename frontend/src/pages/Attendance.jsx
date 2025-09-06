// src/pages/Attendance.jsx
import React, { useCallback, useRef, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import QRScanner from '../components/QRScanner'
import { 
  UserGroupIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  UserIcon,
  PhoneIcon,
  AcademicCapIcon,
  ClipboardDocumentListIcon,
  QrCodeIcon
} from '@heroicons/react/24/outline'

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
    // For hackathon passes, use team_id; for others, use pass_id
    const identifier = passType === 'hackathon' ? pass?.team_id : pass?.pass_id;
    
    if (!pass || !identifier) {
      setMsg('No pass loaded')
      return
    }
    setMsg(null)
    setMarking(true)
    try {
      const payload = slot_no ? { slot_no } : {}
      await authAxios.post(`/scan/${identifier}/attend`, payload)
      // reload for latest state
      await load(identifier)
    } catch (err) {
      setMsg(err?.response?.data?.error || String(err))
      console.error('markAtt error', err)
    } finally {
      setMarking(false)
    }
  }

  const getPassTypeColor = (type) => {
    switch (type) {
      case 'technical': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'non-technical': return 'bg-green-100 text-green-800 border-green-200';
      case 'workshop': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'hackathon': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircleIcon className="h-8 w-8 text-green-600" />
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Mark Attendance</h1>
          </div>
          <p className="text-gray-600">Scan passes to mark attendance for events and activities</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Left Column - Scanner */}
          <div className="space-y-6">
            {/* Manual Input Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardDocumentListIcon className="h-5 w-5 text-gray-600" />
                <h2 className="text-lg font-semibold text-gray-900">Manual Entry</h2>
              </div>
              
              <div className="flex gap-3">
                <input
                  value={passId}
                  onChange={e => setPassId(e.target.value)}
                  placeholder="Enter pass ID here..."
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                />
                <button
                  onClick={() => {
                    const normalized = normalizeDecoded(passId)
                    setPassId(normalized)
                    load(normalized)
                  }}
                  disabled={loading || !passId.trim()}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  {loading ? 'Loading...' : 'Load'}
                </button>
              </div>
            </div>

            {/* QR Scanner Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <QrCodeIcon className="h-5 w-5 text-gray-600" />
                <h2 className="text-lg font-semibold text-gray-900">QR Scanner</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">Use your device camera to scan QR codes</p>
              
              <QRScanner onResult={onQrResult} stopOnResult={true} />
            </div>
          </div>

          {/* Right Column - Results */}
          <div className="space-y-6">
            {/* Error Message */}
            {msg && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-800 font-medium">Error</p>
                    <p className="text-red-700 text-sm mt-1">{msg}</p>
                    <p className="text-red-600 text-xs mt-2">Try reloading or logging out and back in</p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <div className="flex flex-col items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mb-3"></div>
                  <p className="text-gray-600">Loading pass information...</p>
                </div>
              </div>
            )}

            {/* Pass Information */}
            {pass && !loading ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Pass Header */}
                <div className="border-b border-gray-200 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <UserIcon className="h-5 w-5 text-gray-600" />
                        <h3 className="text-lg font-semibold text-gray-900 break-all">
                          {pass.pass_id}
                        </h3>
                      </div>
                      <p className="text-gray-600 mb-2">
                        <span className="font-medium">Owner:</span> {pass.user_email || pass.leader_email || '—'}
                      </p>
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getPassTypeColor(passType)}`}>
                        {passType?.charAt(0).toUpperCase() + passType?.slice(1) || 'Unknown'} Pass
                      </div>
                    </div>
                  </div>
                </div>

                {/* Technical Pass Content */}
                {passType === 'technical' && (
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <CalendarIcon className="h-5 w-5 text-gray-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Event Slots</h4>
                      <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">
                        {slots.length}
                      </span>
                    </div>

                    {slots.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <CalendarIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 font-medium">No slots visible</p>
                        <p className="text-gray-500 text-sm">No slots for this pass or none belong to your department</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {slots.map(s => (
                          <div key={s.slot_no} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="bg-white px-2 py-1 rounded text-sm font-semibold text-gray-700 border">
                                    Slot {s.slot_no}
                                  </span>
                                  <span className="text-sm font-medium text-gray-900">
                                    {s.event_name || `Event ${s.event_id}`}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-4 text-xs text-gray-600 mb-3">
                                  <div>
                                    Assigned: {s.created_at ? new Date(s.created_at).toLocaleString() : '—'}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {s.attended ? (
                                    <div className="flex items-center gap-1 text-green-700 bg-green-100 px-2 py-1 rounded-full text-xs font-medium">
                                      <CheckCircleIcon className="h-4 w-4" />
                                      Present
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-1 rounded-full text-xs font-medium">
                                      <XCircleIcon className="h-4 w-4" />
                                      Not Marked
                                    </div>
                                  )}
                                </div>
                              </div>

                              {!s.attended && (
                                <button
                                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:bg-gray-400"
                                  onClick={() => markAtt(s.slot_no)}
                                  disabled={marking}
                                >
                                  <CheckCircleIcon className="h-4 w-4" />
                                  {marking ? 'Marking...' : 'Mark Present'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Non-technical/Workshop Event Content */}
                {(passType === 'non-technical' || passType === 'workshop') && event && (
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <CalendarIcon className="h-5 w-5 text-gray-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Event Details</h4>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h5 className="font-semibold text-gray-900 mb-2">{event.event_name}</h5>
                          <div className="space-y-1 text-sm text-gray-600 mb-3">
                            <div>Type: {event.event_type}</div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {event.attended ? (
                              <div className="flex items-center gap-1 text-green-700 bg-green-100 px-2 py-1 rounded-full text-xs font-medium">
                                <CheckCircleIcon className="h-4 w-4" />
                                Present
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-1 rounded-full text-xs font-medium">
                                <XCircleIcon className="h-4 w-4" />
                                Not Marked
                              </div>
                            )}
                          </div>
                        </div>

                        {!event.attended && (
                          <button
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:bg-gray-400"
                            onClick={() => markAtt()}
                            disabled={marking}
                          >
                            <CheckCircleIcon className="h-4 w-4" />
                            {marking ? 'Marking...' : 'Mark Present'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Hackathon Content */}
                {passType === 'hackathon' && (
                  <div className="p-6">
                    {/* Team Info */}
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-4">
                        <UserGroupIcon className="h-5 w-5 text-gray-600" />
                        <h4 className="text-lg font-semibold text-gray-900">Team Information</h4>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mb-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h5 className="font-semibold text-gray-900 mb-2">{pass.team_name}</h5>
                            <div className="space-y-1 text-sm text-gray-600 mb-3">
                              <div>Track: {pass.track}</div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {pass.attended ? (
                                <div className="flex items-center gap-1 text-green-700 bg-green-100 px-2 py-1 rounded-full text-xs font-medium">
                                  <CheckCircleIcon className="h-4 w-4" />
                                  Present
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-1 rounded-full text-xs font-medium">
                                  <XCircleIcon className="h-4 w-4" />
                                  Not Marked
                                </div>
                              )}
                            </div>
                          </div>

                          {!pass.attended && (
                            <button
                              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:bg-gray-400"
                              onClick={() => markAtt()}
                              disabled={marking}
                            >
                              <CheckCircleIcon className="h-4 w-4" />
                              {marking ? 'Marking...' : 'Mark Present'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Team Members */}
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <UserIcon className="h-5 w-5 text-gray-600" />
                        <h5 className="font-medium text-gray-900">Team Members</h5>
                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">
                          {teamMembers.length}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {teamMembers.map((member, index) => (
                          <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <div className="font-medium text-gray-900 mb-1">{member.full_name}</div>
                            <div className="space-y-1 text-xs text-gray-600">
                              <div className="flex items-center gap-1">
                                <UserIcon className="h-3 w-3" />
                                {member.email}
                              </div>
                              {member.institution && (
                                <div className="flex items-center gap-1">
                                  <AcademicCapIcon className="h-3 w-3" />
                                  {member.institution}
                                </div>
                              )}
                              {member.phone_number && (
                                <div className="flex items-center gap-1">
                                  <PhoneIcon className="h-3 w-3" />
                                  {member.phone_number}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : !loading && !pass && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <CheckCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">No pass loaded</p>
                  <p className="text-gray-500 text-sm">Scan a QR code or enter a pass ID to mark attendance</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}