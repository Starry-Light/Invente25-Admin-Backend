// src/pages/Scan.jsx
import React, { useCallback, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import AssignSlotForm from '../components/AssignSlotForm';
import QRScanner from '../components/QRScanner';

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

export default function ScanPage() {
  const { authAxios } = useAuth();
  const [passId, setPassId] = useState('');
  const [pass, setPass] = useState(null);
  const [slots, setSlots] = useState([]);
  const [msg, setMsg] = useState(null);

  const doScan = useCallback(async (id) => {
    if (!id) return;
    setMsg(null);
    try {
      const resp = await authAxios.get(`/scan/${id}`);
      if (!resp || !resp.data || !resp.data.pass) {
        setPass(null);
        setSlots([]);
        setMsg('No pass data returned');
        return;
      }
      setPass(resp.data.pass);
      setSlots(resp.data.slots || []);
    } catch (err) {
      setPass(null);
      setSlots([]);
      setMsg(err?.response?.data?.error || String(err));
      console.error('doScan error', err);
    }
  }, [authAxios]);

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

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Scan / Paste Pass ID</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div>
          <div className="flex gap-2 mb-2">
            <input value={passId} onChange={e => setPassId(e.target.value)} placeholder="paste passId here" className="flex-1 border p-2 rounded" />
            <button onClick={() => {
              const normalized = normalizeDecoded(passId);
              setPassId(normalized);
              doScan(normalized);
            }} className="px-4 py-2 bg-blue-600 text-white rounded">Check ID</button>
          </div>
          <div className="text-sm text-gray-500 mb-2">Or use your device camera below to scan QR</div>
          <QRScanner onResult={onQrResult} stopOnResult={true} />
        </div>

        <div>
          {msg && <div className="text-red-500 mb-3">{msg}</div>}
          {pass ? (
            <div className="bg-white p-4 rounded shadow">
              <h3 className="font-semibold break-words">Pass: {pass.pass_id}</h3>
              <p className="text-sm text-gray-600">Owner: {pass.user_email || '—'}</p>

              <div className="mt-4">
                <h4 className="font-semibold">Slots</h4>
                <div className="space-y-2 mt-2">
                  {slots.length === 0 && <div className="text-sm text-gray-500">No slots assigned yet.</div>}
                  {slots.map(s => (
                    <div key={s.slot_no} className="p-2 border rounded flex justify-between items-center">
                      <div>
                        <div className="text-sm font-medium">Slot {s.slot_no} — {s.event_name || `Event ID ${s.event_id}`}</div>
                        <div className="text-xs text-gray-500">Attended: {s.attended ? 'Yes' : 'No'}</div>
                        <div className="text-xs text-gray-400">Assigned: {s.assigned_at ? new Date(s.assigned_at).toLocaleString() : '-'}</div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          className="px-3 py-1 bg-red-600 text-white rounded"
                          onClick={() => deleteSlot(s.slot_no)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <AssignSlotForm onAssign={assignSlot} existingSlots={slots} />
            </div>
          ) : (
            <div className="text-sm text-gray-500">No pass loaded</div>
          )}
        </div>
      </div>
    </div>
  );
}
