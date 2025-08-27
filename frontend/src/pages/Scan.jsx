
import React, { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import AssignSlotForm from '../components/AssignSlotForm'


export default function ScanPage(){
const { authAxios } = useAuth()
const [passId, setPassId] = useState('')
const [pass, setPass] = useState(null)
const [slots, setSlots] = useState([])
const [msg, setMsg] = useState(null)


const doScan = async (id) => {
setMsg(null)
try {
const resp = await authAxios.get(`/scan/${id}`)
setPass(resp.data.pass)
setSlots(resp.data.slots || [])
} catch(err){ setPass(null); setSlots([]); setMsg(err.response?.data?.error || String(err)) }
}


const assignSlot = async (slot_no, event_id) => {
setMsg(null)
try {
await authAxios.post(`/passes/${pass.id}/slots`, { slot_no, event_id })
await doScan(pass.id)
} catch(err){ setMsg(err.response?.data?.error || String(err)) }
}


return (
<div className="p-6">
<h2 className="text-xl font-semibold mb-4">Scan / Paste Pass ID</h2>
<div className="flex gap-2 mb-4">
<input value={passId} onChange={e => setPassId(e.target.value)} placeholder="paste passId here" className="flex-1 border p-2 rounded" />
<button onClick={() => doScan(passId)} className="px-4 py-2 bg-blue-600 text-white rounded">Scan</button>
</div>
{msg && <div className="text-red-500 mb-3">{msg}</div>}
{pass && (
<div className="bg-white p-4 rounded shadow">
<h3 className="font-semibold">Pass: {pass.id}</h3>
<p className="text-sm text-gray-600">Owner: {pass.user_email} — Payment: {pass.payment_method} — Verified: {pass.verified ? 'Yes' : 'No'}</p>


<div className="mt-4">
<h4 className="font-semibold">Slots</h4>
<div className="space-y-2">
{slots.length === 0 && <div className="text-sm text-gray-500">No slots assigned yet.</div>}
{slots.map(s => (
<div key={s.slot_no} className="p-2 border rounded flex justify-between items-center">
<div>
<div className="text-sm font-medium">Slot {s.slot_no} — {s.event_name || ('Event ID ' + s.event_id)}</div>
<div className="text-xs text-gray-500">Attended: {s.attended ? 'Yes' : 'No'}</div>
</div>
</div>
))}
</div>
</div>


<AssignSlotForm onAssign={assignSlot} />
</div>
)}
</div>
)
}