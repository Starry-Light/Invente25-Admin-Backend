// QRScanner.jsx (Refactored and simplified)
import React, { useEffect, useRef, useState } from 'react';

// Keep the scanner instance in a closure to ensure it's a singleton for this component instance
let html5QrCode = null;

export default function QRScanner({ onResult, fps = 10, qrbox = 250 }) {
  const elementIdRef = useRef(`qr-reader-${Date.now()}`); // Simplified stable ID
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);

  // Function to clean up the scanner instance
  const cleanup = async () => {
    if (html5QrCode && html5QrCode.isScanning) {
      try {
        await html5QrCode.stop();
      } catch (e) {
        console.error("Failed to stop scanner gracefully.", e);
      }
    }
  };

  // Main effect to initialize and manage the scanner
  useEffect(() => {
    const startScanner = async () => {
      // Lazily import the library
      const { Html5Qrcode } = await import('html5-qrcode');
      
      // Ensure we have a fresh instance
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode(elementIdRef.current);
      }
      
      // Cleanup any previous scanning session
      await cleanup();

      try {
        const devices = await Html5Qrcode.getCameras();
        if (!devices || devices.length === 0) {
          throw new Error('No cameras found.');
        }
        setCameras(devices);

        // Determine which camera to use
        const preferredCam = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];
        const camId = selectedCameraId || preferredCam.id;
        setSelectedCameraId(camId); // Set default if not already set

        await html5QrCode.start(
          camId,
          { fps, qrbox },
          (decodedText) => {
            onResult(decodedText);
          },
          (errorMessage) => {
            // Ignore per-frame errors
          }
        );
        setError(null);
        setRunning(true);
      } catch (err) {
        setError(err.message || "Failed to start scanner.");
        setRunning(false);
      }
    };

    startScanner();

    // Cleanup function when component unmounts
    return () => {
      cleanup().then(() => {
        if(html5QrCode) {
            html5QrCode.clear();
            html5QrCode = null;
        }
      });
    };
    // Re-run the effect only if the selected camera changes
  }, [selectedCameraId, fps, qrbox, onResult]);

  const handleStop = () => {
    cleanup().then(() => setRunning(false));
  };

  const handleRestart = () => {
    // Setting running to false and then true would work if we had a dependency on it,
    // but it's simpler to just re-select the current camera to trigger the effect.
    setSelectedCameraId(prev => prev); // This will re-trigger the effect if needed
    if (!running) {
       // A manual trigger if it wasn't running
       const currentId = selectedCameraId;
       setSelectedCameraId(null); // Force a change
       setTimeout(() => setSelectedCameraId(currentId), 0);
    }
  };

  return (
    <div className="space-y-2">
      <div id={elementIdRef.current} style={{ width: '100%' }} />
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <button className="px-2 py-1 bg-yellow-500 text-white rounded text-sm" onClick={handleStop}>Stop Scanner</button>
        ) : (
          <button className="px-2 py-1 bg-green-600 text-white rounded text-sm" onClick={handleRestart}>Start Scanner</button>
        )}

        {cameras.length > 1 && (
          <select 
            className="border rounded px-2 py-1 text-sm" 
            value={selectedCameraId || ''}
            onChange={e => setSelectedCameraId(e.target.value)}
          >
            {cameras.map(cam => <option key={cam.id} value={cam.id}>{cam.label || cam.id}</option>)}
          </select>
        )}
      </div>
       {error && <div className="text-sm text-red-500 mt-2">{error}</div>}
    </div>
  );
}