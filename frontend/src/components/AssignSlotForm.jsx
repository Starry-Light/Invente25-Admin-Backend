import React, { useState } from "react";
export default function AssignSlotForm({ onAssign }) {
  const [slotNo, setSlotNo] = useState(1);
  const [eventId, setEventId] = useState("1");
  return (
    <div className="mt-4 border-t pt-4">
      <h4 className="font-semibold mb-2">Assign a slot</h4>
      <div className="flex gap-2 items-end">
        <div>
          <label className="block text-xs">Slot no</label>
          <input
            type="number"
            value={slotNo}
            onChange={(e) => setSlotNo(Number(e.target.value))}
            min={1}
            max={4}
            className="border p-1 rounded w-24"
          />
        </div>
        <div>
          <label className="block text-xs">Event ID</label>
          <input
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="border p-1 rounded w-36"
          />
        </div>
        <div>
          <button
            className="px-3 py-1 bg-green-600 text-white rounded"
            onClick={() => onAssign(slotNo, Number(eventId))}
          >
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}
