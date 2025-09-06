import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/api';
import RegistrationSuccess from '../components/RegistrationSuccess';
import { 
  UserIcon, 
  EnvelopeIcon, 
  PhoneIcon, 
  AcademicCapIcon, 
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CurrencyRupeeIcon,
  HashtagIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon
} from '@heroicons/react/24/outline';

export default function WorkshopRegistration() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [workshops, setWorkshops] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [submissionResult, setSubmissionResult] = useState(null);

  const initialFormData = {
    emailID: '',
    name: '',
    phoneNumber: '',
    selectedWorkshopId: null
  };

  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    const fetchWorkshops = async () => {
      try {
        const response = await api.get('/events?department_id=11');
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
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  
  const handleWorkshopChange = (workshopId) => {
    setFormData(prev => ({ ...prev, selectedWorkshopId: workshopId }));
  };

  const selectedWorkshop = formData.selectedWorkshopId ? workshops.find(w => w.external_id === formData.selectedWorkshopId) : null;
  const fallbackPrice = Number(import.meta.env.VITE_WORKSHOP_PRICE || 300);
  const totalAmount = selectedWorkshop
    ? (Number(selectedWorkshop.cost) || fallbackPrice)
    : 0;
    
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!formData.selectedWorkshopId) {
      setError('Please select a workshop');
      setLoading(false);
      return;
    }

    try {
      const workshopData = [{ workshop_id: formData.selectedWorkshopId }];

      await api.post('/workshop-registration', {
        emailID: formData.emailID,
        name: formData.name,
        phoneNumber: formData.phoneNumber,
        workshops: workshopData
      });

      const registeredItemsDetails = selectedWorkshop ? [{
        name: selectedWorkshop.name,
        cost: selectedWorkshop.cost ?? fallbackPrice,
        external_id: selectedWorkshop.external_id
      }] : [];

      setSubmissionResult({
        details: { ...formData },
        registeredItems: registeredItemsDetails,
        totalAmount: totalAmount
      });

    } catch (err) {
      setError(err.response?.data?.error || 'Workshop registration failed');
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
            type="Workshop"
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
            <WrenchScrewdriverIcon className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Workshop Registration</h1>
          </div>
          <p className="text-gray-600">Register for hands-on workshops and skill-building sessions</p>
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="Enter your phone number"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Workshop Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-2">
                <AcademicCapIcon className="h-6 w-6 text-gray-600" />
                <h2 className="text-xl font-semibold text-gray-900">Select Workshop</h2>
              </div>
              <p className="text-gray-600 text-sm">Choose one workshop to participate in</p>
            </div>

            <div className="p-6">
              {/* Search Bar */}
              <div className="relative mb-6">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input 
                  type="text" 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  placeholder="Search workshops by name or ID..." 
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Workshops Grid */}
              {filteredWorkshops.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <AcademicCapIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium mb-1">No workshops available</p>
                  <p className="text-gray-500 text-sm">No workshops match your search criteria</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredWorkshops.map(workshop => (
                    <div 
                      key={workshop.external_id} 
                      className={`relative border rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                        formData.selectedWorkshopId === workshop.external_id 
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-25'
                      }`}
                      onClick={() => handleWorkshopChange(workshop.external_id)}
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="workshop-selection"
                          checked={formData.selectedWorkshopId === workshop.external_id}
                          onChange={() => handleWorkshopChange(workshop.external_id)}
                          className="mt-1 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 mb-2">{workshop.name}</div>
                          
                          <div className="space-y-1 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <HashtagIcon className="h-3 w-3" />
                              <span>ID: {workshop.external_id}</span>
                            </div>
                            <div className="flex items-center gap-1 text-green-600 font-medium">
                              <CurrencyRupeeIcon className="h-3 w-3" />
                              <span>{workshop.cost ?? fallbackPrice}</span>
                            </div>
                          </div>
                        </div>
                        
                        {formData.selectedWorkshopId === workshop.external_id && (
                          <CheckCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
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
                {selectedWorkshop && (
                  <p className="text-sm text-gray-600 mt-1">
                    Registration fee for {selectedWorkshop.name}
                  </p>
                )}
              </div>
              
              <button
                type="submit"
                disabled={loading || !formData.selectedWorkshopId}
                className={`
                  px-8 py-3 rounded-lg font-semibold text-white transition-all duration-200 focus:ring-4 focus:ring-offset-2
                  ${loading || !formData.selectedWorkshopId 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 active:scale-95'
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