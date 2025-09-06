import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/api';
import RegistrationSuccess from '../components/RegistrationSuccess';
import { 
  UserIcon, 
  EnvelopeIcon, 
  PhoneIcon, 
  CpuChipIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  CurrencyRupeeIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';

export default function TechRegistration() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [submissionResult, setSubmissionResult] = useState(null);

  const initialFormData = {
    emailID: '',
    name: '',
    phoneNumber: '',
    passes: [{ slots: {} }]
  };

  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    api.get('/events')
      .then(res => {
        const allEvents = res.data.rows || [];
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

  const passPrice = Number(import.meta.env.VITE_TECH_PASS_PRICE || 300);
  const totalAmount = passPrice; // Only one pass now

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const isAnySlotFilled = formData.passes.some(pass => Object.keys(pass.slots).length > 0);
    if (!isAnySlotFilled) {
      setError('Please select at least one event in a pass.');
      setLoading(false);
      return;
    }

    try {
      await api.post('/tech-registration', formData);

      const registeredItemsDetails = [{
        name: 'Technical Pass',
        cost: passPrice,
        external_id: 'tech_pass'
      }];

      setSubmissionResult({
        details: { ...formData },
        registeredItems: registeredItemsDetails,
        totalAmount: totalAmount
      });

    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNewRegistration = () => {
    setFormData(initialFormData);
    setSubmissionResult(null);
    setError(null);
  };

  const getEventById = (eventId) => events.find(e => e.external_id === parseInt(eventId));

  const getPassSummary = (pass) => {
    const filledSlots = Object.keys(pass.slots).length;
    return filledSlots > 0 ? `${filledSlots} event${filledSlots === 1 ? '' : 's'} selected` : 'No events selected';
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
            type="Pass"
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
            <CpuChipIcon className="h-8 w-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-900">Technical Event Registration</h1>
          </div>
          <p className="text-gray-600">Register for technical events and programming competitions</p>
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    placeholder="Enter your phone number"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Pass Configuration */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardDocumentListIcon className="h-6 w-6 text-gray-600" />
                <h2 className="text-xl font-semibold text-gray-900">Configure Your Technical Pass</h2>
              </div>
              <p className="text-gray-600 text-sm">Select up to 4 technical events for your pass</p>
            </div>

            <div className="p-6">
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Pass Header */}
                <div className="bg-gray-50 border-b border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">Technical Pass</h3>
                      <p className="text-sm text-gray-600 mt-1">{getPassSummary(formData.passes[0])}</p>
                    </div>
                    
                    <div className="text-sm font-medium text-gray-700">
                      ₹{passPrice}
                    </div>
                  </div>
                </div>

                {/* Slot Selection */}
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(slotNo => (
                      <div key={slotNo} className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                          <CalendarDaysIcon className="h-4 w-4" />
                          Slot {slotNo}
                        </label>
                        
                        <select
                          value={formData.passes[0].slots[slotNo] || ''}
                          onChange={(e) => updateSlot(0, slotNo, e.target.value)}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors text-sm"
                        >
                          <option value="">Select an event...</option>
                          {events.map(event => (
                            <option key={event.external_id} value={event.external_id}>
                              {event.name} ({event.department_name})
                            </option>
                          ))}
                        </select>

                        {/* Show selected event details */}
                        {formData.passes[0].slots[slotNo] && (
                          <div className="mt-2 p-2 bg-indigo-50 rounded-lg border border-indigo-200">
                            <div className="text-xs text-indigo-800">
                              <div className="flex items-center gap-1 mb-1">
                                <CheckCircleIcon className="h-3 w-3" />
                                <span className="font-medium">Selected:</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <BuildingOffice2Icon className="h-3 w-3" />
                                <span>{getEventById(formData.passes[0].slots[slotNo])?.department_name}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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
                <div className="flex items-center gap-2 text-2xl font-bold text-gray-900 mb-2">
                  <CurrencyRupeeIcon className="h-6 w-6" />
                  Total Amount: {totalAmount.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>Technical pass: ₹{passPrice}</div>
                  <div className="font-medium">
                    Events selected: {Object.keys(formData.passes[0].slots).length}/4
                  </div>
                </div>
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className={`
                  px-8 py-3 rounded-lg font-semibold text-white transition-all duration-200 focus:ring-4 focus:ring-offset-2
                  ${loading 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 active:scale-95'
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