import React, { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'


export default function AnalyticsPage(){
const { authAxios, user } = useAuth()
const [stats, setStats] = useState(null)
const [err, setErr] = useState(null)


useEffect(()=>{
const fetch = async ()=>{
try{
if (user?.role === 'dept_admin'){
const resp = await authAxios.get(`/analytics/department/${user.department_id}`)
setStats(resp.data)
} else {
const resp = await authAxios.get('/analytics/college')
setStats(resp.data)
}
} catch(e){ setErr(e.response?.data?.error || String(e)) }
}
fetch()
}, [])


if (err) return <div className="p-6 text-red-500">{err}</div>
if (!stats) return <div className="p-6">Loading...</div>
return (
<div className="p-6">
<h2 className="text-xl font-semibold mb-4">Analytics</h2>
<pre className="bg-white p-4 rounded shadow"><code>{JSON.stringify(stats, null, 2)}</code></pre>
</div>
)
}