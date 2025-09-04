import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/api';

export default function WorkshopRegistration() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [workshops, setWorkshops] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [formData, setFormData] = useState({
    emailID: '',
    name: '',
    phoneNumber: '',
    selectedWorkshops: []
  });

  // Fetch workshops for selection
  useEffect(() => {
    const fetchWorkshops = async () => {
      try {
        const response = await api.get('/events?department_id=11'); // WORKSHOP department ID
        setWorkshops(response.data.rows);
      } catch (err) {
        setError('Failed to load workshops');
        console.error('Error fetching workshops:', err);
      }
    };

    fetchWorkshops();
  }, []);

  const filteredWorkshops = workshops.filter(ws => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return true;
    const name = (ws.name || '').toLowerCase();
    const idStr = String(ws.external_id || '');
    return name.includes(q) || idStr.includes(q);
  });

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleWorkshopToggle = (workshopId) => {
    setFormData(prev => {
      const isSelected = prev.selectedWorkshops.includes(workshopId);
      if (isSelected) {
        return {
          ...prev,
          selectedWorkshops: prev.selectedWorkshops.filter(id => id !== workshopId)
        };
      } else {
        return {
          ...prev,
          selectedWorkshops: [...prev.selectedWorkshops, workshopId]
        };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (formData.selectedWorkshops.length === 0) {
      setError('Please select at least one workshop');
      setLoading(false);
      return;
    }

    try {
      const workshopData = formData.selectedWorkshops.map(workshopId => ({
        workshop_id: workshopId
      }));

      const response = await api.post('/workshop-registration', {
        emailID: formData.emailID,
        name: formData.name,
        phoneNumber: formData.phoneNumber,
        workshops: workshopData
      });

      alert(`Workshop registration successful! Payment ID: ${response.data.paymentId}\nAmount: ₹${response.data.amount}\nWorkshops: ${response.data.workshopCount}`);
      
      // Reset form
      setFormData({
        emailID: '',
        name: '',
        phoneNumber: '',
        selectedWorkshops: []
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Workshop registration failed');
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = formData.selectedWorkshops.reduce((sum, id) => {
    const ws = workshops.find(w => w.external_id === id);
    const fallback = Number(import.meta.env.VITE_WORKSHOP_PRICE || 300);
    return sum + Number((ws && ws.cost != null) ? ws.cost : fallback);
  }, 0);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Workshop Registration</h1>
      
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

        {/* Workshop Selection */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-4">Select Workshops</h2>
          <div className="mb-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search workshops by name or ID"
              className="w-full p-2 border rounded"
            />
          </div>
          
          {filteredWorkshops.length === 0 ? (
            <div className="text-gray-500">No workshops available</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredWorkshops.map(workshop => (
                <div key={workshop.external_id} className="border rounded p-3">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.selectedWorkshops.includes(workshop.external_id)}
                      onChange={() => handleWorkshopToggle(workshop.external_id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{workshop.name}</div>
                      <div className="text-sm text-gray-500">ID: {workshop.external_id}</div>
                      <div className="text-sm text-gray-500">₹{workshop.cost ?? Number(import.meta.env.VITE_WORKSHOP_PRICE || 300)}</div>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}<br />Try reloading/logging out and back in
          </div>
        )}

        <div className="flex justify-between items-center">
          <div className="text-lg font-semibold">
            Total Amount: ₹{totalAmount.toFixed(2)}
          </div>
          <button
            type="submit"
            disabled={loading || formData.selectedWorkshops.length === 0}
            className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Submit Registration'}
          </button>
        </div>
      </form>

      <div className="mt-4 text-sm text-gray-600">
        Selected Workshops: {formData.selectedWorkshops.length}
      </div>
    </div>
  );
}
