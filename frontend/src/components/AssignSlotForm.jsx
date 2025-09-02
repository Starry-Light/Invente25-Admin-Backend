// frontend/src/components/AssignSlotForm.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function AssignSlotForm({ onAssign, existingSlots = [] }) {
  const { authAxios, user } = useAuth();
  const [slotNo, setSlotNo] = useState(1);
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // compute next available slot number (smallest 1..4 not in existingSlots)
  useEffect(() => {
    const taken = new Set((existingSlots || []).map(s => Number(s.slot_no)));
    let next = 1;
    while (taken.has(next) && next <= 4) next++;
    if (next > 4) next = 4;
    setSlotNo(next);
  }, [existingSlots]);

 useEffect(() => {
  const fetchEvents = async () => {
    setLoading(true);
    setErr(null);
    try {
      // Fetch only technical events for slot assignment
      const resp = await authAxios.get(`/events`);
      const rows = resp.data.rows || [];
      // Filter to only show technical events
      const technicalEvents = rows.filter(event => event.event_type === 'technical');
      setEvents(technicalEvents);
    } catch (e) {
      console.error('fetch events error', e);
      setErr('Failed to load events');
    } finally {
      setLoading(false);
    }
  };
  fetchEvents();
}, [authAxios]);

  // event IDs already assigned to this pass
  const assignedEventIds = useMemo(() => new Set((existingSlots || []).map(s => Number(s.event_id))), [existingSlots]);

  // filter events: by search + exclude already assigned events
  const filteredEvents = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    return events
      .filter(ev => !assignedEventIds.has(Number(ev.external_id)))
      .filter(ev => {
        if (!q) return true;
        return (ev.name || '').toLowerCase().includes(q) || (ev.department_name || '').toLowerCase().includes(q);
      });
  }, [events, search, assignedEventIds]);

  // ensure default eventId is valid and picks first available when filteredEvents changes
  useEffect(() => {
    if (filteredEvents.length === 0) {
      setEventId('');
      return;
    }
    if (!eventId || !filteredEvents.find(ev => String(ev.external_id) === String(eventId))) {
      setEventId(String(filteredEvents[0].external_id));
    }
  }, [filteredEvents, eventId]);

  const handleAssign = async () => {
    setErr(null);
    if (!eventId) {
      setErr('Select an event');
      return;
    }
    if (!slotNo || slotNo < 1 || slotNo > 4) {
      setErr('Slot number must be between 1 and 4');
      return;
    }
    try {
      await onAssign(Number(slotNo), Number(eventId));
    } catch (e) {
      setErr(e?.response?.data?.error || String(e));
    }
  };

  return (
    <div className="mt-4 border-t pt-4">
      <h4 className="font-semibold mb-2">Assign a slot</h4>

      <div className="space-y-2">
        <div>
          <label className="block text-xs">Search events</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search event name or department" className="w-full border p-1 rounded" />
        </div>

        <div>
          <label className="block text-xs">Event</label>
          <select value={eventId} onChange={e => setEventId(e.target.value)} className="w-full border p-1 rounded">
            {loading && <option>Loading events...</option>}
            {!loading && filteredEvents.length === 0 && <option value="">No available events</option>}
            {!loading && filteredEvents.map(ev => (
              <option key={ev.external_id} value={ev.external_id}>
                {ev.name} {ev.department_name ? ` — ${ev.department_name}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs">Slot no</label>
            <input type="number" value={slotNo} onChange={e => setSlotNo(Number(e.target.value))} min={1} max={4} className="border p-1 rounded w-28" />
            <div className="text-xs text-gray-500">Auto picks next free slot (editable)</div>
          </div>
          <div className="flex-1">
            <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={handleAssign} disabled={!eventId || filteredEvents.length === 0}>
              Assign
            </button>
            {err && <div className="text-red-500 text-sm mt-2">{err}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
