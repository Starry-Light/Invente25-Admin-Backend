import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/api';

export default function NonTechRegistration() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [formData, setFormData] = useState({
    emailID: '',
    name: '',
    phoneNumber: '',
    selectedEvents: []
  });

  // Fetch non-technical events for selection
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        // Fetch all events and filter for non-technical ones
        const response = await api.get('/events');
        const allEvents = response.data.rows;
        
        // Filter for non-technical events based on user role
        let filteredEvents = allEvents.filter(event => event.event_type === 'non-technical');
        
        // Apply department filtering based on user role
        if (user?.role === 'dept_admin' || (user?.role === 'volunteer' && user?.department_id)) {
          // Department-specific users only see their department's events
          filteredEvents = filteredEvents.filter(event => event.department_id === user.department_id);
        }
        // Central volunteers and super admins see all non-technical events
        
        setEvents(filteredEvents);
      } catch (err) {
        setError('Failed to load non-technical events');
        console.error('Error fetching events:', err);
      }
    };

    fetchEvents();
  }, [user]);

  const filteredEvents = events.filter(ev => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return true;
    const name = (ev.name || '').toLowerCase();
    const dept = (ev.department_name || '').toLowerCase();
    const idStr = String(ev.external_id || '');
    return name.includes(q) || dept.includes(q) || idStr.includes(q);
  });

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleEventToggle = (eventId) => {
    setFormData(prev => {
      const isSelected = prev.selectedEvents.includes(eventId);
      if (isSelected) {
        return {
          ...prev,
          selectedEvents: prev.selectedEvents.filter(id => id !== eventId)
        };
      } else {
        return {
          ...prev,
          selectedEvents: [...prev.selectedEvents, eventId]
        };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (formData.selectedEvents.length === 0) {
      setError('Please select at least one event');
      setLoading(false);
      return;
    }

    try {
      const eventData = formData.selectedEvents.map(eventId => ({
        event_id: eventId
      }));

      const response = await api.post('/non-tech-registration', {
        emailID: formData.emailID,
        name: formData.name,
        phoneNumber: formData.phoneNumber,
        events: eventData
      });

      alert(`Non-technical event registration successful! Payment ID: ${response.data.paymentId}\nAmount: ₹${response.data.amount}\nEvents: ${response.data.eventCount}`);
      
      // Reset form
      setFormData({
        emailID: '',
        name: '',
        phoneNumber: '',
        selectedEvents: []
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Non-tech registration failed');
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = formData.selectedEvents.reduce((sum, id) => {
    const ev = events.find(e => e.external_id === id);
    const fallback = Number(import.meta.env.VITE_NON_TECH_DEFAULT_PRICE || 300);
    return sum + Number((ev && ev.cost != null) ? ev.cost : fallback);
  }, 0);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Non-Technical Event Registration</h1>
      
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

        {/* Event Selection */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-4">Select Non-Technical Events</h2>
          <div className="mb-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search events by name, department or ID"
              className="w-full p-2 border rounded"
            />
          </div>
          
          {filteredEvents.length === 0 ? (
            <div className="text-gray-500">No non-technical events available</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredEvents.map(event => (
                <div key={event.external_id} className="border rounded p-3">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.selectedEvents.includes(event.external_id)}
                      onChange={() => handleEventToggle(event.external_id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{event.name}</div>
                      <div className="text-sm text-gray-500">ID: {event.external_id}</div>
                      <div className="text-sm text-gray-500">Department: {event.department_name}</div>
                      <div className="text-sm text-gray-500">₹{event.cost ?? Number(import.meta.env.VITE_NON_TECH_DEFAULT_PRICE || 300)}</div>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-between items-center">
          <div className="text-lg font-semibold">
            Total Amount: ₹{totalAmount.toFixed(2)}
          </div>
          <button
            type="submit"
            disabled={loading || formData.selectedEvents.length === 0}
            className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Submit Registration'}
          </button>
        </div>
      </form>

      <div className="mt-4 text-sm text-gray-600">
        Selected Events: {formData.selectedEvents.length}
      </div>
    </div>
  );
}
