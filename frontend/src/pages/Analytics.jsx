import React, { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

function fmt(n) {
  if (n === null || n === undefined) return '-'
  return n.toLocaleString()
}

// tiny sparkline component (SVG) - expects array of { day: 'YYYY-MM-DD', count: N }
function Sparkline({ data, width = 200, height = 40 }) {
  if (!data || data.length === 0) return <div className="text-sm text-gray-500">No data</div>

  const counts = data.map(d => d.count)
  const max = Math.max(...counts)
  const min = Math.min(...counts)
  // pad range a little
  const range = Math.max(1, max - min)

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d.count - min) / range) * (height - 4) - 2 // small padding
    return `${x},${y}`
  }).join(' ')

  // small grid: 3 vertical ticks
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block">
      <polyline
        fill="none"
        stroke="#10B981"
        strokeWidth="2"
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* dots */}
      {data.map((d, i) => {
        const x = (i / (data.length - 1)) * width
        const y = height - ((d.count - min) / range) * (height - 4) - 2
        return <circle key={i} cx={x} cy={y} r={1.4} fill="#065f46" />
      })}
    </svg>
  )
}

export default function AnalyticsPage() {
  const { authAxios, user } = useAuth()
  const [stats, setStats] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      setErr(null)
      try {
        if (user?.role === 'dept_admin') {
          // department_id should be present in JWT payload
          const id = user.department_id
          const resp = await authAxios.get(`/analytics/department/${id}`)
          setStats({ scope: 'department', data: resp.data })
        } else {
          // super_admin or others (route protected - only super_admin should reach here)
          const resp = await authAxios.get('/analytics/college')
          setStats({ scope: 'college', data: resp.data })
        }
      } catch (e) {
        setErr(e.response?.data?.error || String(e))
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [authAxios, user])

  if (loading) return <div className="p-6">Loading analytics...</div>
  if (err) return <div className="p-6 text-red-500">Error: {err}<br />Try reloading/logging out and back in</div>
  if (!stats) return <div className="p-6">No analytics available</div>

  // Department view
  if (stats.scope === 'department') {
    const d = stats.data
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Department analytics — {d.department?.name}</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-white rounded shadow">
            <div className="text-sm text-gray-500">Total events</div>
            <div className="text-2xl font-semibold mt-2">{fmt(d.total_events)}</div>
          </div>
          <div className="p-4 bg-white rounded shadow">
            <div className="text-sm text-gray-500">Registrations (slots)</div>
            <div className="text-2xl font-semibold mt-2">{fmt(d.total_registrations)}</div>
            <div className="text-xs text-gray-500">Attended: {fmt(d.total_attendance)}</div>
          </div>
          <div className="p-4 bg-white rounded shadow">
            <div className="text-sm text-gray-500">Passes by payment</div>
            <div className="mt-2 space-y-1">
              {d.passes_by_payment && d.passes_by_payment.length ? d.passes_by_payment.map(p => (
                <div key={p.payment_method} className="flex justify-between text-sm">
                  <div>{p.payment_method}</div>
                  <div>{p.total_passes} ({p.verified_passes} verified)</div>
                </div>
              )) : <div className="text-sm text-gray-500">No data</div>}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-2">Per-event breakdown</h3>
            <div className="text-sm text-gray-600 mb-2">Registrations & attendance per event</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="pb-2">Event</th>
                  <th className="pb-2">Registrations</th>
                  <th className="pb-2">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {d.per_event.map(ev => (
                  <tr key={ev.event_id} className="border-t">
                    <td className="py-2">{ev.event_name}</td>
                    <td className="py-2">{fmt(ev.registrations)}</td>
                    <td className="py-2">{fmt(ev.attendance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-2">Registrations (last 30 days)</h3>
            <div className="text-sm text-gray-500 mb-2">Daily registrations for department</div>
            <div className="mb-2"><Sparkline data={d.registrations_over_time} /></div>
            <div className="text-xs text-gray-500">Showing last 30 days</div>

            <div className="mt-4">
              <h4 className="font-semibold text-sm mb-2">Top event by registrations</h4>
              {d.top_event_by_registrations ? (
                <div className="text-sm">{d.top_event_by_registrations.event_name} — {d.top_event_by_registrations.registrations} regs</div>
              ) : <div className="text-sm text-gray-500">No data</div>}
              <h4 className="font-semibold text-sm mt-3 mb-2">Top event by attendance</h4>
              {d.top_event_by_attendance ? (
                <div className="text-sm">{d.top_event_by_attendance.event_name} — {d.top_event_by_attendance.attendance} attended</div>
              ) : <div className="text-sm text-gray-500">No data</div>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // College view (super_admin)
  const c = stats.data
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">College analytics</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded shadow">
          <div className="text-sm text-gray-500">Departments</div>
          <div className="text-2xl font-semibold mt-2">{fmt(c.totals.total_departments)}</div>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <div className="text-sm text-gray-500">Events</div>
          <div className="text-2xl font-semibold mt-2">{fmt(c.totals.total_events)}</div>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <div className="text-sm text-gray-500">Registrations (slots)</div>
          <div className="text-2xl font-semibold mt-2">{fmt(c.totals.total_registrations)}</div>
          <div className="text-xs text-gray-500">Attended: {fmt(c.totals.total_attendance)}</div>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <div className="text-sm text-gray-500">Passes by payment</div>
          <div className="mt-2 space-y-1 text-sm">
            {c.passes_by_payment && c.passes_by_payment.length ? c.passes_by_payment.map(p => (
              <div key={p.payment_method} className="flex justify-between">
                <div>{p.payment_method}</div>
                <div>{p.total_passes} ({p.verified_passes} verified)</div>
              </div>
            )) : <div className="text-sm text-gray-500">No data</div>}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Registrations over time</h3>
          <div className="text-sm text-gray-500 mb-2">Daily registrations (last 30 days)</div>
          <div className="mb-2"><Sparkline data={c.registrations_over_time} width={400} /></div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Top departments by registrations</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-2">Department</th>
                <th className="pb-2">Registrations</th>
                <th className="pb-2">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {c.per_department.map(dpt => (
                <tr key={dpt.department_id} className="border-t">
                  <td className="py-2">{dpt.department_name}</td>
                  <td className="py-2">{fmt(dpt.registrations)}</td>
                  <td className="py-2">{fmt(dpt.attendance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 bg-white p-4 rounded shadow">
        <h3 className="font-semibold mb-2">Top events</h3>
        <div className="text-sm text-gray-500 mb-2">Most-registered events across the college</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="pb-2">Event</th>
              <th className="pb-2">Department</th>
              <th className="pb-2">Registrations</th>
              <th className="pb-2">Attendance</th>
            </tr>
          </thead>
          <tbody>
            {c.top_events.map(ev => (
              <tr key={ev.event_id} className="border-t">
                <td className="py-2">{ev.event_name}</td>
                <td className="py-2">{ev.department_name}</td>
                <td className="py-2">{fmt(ev.registrations)}</td>
                <td className="py-2">{fmt(ev.attendance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
