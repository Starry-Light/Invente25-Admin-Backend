import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowsPointingOutIcon, ArrowsPointingInIcon, ExclamationTriangleIcon, CameraIcon } from '@heroicons/react/24/outline';

// This function calculates a responsive scanning box size
const getResponsiveQrBox = (viewfinderWidth, viewfinderHeight) => {
  const minEdgePercentage = 0.7; // 70% of the smaller edge
  const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
  const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
  return {
    width: qrboxSize,
    height: qrboxSize,
  };
};

export default function QRScanner({ onResult, fps = 10 }) {
  const scannerRef = useRef(null); // Html5Qrcode instance
  const scannerActiveRef = useRef(false); // whether we've started scanner
  const onResultRef = useRef(onResult);
  const isInitializedRef = useRef(false);

  // cooldown and last-scan refs
  const scanCooldownRef = useRef(false);
  const lastScanRef = useRef({ result: null, timestamp: 0 });

  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [statusMessage, setStatusMessage] = useState('Initializing camera...');
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Keep onResult callback reference up-to-date
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Effect to discover cameras once on mount
  useEffect(() => {
    const discoverCameras = async () => {
      try {
        setStatusMessage('Discovering cameras...');
        const devices = await Html5Qrcode.getCameras();

        if (devices && devices.length > 0) {
          setCameras(devices);

          // Prefer the rear camera on mobile devices
          const rearCamera = devices.find(device =>
            /back|rear|environment/i.test(device.label)
          );
          const selectedCamera = rearCamera || devices[0];

          setSelectedCameraId(selectedCamera.id);
          setStatusMessage('Camera ready');
          setIsInitialized(true);
          setError(null);

          // Auto-start scanning after successful initialization
          setIsScanning(true);
        } else {
          setError("No cameras found on this device.");
          setStatusMessage('');
          setIsInitialized(true);
        }
      } catch (err) {
        console.error("Camera discovery error:", err);
        setError("Could not access cameras. Please check permissions.");
        setStatusMessage('');
        setIsInitialized(true);
      }
    };

    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      discoverCameras();
    }
  }, []);

  // Effect to manage scanner lifecycle
  useEffect(() => {
    if (!selectedCameraId || !isInitialized) return;
    let mounted = true;

    const manageScanner = async () => {
      // Stop existing scanner if it's running (our runtime flag)
      if (scannerRef.current && scannerActiveRef.current) {
        try {
          await scannerRef.current.stop();
        } catch (err) {
          console.error("Error stopping scanner:", err);
        } finally {
          try { scannerRef.current.clear(); } catch (e) {}
          scannerActiveRef.current = false;
        }
      }

      // Start scanner if requested
      if (isScanning) {
        try {
          // Create new scanner instance
          const scanner = new Html5Qrcode("qr-reader", { verbose: false });
          scannerRef.current = scanner;

          setStatusMessage("Starting camera...");
          setError(null);

          await scanner.start(
            selectedCameraId,
            {
              fps,
              qrbox: getResponsiveQrBox,
              aspectRatio: 1.0,
            },
            (decodedText, decodedResult) => {
              // Implement scan cooldown to prevent rapid-fire scanning
              const now = Date.now();
              const SCAN_COOLDOWN_MS = 2000; // 2 second cooldown

              // Ignore if cooldown active
              if (scanCooldownRef.current) return;

              // Ignore exact duplicate within cooldown window
              if (
                lastScanRef.current.result === decodedText &&
                (now - lastScanRef.current.timestamp) < SCAN_COOLDOWN_MS
              ) {
                return;
              }

              // Record this scan and enter cooldown
              lastScanRef.current = { result: decodedText, timestamp: now };
              scanCooldownRef.current = true;

              // Call the result handler
              try {
                onResultRef.current(decodedText, decodedResult);
              } catch (err) {
                console.error("onResult handler error:", err);
              }

              // Release cooldown after delay
              setTimeout(() => {
                scanCooldownRef.current = false;
              }, SCAN_COOLDOWN_MS);
            },
            (errorMessage) => {
              // scan failure callback - ignore or log
              // console.debug('scan error', errorMessage);
            }
          );

          scannerActiveRef.current = true;
          if (!mounted) {
            // If component unmounted while starting, stop immediately
            if (scannerRef.current && scannerActiveRef.current) {
              scannerRef.current.stop().catch(console.error);
              try { scannerRef.current.clear(); } catch (e) {}
              scannerActiveRef.current = false;
            }
            return;
          }

          setStatusMessage('');
        } catch (err) {
          console.error("Scanner start error:", err);
          const errorMessage = err && err.name === 'NotAllowedError'
            ? "Camera permission denied. Please enable camera access in your browser settings."
            : `Failed to start scanner: ${err && err.message ? err.message : err}`;
          setError(errorMessage);
          setIsScanning(false);
          setStatusMessage('');
          // Ensure flags cleaned
          scannerActiveRef.current = false;
        }
      }
    };

    manageScanner();

    // Cleanup function
    return () => {
      mounted = false;
      if (scannerRef.current && scannerActiveRef.current) {
        scannerRef.current.stop().catch(err => {
          console.error("Failed to stop scanner cleanly:", err);
        }).finally(() => {
          try { scannerRef.current.clear(); } catch (e) {}
          scannerActiveRef.current = false;
        });
      }
    };
  }, [isScanning, selectedCameraId, fps, isInitialized]);

  const handleCameraChange = async (newCameraId) => {
    setIsScanning(false);
    setSelectedCameraId(newCameraId);
    // Scanner will restart automatically due to useEffect dependency
    setTimeout(() => setIsScanning(true), 150);
  };

  const toggleScanning = () => {
    setIsScanning(prev => !prev);
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-6">
      {/* Scanner Container */}
      <div className="relative bg-gray-900 rounded-xl overflow-hidden shadow-lg">
        {/* Scanner Target */}
        <div id="qr-reader" className="min-h-[300px] md:min-h-[400px]"></div>

        {/* Status Overlay */}
        {(!isScanning || statusMessage || error) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm">
            <div className="text-center text-white p-6 max-w-sm">
              {error ? (
                <>
                  <ExclamationTriangleIcon className="h-12 w-12 mx-auto mb-3 text-red-400" />
                  <p className="font-semibold text-lg mb-2 text-red-300">Camera Error</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{error}</p>
                </>
              ) : statusMessage ? (
                <>
                  <CameraIcon className="h-12 w-12 mx-auto mb-3 text-blue-400 animate-pulse" />
                  <p className="font-semibold text-lg mb-2">Scanner</p>
                  <p className="text-sm text-gray-300">{statusMessage}</p>
                </>
              ) : (
                <>
                  <CameraIcon className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="font-semibold text-lg mb-2">Scanner Stopped</p>
                  <p className="text-sm text-gray-300">Click start to begin scanning</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Scanning indicator */}
        {isScanning && !statusMessage && !error && (
          <div className="absolute top-4 right-4">
            <div className="bg-green-500 bg-opacity-90 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              Scanning
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        {/* Start/Stop Button */}
        <button
          onClick={toggleScanning}
          disabled={!selectedCameraId || !!error}
          className={`
            flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 py-3 rounded-lg font-semibold text-white transition-all duration-200 shadow-lg
            ${!selectedCameraId || error
              ? 'bg-gray-400 cursor-not-allowed'
              : isScanning
                ? 'bg-red-500 hover:bg-red-600 focus:ring-red-200'
                : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-200'
            }
            focus:outline-none focus:ring-4 active:scale-95
          `}
        >
          {isScanning ? (
            <>
              <ArrowsPointingInIcon className="h-5 w-5" />
              <span>Stop Scanning</span>
            </>
          ) : (
            <>
              <ArrowsPointingOutIcon className="h-5 w-5" />
              <span>Start Scanning</span>
            </>
          )}
        </button>

        {/* Camera Selection */}
        {cameras.length > 1 && (
          <select
            value={selectedCameraId}
            onChange={(e) => handleCameraChange(e.target.value)}
            disabled={!isInitialized}
            className="
              flex-1 sm:flex-none px-4 py-3 border border-gray-300 rounded-lg shadow-sm text-sm
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
              disabled:bg-gray-100 disabled:cursor-not-allowed
              bg-white
            "
          >
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.label || `Camera ${camera.id.slice(0, 8)}...`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Instructions */}
      {isScanning && !error && (
        <div className="text-center text-gray-600">
          <p className="text-sm">
            Position a QR code within the scanning area to decode it
          </p>
        </div>
      )}
    </div>
  );
}
