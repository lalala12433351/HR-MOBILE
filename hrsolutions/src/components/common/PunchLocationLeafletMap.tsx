'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getGoogleMapsApiKey, loadGoogleMaps } from '@/lib/googleMaps';

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
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const mapsApiRef = useRef<typeof google.maps | null>(null);
  const [mapError, setMapError] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const initMap = async () => {
      if (typeof window === 'undefined' || !mapContainerRef.current) return;

      try {
        const maps = await loadGoogleMaps();
        mapsApiRef.current = maps;
        if (isCancelled || !mapContainerRef.current || mapInstanceRef.current) return;

        const map = new maps.Map(mapContainerRef.current, {
          center: { lat: latitude, lng: longitude },
          zoom: 17,
          disableDefaultUI: true,
          keyboardShortcuts: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        const marker = new maps.Marker({
          position: { lat: latitude, lng: longitude },
          map,
          clickable: false,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#17324e',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
        setMapError('');
        requestAnimationFrame(() => {
          maps.event.trigger(map, 'resize');
          map.setCenter({ lat: latitude, lng: longitude });
        });
      } catch {
        if (!isCancelled) {
          setMapError(
            getGoogleMapsApiKey()
              ? 'Google Maps could not load.'
              : 'Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to hrsolutions/.env and restart the app.',
          );
        }
      }
    };

    initMap();

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapsApiRef.current?.event.clearInstanceListeners(mapInstanceRef.current);
      }
      markerRef.current?.setMap(null);
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      const position = { lat: latitude, lng: longitude };
      markerRef.current.setPosition(position);
      mapInstanceRef.current.panTo(position);
      mapInstanceRef.current.setZoom(17);
    }
  }, [latitude, longitude]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[var(--bg-app)]">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
      {mapError && (
        <p role="status" className="absolute inset-x-3 bottom-3 z-10 rounded bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm">
          {mapError}
        </p>
      )}

      <div className="att-map-zoom">
        <button
          type="button"
          onClick={() => {
            const map = mapInstanceRef.current;
            if (!map) return;
            map.setZoom((map.getZoom() || 17) + 1);
          }}
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            const map = mapInstanceRef.current;
            if (!map) return;
            map.setZoom(Math.max((map.getZoom() || 17) - 1, 1));
          }}
          title="Zoom out"
        >
          −
        </button>
      </div>

      {onRecalibrateGPS && (
        <button
          type="button"
          onClick={onRecalibrateGPS}
          title="Use current location"
          className="att-map-locate"
        >
          <svg
            className={`h-4 w-4 ${isLocating ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  );
};
