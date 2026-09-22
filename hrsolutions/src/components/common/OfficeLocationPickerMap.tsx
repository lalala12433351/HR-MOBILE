'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DEFAULT_GEO_COORDINATES } from '@/config/constants';

interface SearchResultItem {
  name: string;
  lat: number;
  lng: number;
}

interface OfficeLocationPickerMapProps {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  onLocationChange: (lat: number, lng: number, address?: string) => void;
  className?: string;
}

export const OfficeLocationPickerMap: React.FC<OfficeLocationPickerMapProps> = ({
  latitude,
  longitude,
  onLocationChange,
  className = 'h-52',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const [isLocating, setIsLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [showResults, setShowResults] = useState(false);

  const initialLat = latitude && latitude !== 0 ? latitude : DEFAULT_GEO_COORDINATES.latitude;
  const initialLng = longitude && longitude !== 0 ? longitude : DEFAULT_GEO_COORDINATES.longitude;

  useEffect(() => {
    let isCancelled = false;

    const initMap = async () => {
      if (typeof window === 'undefined' || !mapContainerRef.current) return;

      const L = (await import('leaflet')).default;

      if (isCancelled || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLng],
          zoom: 16,
          zoomControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);

        const pinIcon = L.divIcon({
          className: 'custom-office-pin',
          html: `
            <div style="
              width: 24px;
              height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              background-color: #2563eb;
              border: 2px solid #ffffff;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
              cursor: grab;
            ">
              <div style="width: 6px; height: 6px; background: #ffffff; border-radius: 50%;"></div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 24],
        });

        const marker = L.marker([initialLat, initialLng], {
          icon: pinIcon,
          draggable: true,
          autoPan: true,
        }).addTo(map);

        marker.on('dragend', async (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          reverseGeocode(lat, lng);
        });

        map.on('click', async (e: any) => {
          const { lat, lng } = e.latlng;
          marker.setLatLng([lat, lng]);
          reverseGeocode(lat, lng);
        });

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

  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && latitude && longitude) {
      markerRef.current.setLatLng([latitude, longitude]);
      mapInstanceRef.current.panTo([latitude, longitude]);
    }
  }, [latitude, longitude]);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (res.ok) {
        const data = await res.json();
        const displayAddress = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        onLocationChange(lat, lng, displayAddress);
      } else {
        onLocationChange(lat, lng);
      }
    } catch {
      onLocationChange(lat, lng);
    }
  };

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    const cleaned = query.trim();

    try {
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleaned)}&limit=5`,
        { headers: { 'Accept-Language': 'en' } }
      );

      if (nomRes.ok) {
        const nomData = await nomRes.json();
        if (Array.isArray(nomData) && nomData.length > 0) {
          const items: SearchResultItem[] = nomData.map((item: any) => ({
            name: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          }));
          setSearchResults(items);
          setShowResults(true);
          setIsSearching(false);
          return;
        }
      }

      setSearchResults([]);
      setShowResults(false);
    } catch (err) {
      console.warn('Search geocoding error:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    const timer = setTimeout(() => {
      performSearch(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  const handleSelectSearchResult = (result: SearchResultItem) => {
    if (mapInstanceRef.current && markerRef.current) {
      markerRef.current.setLatLng([result.lat, result.lng]);
      mapInstanceRef.current.flyTo([result.lat, result.lng], 17, { duration: 0.8 });
    }
    onLocationChange(result.lat, result.lng, result.name);
    setShowResults(false);
    setSearchQuery('');
  };

  const handleUseCurrentGPS = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (mapInstanceRef.current && markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          mapInstanceRef.current.flyTo([lat, lng], 17, { duration: 0.8 });
        }

        reverseGeocode(lat, lng);
        setIsLocating(false);
      },
      (err) => {
        console.warn('GPS location error:', err);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="relative w-full rounded border border-slate-200 bg-white overflow-hidden">
      {/* Search Input Bar */}
      <div className="absolute top-2 left-2 right-12 z-10">
        <div className="relative flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                performSearch(searchQuery);
              }
            }}
            placeholder="Search address or landmark..."
            className="w-full rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 shadow-sm"
          />
          {isSearching && (
            <span className="absolute right-2 text-[10px] text-blue-600 font-medium">Searching...</span>
          )}
          {searchQuery && !isSearching && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setShowResults(false);
              }}
              className="absolute right-2 text-xs text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          )}
        </div>

        {/* Results Dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded border border-slate-200 bg-white shadow-md max-h-40 overflow-y-auto z-20 divide-y divide-slate-100">
            {searchResults.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSearchResult(item)}
                className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50 text-slate-700 truncate"
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map Element */}
      <div ref={mapContainerRef} className={`w-full ${className} z-0`} />

      {/* Zoom and GPS Buttons */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <div className="flex flex-col bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomIn()}
            className="h-6 w-6 text-xs text-slate-700 hover:bg-slate-100 border-b border-slate-100 font-bold"
            title="Zoom In"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomOut()}
            className="h-6 w-6 text-xs text-slate-700 hover:bg-slate-100 font-bold"
            title="Zoom Out"
          >
            −
          </button>
        </div>
      </div>

      <div className="absolute bottom-2 right-2 z-10">
        <button
          type="button"
          onClick={handleUseCurrentGPS}
          className="px-2 py-1 rounded bg-white text-blue-600 font-medium text-[11px] border border-slate-200 hover:bg-slate-50 shadow-sm"
        >
          {isLocating ? 'Locating...' : 'My GPS'}
        </button>
      </div>
    </div>
  );
};
