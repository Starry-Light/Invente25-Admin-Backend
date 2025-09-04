import React, { useState } from 'react';
import api from '../api/api';

export default function ReceiptTest() {
  const [form, setForm] = useState({
    emailID: '',
    name: '',
    paymentID: '',
    phoneNumber: '',
    createdAt: '',
    eventBookingDetails: '', // JSON string
  });
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '') data.append(k, v);
      });
      if (file) data.append('image', file);

      const res = await api.post('/receipt', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Receipt OCR Test</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm">Email</label>
          <input name="emailID" value={form.emailID} onChange={handleChange} className="border p-2 w-full" />
        </div>
        <div>
          <label className="block text-sm">Name</label>
          <input name="name" value={form.name} onChange={handleChange} className="border p-2 w-full" />
        </div>
        <div>
          <label className="block text-sm">Phone</label>
          <input name="phoneNumber" value={form.phoneNumber} onChange={handleChange} className="border p-2 w-full" />
        </div>
        <div>
          <label className="block text-sm">Optional Payment ID (skip OCR if valid)</label>
          <input name="paymentID" value={form.paymentID} onChange={handleChange} className="border p-2 w-full" />
        </div>
        <div>
          <label className="block text-sm">Created At (ISO, optional)</label>
          <input name="createdAt" value={form.createdAt} onChange={handleChange} className="border p-2 w-full" placeholder="2025-08-31T22:30:00Z" />
        </div>
        <div>
          <label className="block text-sm">Event Booking Details (JSON)</label>
          <textarea name="eventBookingDetails" value={form.eventBookingDetails} onChange={handleChange} className="border p-2 w-full h-24" placeholder='[{"1":10,"2":11}]' />
        </div>
        <div>
          <label className="block text-sm">Receipt Image (jpg/png)</label>
          <input type="file" accept="image/png,image/jpeg" onChange={e => setFile(e.target.files?.[0] || null)} />
        </div>
        <button disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
          {loading ? 'Submitting...' : 'Submit'}
        </button>
      </form>
      {error && <div className="mt-4 text-red-600">Error: {error}</div>}
      {result && (
        <pre className="mt-4 p-3 bg-gray-200 overflow-auto text-sm">{JSON.stringify(result, null, 2)}</pre>
      )}
    </div>
  );
}


