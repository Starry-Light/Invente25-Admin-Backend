import React, { useState } from 'react'
import { useAuth } from '../hooks/useAuth'


export default function AttendancePage(){
const { authAxios, user } = useAuth()
const [passId, setPassId] = useState('')
const [slots, setSlots] = useState([])
const [msg, setMsg] = useState(null)


const load = async (id) => {
setMsg(null)
try {
const resp = await authAxios.get(`/scan/${id}`)
// filter slots to only those events that this admin is allowed to mark
const all = resp.data.slots || []
// if the admin is event_admin, restrict to their department events
// backend includes department_id in slot objects, so we can filter here
const visible = all.filter(s => {
if (!user) return false
if (user.role === 'super_admin' || user.role === 'dept_admin') return true
if (user.role === 'event_admin') {
// event_admin should only be able to mark events in their department
return s.department_id === user.department_id
}
return false
})
setSlots(visible)
} catch(err){ setMsg(err.response?.data?.error || String(err)); setSlots([]) }
}


const markAtt = async (event_id, attended) => {
try {
await authAxios.post(`/passes/${passId}/attendance`, { event_id, attended })
await load(passId)
} catch(err){ setMsg(err.response?.data?.error || String(err)) }
}


return (
<div className="p-6">
<h2 className="text-xl font-semibold mb-4">Mark Attendance</h2>
<div className="flex gap-2 mb-4">
<input value={passId} onChange={e=>setPassId(e.target.value)} placeholder="paste passId here" className="flex-1 border p-2 rounded" />
<button onClick={()=>load(passId)} className="px-4 py-2 bg-blue-600 text-white rounded">Load</button>
</div>


{msg && <div className="text-red-500 mb-3">{msg}</div>}
<div className="space-y-2">
{slots.map(s => (
<div key={s.slot_no} className="p-3 bg-white rounded flex justify-between items-center">
<div>
<div className="font-medium">Slot {s.slot_no} - {s.event_name || s.event_id}</div>
<div className="text-sm text-gray-500">Attended: {s.attended ? 'Yes' : 'No'}</div>
</div>
<div className="flex gap-2">
{!s.attended && <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={()=>markAtt(s.event_id, true)}>Mark Present</button>}
{s.attended && <button className="px-3 py-1 bg-yellow-600 text-white rounded" onClick={()=>markAtt(s.event_id, false)}>Unmark</button>}
</div>
</div>
))}
</div>
</div>
)
}