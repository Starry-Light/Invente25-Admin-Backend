import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * A component to display a confirmation message after a successful registration.
 * @param {object} props
 * @param {object} props.details - Participant's details { name, emailID, phoneNumber }.
 * @param {array} props.registeredItems - Array of registered items { name, cost, external_id }.
 * @param {number} props.totalAmount - The total cost.
 * @param {function} props.onNewRegistration - Callback to reset the form for a new entry.
 * @param {string} props.type - The type of registration, e.g., "Event" or "Workshop".
 */
export default function RegistrationSuccess({ details, registeredItems, totalAmount, onNewRegistration, type }) {
  const navigate = useNavigate();

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg text-center animate-fade-in">
      {/* Success Icon */}
      <div className="mx-auto bg-green-100 rounded-full h-16 w-16 flex items-center justify-center mb-4">
        <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold mt-4 mb-2">Registration Successful!</h2>
      <p className="text-gray-600 mb-6">Here is a summary of the registration.</p>

      {/* Details Section */}
      <div className="text-left border-t border-b py-4 my-4 space-y-4">
        <div>
          <h3 className="font-semibold text-lg mb-2">Participant Details</h3>
          <p><strong>Name:</strong> {details.name}</p>
          <p><strong>Email:</strong> {details.emailID}</p>
          <p><strong>Phone:</strong> {details.phoneNumber}</p>
        </div>

        <div>
          <h3 className="font-semibold text-lg mb-2">Registered {type}s</h3>
          <ul className="space-y-1 list-disc list-inside">
            {registeredItems.map(item => (
              <li key={item.external_id} className="flex justify-between">
                <span>{item.name}</span>
                <span className="font-mono">₹{Number(item.cost).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-between font-bold text-xl border-t pt-2 mt-2">
          <span>Total Amount Paid</span>
          <span className="font-mono">₹{totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-center items-center space-y-3 sm:space-y-0 sm:space-x-4 mt-6">
        <button
          onClick={onNewRegistration}
          className="w-full sm:w-auto px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
        >
          Register Another Participant
        </button>
        <button
          onClick={() => navigate('/')}
          className="w-full sm:w-auto px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}