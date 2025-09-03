import React, { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function SuperAdminDump() {
  const { authAxios, user } = useAuth()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setErr(null)
      try {
        const resp = await authAxios.get('/admin/dump')
        setData(resp.data?.tables || {})
      } catch (e) {
        setErr(e?.response?.data?.error || String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [authAxios])

  if (!user || user.role !== 'super_admin') {
    return <div className="p-6">Forbidden</div>
  }

  if (loading) return <div className="p-6">Loading...</div>
  if (err) return <div className="p-6 text-red-500">Error: {err}</div>

  const tableOrder = [
    'admins','users','departments','events','receipts','passes','slots','hack_passes','hack_reg_details'
  ]

  const tables = tableOrder.filter(t => data[t]).concat(Object.keys(data).filter(t => !tableOrder.includes(t)))

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Super Admin — Database Viewer</h2>

      {tables.map(name => (
        <div key={name} className="mb-8 bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">{name}</h3>
          {Array.isArray(data[name]) ? (
            data[name].length === 0 ? (
              <div className="text-sm text-gray-500">(empty)</div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      {Object.keys(data[name][0]).map(col => (
                        <th key={col} className="pb-2 pr-4">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data[name].map((row, idx) => (
                      <tr key={idx} className="border-t">
                        {Object.keys(data[name][0]).map(col => (
                          <td key={col} className="py-1 pr-4 align-top">
                            {row[col] === null || typeof row[col] === 'undefined' ? '—' : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="text-sm text-red-500">{data[name]?.error || 'Unknown format'}</div>
          )}
        </div>
      ))}
    </div>
  )
}


