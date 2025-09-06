import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/api';
import RegistrationSuccess from '../components/RegistrationSuccess';
import { 
  UserIcon, 
  EnvelopeIcon, 
  PhoneIcon, 
  CalendarDaysIcon, 
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CurrencyRupeeIcon,
  BuildingOffice2Icon,
  HashtagIcon,
  CheckCircleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

export default function NonTechRegistration() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [submissionResult, setSubmissionResult] = useState(null);

  const initialFormData = {
    emailID: '',
    name: '',
    phoneNumber: '',
    selectedEventId: null
  };

  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await api.get('/events');
        const allEvents = response.data.rows;
        let filteredEvents = allEvents.filter(event => event.event_type === 'non-technical');
        
        if (user?.role === 'dept_admin' || (user?.role === 'volunteer' && user?.department_id)) {
          filteredEvents = filteredEvents.filter(event => event.department_id === user.department_id);
        }
        
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
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleEventChange = (eventId) => {
    setFormData(prev => ({ ...prev, selectedEventId: eventId }));
  };

  const selectedEvent = formData.selectedEventId ? events.find(e => e.external_id === formData.selectedEventId) : null;
  const fallbackPrice = Number(import.meta.env.VITE_NON_TECH_DEFAULT_PRICE || 300);
  const totalAmount = selectedEvent
    ? (Number(selectedEvent.cost) || fallbackPrice)
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!formData.selectedEventId) {
      setError('Please select an event');
      setLoading(false);
      return;
    }

    try {
      const eventData = [{ event_id: formData.selectedEventId }];

      await api.post('/non-tech-registration', {
        emailID: formData.emailID,
        name: formData.name,
        phoneNumber: formData.phoneNumber,
        events: eventData
      });

      const registeredItemsDetails = selectedEvent ? [{
        name: selectedEvent.name,
        cost: selectedEvent.cost ?? fallbackPrice,
        external_id: selectedEvent.external_id
      }] : [];

      setSubmissionResult({
        details: { ...formData },
        registeredItems: registeredItemsDetails,
        totalAmount: totalAmount
      });

    } catch (err) {
      setError(err.response?.data?.error || 'Non-tech registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNewRegistration = () => {
    setFormData(initialFormData);
    setSubmissionResult(null);
    setError(null);
    setSearch('');
  };

  if (submissionResult) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <RegistrationSuccess
            details={submissionResult.details}
            registeredItems={submissionResult.registeredItems}
            totalAmount={submissionResult.totalAmount}
            onNewRegistration={handleNewRegistration}
            type="Event"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <SparklesIcon className="h-8 w-8 text-purple-600" />
            <h1 className="text-3xl font-bold text-gray-900">Non-Technical Event Registration</h1>
          </div>
          <p className="text-gray-600">Register for exciting non-technical events and competitions</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Participant Details */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 p-6">
              <div className="flex items-center gap-2">
                <UserIcon className="h-6 w-6 text-gray-600" />
                <h2 className="text-xl font-semibold text-gray-900">Participant Details</h2>
              </div>
              <p className="text-gray-600 text-sm mt-1">Please provide your information</p>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <EnvelopeIcon className="h-4 w-4" />
                    Email Address
                  </label>
                  <input 
                    type="email" 
                    name="emailID" 
                    value={formData.emailID} 
                    onChange={handleInputChange} 
                    required 
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                    placeholder="Enter your email address"
                  />
                </div>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <UserIcon className="h-4 w-4" />
                    Full Name
                  </label>
                  <input 
                    type="text" 
                    name="name" 
                    value={formData.name} 
                    onChange={handleInputChange} 
                    required 
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                    placeholder="Enter your full name"
                  />
                </div>
                
                <div className="md:col-span-1">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <PhoneIcon className="h-4 w-4" />
                    Phone Number
                  </label>
                  <input 
                    type="tel" 
                    name="phoneNumber" 
                    value={formData.phoneNumber} 
                    onChange={handleInputChange} 
                    required 
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                    placeholder="Enter your phone number"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Event Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-2">
                <CalendarDaysIcon className="h-6 w-6 text-gray-600" />
                <h2 className="text-xl font-semibold text-gray-900">Select Event</h2>
              </div>
              <p className="text-gray-600 text-sm">Choose one non-technical event to participate in</p>
            </div>

            <div className="p-6">
              {/* Search Bar */}
              <div className="relative mb-6">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input 
                  type="text" 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  placeholder="Search events by name, department, or ID..." 
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Events Grid */}
              {filteredEvents.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <CalendarDaysIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium mb-1">No events available</p>
                  <p className="text-gray-500 text-sm">No non-technical events match your search criteria</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredEvents.map(event => (
                    <div 
                      key={event.external_id} 
                      className={`relative border rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                        formData.selectedEventId === event.external_id 
                          ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200' 
                          : 'border-gray-200 hover:border-purple-300 hover:bg-purple-25'
                      }`}
                      onClick={() => handleEventChange(event.external_id)}
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="event-selection"
                          checked={formData.selectedEventId === event.external_id}
                          onChange={() => handleEventChange(event.external_id)}
                          className="mt-1 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 mb-2">{event.name}</div>
                          
                          <div className="space-y-1 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <HashtagIcon className="h-3 w-3" />
                              <span>ID: {event.external_id}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <BuildingOffice2Icon className="h-3 w-3" />
                              <span>{event.department_name}</span>
                            </div>
                            <div className="flex items-center gap-1 text-green-600 font-medium">
                              <CurrencyRupeeIcon className="h-3 w-3" />
                              <span>{event.cost ?? fallbackPrice}</span>
                            </div>
                          </div>
                        </div>
                        
                        {formData.selectedEventId === event.external_id && (
                          <CheckCircleIcon className="h-5 w-5 text-purple-600 flex-shrink-0" />
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-800 font-medium">Registration Error</p>
                  <p className="text-red-700 text-sm mt-1">{error}</p>
                  <p className="text-red-600 text-xs mt-2">Try reloading or logging out and back in</p>
                </div>
              </div>
            </div>
          )}

          {/* Summary & Submit */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                  <CurrencyRupeeIcon className="h-6 w-6" />
                  Total Amount: {totalAmount.toFixed(2)}
                </div>
                {selectedEvent && (
                  <p className="text-sm text-gray-600 mt-1">
                    Registration fee for {selectedEvent.name}
                  </p>
                )}
              </div>
              
              <button
                type="submit"
                disabled={loading || !formData.selectedEventId}
                className={`
                  px-8 py-3 rounded-lg font-semibold text-white transition-all duration-200 focus:ring-4 focus:ring-offset-2
                  ${loading || !formData.selectedEventId 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500 active:scale-95'
                  }
                `}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Processing...
                  </div>
                ) : (
                  'Submit Registration'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}