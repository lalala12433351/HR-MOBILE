'use client';

import React, { useEffect, useRef } from 'react';

interface PunchLocationLeafletMapProps {
  latitude: number;
  longitude: number;
  onRecalibrateGPS?: () => void;
  isLocating?: boolean;
}

export const PunchLocationLeafletMap: React.FC<PunchLocationLeafletMapProps> = ({
  latitude,
  longitude,
  onRecalibrateGPS,
  isLocating = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    let isCancelled = false;

    const initMap = async () => {
      if (typeof window === 'undefined' || !mapContainerRef.current) return;

      const L = (await import('leaflet')).default;

      if (isCancelled || !mapContainerRef.current) return;

      // Avoid double initialization
      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [latitude, longitude],
          zoom: 17,
          zoomControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        // Custom clean blue location dot icon with pointer-events disabled
        const blueDotIcon = L.divIcon({
          className: 'custom-location-dot',
          html: `<div style="width: 18px; height: 18px; background-color: #2563eb; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.35); pointer-events: none;"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });

        // Add 100% Non-Interactive, Non-Clickable Marker
        const marker = L.marker([latitude, longitude], {
          icon: blueDotIcon,
          draggable: false,
          interactive: false,
          keyboard: false,
        }).addTo(map);

        mapInstanceRef.current = map;
        markerRef.current = marker;
      }
    };

    initMap();

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Sync marker and map when latitude or longitude props change
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
      mapInstanceRef.current.flyTo([latitude, longitude], 17, { duration: 1 });
    }
  }, [latitude, longitude]);

  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut();
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-100">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Zoom Controls (+ / -) */}
      <div className="absolute top-4 right-4 z-10 flex flex-col bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In"
          className="h-9 w-9 flex items-center justify-center text-slate-700 hover:bg-slate-100 border-b border-slate-100 font-bold text-lg transition-colors cursor-pointer"
        >
          +
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out"
          className="h-9 w-9 flex items-center justify-center text-slate-700 hover:bg-slate-100 font-bold text-lg transition-colors cursor-pointer"
        >
          −
        </button>
      </div>

      {/* Floating Compass / GPS Recalibrate Button */}
      {onRecalibrateGPS && (
        <div className="absolute bottom-6 right-6 z-10">
          <button
            type="button"
            onClick={onRecalibrateGPS}
            title="Recalibrate to Current GPS Location"
            className="h-12 w-12 rounded-full border border-slate-200 bg-white shadow-xl flex items-center justify-center text-blue-600 hover:bg-slate-50 transition-all cursor-pointer active:scale-95 group"
          >
            <svg
              className={`h-6 w-6 transition-transform duration-300 ${isLocating ? 'animate-spin' : 'group-hover:rotate-45'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="#2563eb" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};
