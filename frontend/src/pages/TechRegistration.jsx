import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/api';

export default function TechRegistration() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    emailID: '',
    name: '',
    phoneNumber: '',
    passes: [{ slots: {} }]
  });

  // Fetch only technical events for dropdowns
  useEffect(() => {
    api.get('/events')
      .then(res => {
        const allEvents = res.data.rows || [];
        // Filter to only show technical events
        const technicalEvents = allEvents.filter(event => event.event_type === 'technical');
        setEvents(technicalEvents);
      })
      .catch(err => setError('Failed to load events'));
  }, []);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const addPass = () => {
    setFormData({
      ...formData,
      passes: [...formData.passes, { slots: {} }]
    });
  };

  const updateSlot = (passIndex, slotNo, eventId) => {
    const newPasses = [...formData.passes];
    if (!eventId) {
      delete newPasses[passIndex].slots[slotNo];
    } else {
      newPasses[passIndex].slots[slotNo] = parseInt(eventId);
    }
    setFormData({
      ...formData,
      passes: newPasses
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/tech-registration', formData);
      // we won't get paymentID from response. we'll just insert it from here.

      alert(`Registration successful!`);
      // Reset form
      setFormData({
        emailID: '',
        name: '',
        phoneNumber: '',
        passes: [{ slots: {} }]
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Tech Registration</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Participant Details */}
        <div className="bg-white p-4 rounded shadow space-y-4">
          <h2 className="text-lg font-semibold">Participant Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                name="emailID"
                value={formData.emailID}
                onChange={handleInputChange}
                required
                className="w-full p-2 border rounded"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full p-2 border rounded"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number</label>
              <input
                type="tel"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                required
                className="w-full p-2 border rounded"
              />
            </div>
          </div>
        </div>

        {/* Passes */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Passes</h2>
            <button
              type="button"
              onClick={addPass}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Add Pass
            </button>
          </div>

          {formData.passes.map((pass, passIndex) => (
            <div key={passIndex} className="bg-white p-4 rounded shadow">
              <h3 className="font-medium mb-3">Pass {passIndex + 1}</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(slotNo => (
                  <div key={slotNo}>
                    <label className="block text-sm font-medium mb-1">
                      Slot {slotNo}
                    </label>
                    <select
                      value={pass.slots[slotNo] || ''}
                      onChange={(e) => updateSlot(passIndex, slotNo, e.target.value)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Select Event</option>
                      {events.map(event => (
                        <option key={event.external_id} value={event.external_id}>
                          {event.name} ({event.department_name})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}<br />Try reloading/logging out and back in
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Submit Registration'}
          </button>
        </div>
      </form>

      <div className="mt-4 text-sm text-gray-600">
        {(() => {
          const unit = Number(import.meta.env.VITE_TECH_PASS_PRICE || 300);
          return `Total Amount: ₹${(formData.passes.length * unit).toFixed(2)}`;
        })()}
      </div>
    </div>
  );
}
