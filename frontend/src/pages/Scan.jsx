// src/pages/Scan.jsx
import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AssignSlotForm from '../components/AssignSlotForm';
import QRScanner from '../components/QRScanner';
import { 
  QrCodeIcon, 
  UserIcon, 
  CalendarIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';

/* normalizeDecoded copied from your previous file */
function normalizeDecoded(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  try {
    const u = new URL(s);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
    return s;
  } catch (e) {}
  if (s.includes('/')) {
    const parts = s.split('/').filter(Boolean);
    if (parts.length > 0) s = parts[parts.length - 1];
  }
  return s;
}

// Helper function to detect pass type from passId
function detectPassType(passId) {
  if (passId.endsWith('$t') || passId.endsWith('$T')) return 'technical';
  if (passId.endsWith('$n') || passId.endsWith('$N')) return 'non-technical';
  if (passId.endsWith('$w') || passId.endsWith('$W')) return 'workshop';
  if (passId.endsWith('$h') || passId.endsWith('$H')) return 'hackathon';
  return 'technical'; // Default for backward compatibility
}

export default function ScanPage() {
  const { authAxios } = useAuth();
  const navigate = useNavigate();
  const [passId, setPassId] = useState('');
  const [pass, setPass] = useState(null);
  const [slots, setSlots] = useState([]);
  const [event, setEvent] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [passType, setPassType] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const doScan = useCallback(async (id) => {
    if (!id) return;
    setMsg(null);
    setLoading(true);
    try {
      const resp = await authAxios.get(`/scan/${id}`);
      if (!resp || !resp.data || !resp.data.pass) {
        setPass(null);
        setSlots([]);
        setEvent(null);
        setTeamMembers([]);
        setPassType(null);
        setMsg('No pass data returned');
        setLoading(false);
        return;
      }
      
      const p = resp.data.pass;
      const type = resp.data.passType;
      setPass(p);
      setPassType(type);

      // Redirect non-technical, workshop, and hackathon passes to attendance page
      if (type === 'non-technical' || type === 'workshop' || type === 'hackathon') {
        navigate(`/attendance?passId=${encodeURIComponent(id)}`);
        return;
      }

      // Only handle technical passes on this page
      if (type === 'technical') {
        setSlots(resp.data.slots || []);
        setEvent(null);
        setTeamMembers([]);
      }
    } catch (err) {
      setPass(null);
      setSlots([]);
      setEvent(null);
      setTeamMembers([]);
      setPassType(null);
      setMsg(err?.response?.data?.error || String(err));
      console.error('doScan error', err);
    } finally {
      setLoading(false);
    }
  }, [authAxios, navigate]);

  const onQrResult = useCallback((decodedText) => {
    if (!decodedText) return;
    const normalized = normalizeDecoded(decodedText);
    setPassId(normalized);
    doScan(normalized);
  }, [doScan]);

  const assignSlot = async (slot_no, event_id) => {
    setMsg(null);
    if (!pass || !pass.pass_id) {
      setMsg('No pass loaded');
      return;
    }
    // Only allow slot assignment for technical events
    if (passType !== 'technical') {
      setMsg('Slot assignment only allowed for technical events');
      return;
    }
    try {
      await authAxios.post(`/scan/${pass.pass_id}/assign`, { slot_no, event_id });
      await doScan(pass.pass_id);
    } catch (err) {
      setMsg(err?.response?.data?.error || String(err));
      console.error('assignSlot error', err);
    }
  };

  const deleteSlot = async (slot_no) => {
    if (!pass || !pass.pass_id) {
      setMsg('No pass loaded');
      return;
    }
    // Only allow slot deletion for technical events
    if (passType !== 'technical') {
      setMsg('Slot deletion only allowed for technical events');
      return;
    }
    const confirmed = window.confirm(`Delete slot ${slot_no}? This cannot be undone.`);
    if (!confirmed) return;
    setMsg(null);
    try {
      await authAxios.delete(`/scan/${pass.pass_id}/slot/${slot_no}`);
      await doScan(pass.pass_id);
    } catch (err) {
      setMsg(err?.response?.data?.error || String(err));
      console.error('deleteSlot error', err);
    }
  };

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
            <QrCodeIcon className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Pass Scanner</h1>
          </div>
          <p className="text-gray-600">Scan QR codes or enter pass IDs to manage technical event slots</p>
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
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <button 
                  onClick={() => {
                    const normalized = normalizeDecoded(passId);
                    setPassId(normalized);
                    doScan(normalized);
                  }} 
                  disabled={loading || !passId.trim()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {loading ? 'Checking...' : 'Check ID'}
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
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
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
                    {/* Slots Section */}
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-4">
                        <CalendarIcon className="h-5 w-5 text-gray-600" />
                        <h4 className="text-lg font-semibold text-gray-900">Assigned Slots</h4>
                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">
                          {slots.length}
                        </span>
                      </div>

                      {slots.length === 0 ? (
                        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                          <CalendarIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-gray-600 font-medium">No slots assigned yet</p>
                          <p className="text-gray-500 text-sm">Use the form below to assign event slots</p>
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
                                      {s.event_name || `Event ID ${s.event_id}`}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 text-xs text-gray-600">
                                    <div className="flex items-center gap-1">
                                      {s.attended ? (
                                        <CheckCircleIcon className="h-4 w-4 text-green-600" />
                                      ) : (
                                        <XCircleIcon className="h-4 w-4 text-gray-400" />
                                      )}
                                      <span>Attended: {s.attended ? 'Yes' : 'No'}</span>
                                    </div>
                                    <div>
                                      Assigned: {s.created_at ? new Date(s.created_at).toLocaleString() : '—'}
                                    </div>
                                  </div>
                                </div>

                                {!s.attended && (
                                  <button 
                                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                                    onClick={() => deleteSlot(s.slot_no)}
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Assign Slot Form */}
                    <div className="border-t border-gray-200 pt-6">
                      <AssignSlotForm onAssign={assignSlot} existingSlots={slots} />
                    </div>
                  </div>
                )}
              </div>
            ) : !loading && !pass && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <QrCodeIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">No pass loaded</p>
                  <p className="text-gray-500 text-sm">Scan a QR code or enter a pass ID to get started</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}