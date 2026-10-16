'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DEFAULT_GEO_COORDINATES } from '@/config/constants';
import {
  getGoogleMapsApiKey,
  loadGoogleMaps,
  reverseGeocodeLatLng,
  searchGoogleAddresses,
  type AddressSearchResult,
} from '@/lib/googleMaps';

interface OfficeLocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  radiusMeters?: number;
  onLocationChange: (lat: number, lng: number, address?: string) => void;
  className?: string;
  requireSelection?: boolean;
  searchTerm?: string;
  searchRequestId?: number;
}

export const OfficeLocationPickerMap: React.FC<OfficeLocationPickerMapProps> = ({
  latitude,
  longitude,
  radiusMeters,
  onLocationChange,
  className = 'h-52',
  requireSelection = false,
  searchTerm,
  searchRequestId = 0,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const mapsApiRef = useRef<typeof google.maps | null>(null);
  const handledSearchRequestRef = useRef(0);

  const [isLocating, setIsLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AddressSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState('');
  const [mapError, setMapError] = useState('');

  const hasSelection = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude);
  const initialLat = hasSelection ? latitude : requireSelection ? 20 : DEFAULT_GEO_COORDINATES.latitude;
  const initialLng = hasSelection ? longitude : requireSelection ? 0 : DEFAULT_GEO_COORDINATES.longitude;
  const hasApiKey = Boolean(getGoogleMapsApiKey()) || (typeof window !== 'undefined' && Boolean(window.google?.maps?.Map));

  useEffect(() => {
    let isCancelled = false;

    const initMap = async () => {
      if (typeof window === 'undefined' || !mapContainerRef.current) return;

      try {
        const maps = await loadGoogleMaps();
        mapsApiRef.current = maps;
        if (isCancelled || !mapContainerRef.current || mapInstanceRef.current) return;

        const map = new maps.Map(mapContainerRef.current, {
          center: { lat: initialLat, lng: initialLng },
          zoom: hasSelection || !requireSelection ? 16 : 2,
          disableDefaultUI: true,
          keyboardShortcuts: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        const marker = new maps.Marker({
          position: { lat: initialLat, lng: initialLng },
          map: hasSelection || !requireSelection ? map : null,
          draggable: true,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#2563eb',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });

        if (hasSelection && radiusMeters && Number.isFinite(radiusMeters) && radiusMeters > 0) {
          circleRef.current = new maps.Circle({
            map,
            center: { lat: initialLat, lng: initialLng },
            radius: radiusMeters,
            strokeColor: '#2563eb',
            strokeWeight: 1,
            fillColor: '#2563eb',
            fillOpacity: 0.12,
          });
        }

        marker.addListener('dragend', () => {
          const position = marker.getPosition();
          if (!position) return;
          void reverseGeocode(position.lat(), position.lng());
        });

        map.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (!event.latLng) return;
          marker.setPosition(event.latLng);
          marker.setMap(map);
          void reverseGeocode(event.latLng.lat(), event.latLng.lng());
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
        setMapError('');
        const refreshSize = () => {
          try {
            maps.event.trigger(map, 'resize');
            const center = map.getCenter();
            if (center) map.setCenter(center);
          } catch {
            /* map may already be torn down */
          }
        };
        requestAnimationFrame(refreshSize);
        window.setTimeout(refreshSize, 250);
        if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
          const observer = new ResizeObserver(refreshSize);
          observer.observe(mapContainerRef.current);
          (map as google.maps.Map & { _pixbeResizeObserver?: ResizeObserver })._pixbeResizeObserver = observer;
        }
      } catch (error) {
        if (!isCancelled) {
          setMapError(error instanceof Error ? error.message : 'Google Maps failed to load.');
        }
      }
    };

    initMap();

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        const observer = (mapInstanceRef.current as google.maps.Map & { _pixbeResizeObserver?: ResizeObserver })
          ._pixbeResizeObserver;
        observer?.disconnect();
        mapsApiRef.current?.event.clearInstanceListeners(mapInstanceRef.current);
      }
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      mapInstanceRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const marker = markerRef.current;
    const maps = mapsApiRef.current;
    if (!map || !marker) return;

    if (hasSelection) {
      const position = { lat: latitude!, lng: longitude! };
      marker.setPosition(position);
      marker.setMap(map);
      map.panTo(position);
      if (radiusMeters && Number.isFinite(radiusMeters) && radiusMeters > 0 && maps) {
        if (!circleRef.current) {
          circleRef.current = new maps.Circle({
            map,
            center: position,
            radius: radiusMeters,
            strokeColor: '#2563eb',
            strokeWeight: 1,
            fillColor: '#2563eb',
            fillOpacity: 0.12,
          });
        } else {
          circleRef.current.setCenter(position);
          circleRef.current.setRadius(radiusMeters);
          circleRef.current.setMap(map);
        }
      } else if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
    } else if (requireSelection) {
      marker.setMap(null);
      circleRef.current?.setMap(null);
      circleRef.current = null;
      map.setCenter({ lat: 20, lng: 0 });
      map.setZoom(2);
    }
  }, [latitude, longitude, hasSelection, requireSelection, radiusMeters]);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const address = await reverseGeocodeLatLng(lat, lng);
      onLocationChange(lat, lng, address || undefined);
    } catch {
      onLocationChange(lat, lng);
    }
  };

  const performSearch = useCallback(async (query: string, chooseFirst = false) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      setSearchFeedback('Enter at least two characters to search.');
      return;
    }

    setIsSearching(true);
    const cleaned = query.trim();

    try {
      const items = await searchGoogleAddresses(cleaned);
      if (items.length > 0) {
        if (chooseFirst) {
          handleSelectSearchResult(items[0]);
          return;
        }
        setSearchFeedback('');
        setSearchResults(items);
        setShowResults(true);
        setIsSearching(false);
        return;
      }

      setSearchResults([]);
      setShowResults(false);
      setSearchFeedback('No address found. Try a street and city, or choose a point on the map.');
    } catch (err) {
      console.warn('Search geocoding error:', err);
      setSearchFeedback('Address search is unavailable. Try again or choose a point on the map.');
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

  useEffect(() => {
    if (searchRequestId <= handledSearchRequestRef.current || !searchTerm?.trim()) return;
    handledSearchRequestRef.current = searchRequestId;
    void performSearch(searchTerm, true);
  }, [searchRequestId, searchTerm, performSearch]);

  const handleSelectSearchResult = (result: AddressSearchResult) => {
    if (mapInstanceRef.current && markerRef.current) {
      const position = { lat: result.lat, lng: result.lng };
      markerRef.current.setPosition(position);
      markerRef.current.setMap(mapInstanceRef.current);
      mapInstanceRef.current.panTo(position);
      mapInstanceRef.current.setZoom(17);
    }
    onLocationChange(result.lat, result.lng, result.name);
    setSearchFeedback('');
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
          const position = { lat, lng };
          markerRef.current.setPosition(position);
          markerRef.current.setMap(mapInstanceRef.current);
          mapInstanceRef.current.panTo(position);
          mapInstanceRef.current.setZoom(17);
        }

        reverseGeocode(lat, lng);
        setIsLocating(false);
      },
      (err) => {
        console.warn('GPS location error:', err);
        setSearchFeedback('Could not get your location. Check browser permissions or search for an address.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="relative z-0 isolate w-full rounded border border-slate-200 bg-white overflow-hidden">
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
                void performSearch(searchQuery, true);
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
              className="absolute right-2 grid size-5 place-items-center text-slate-500 hover:text-slate-800"
              aria-label="Clear map search"
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
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
        {searchFeedback && <p role="status" className="mt-1 rounded bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm">{searchFeedback}</p>}
      </div>

      {/* Map Element */}
      <div
        ref={mapContainerRef}
        className={`w-full ${className} z-0`}
        aria-label="Select workplace location on map"
        data-office-pin={hasSelection ? 'true' : 'false'}
      />
      {hasSelection && <span className="custom-office-pin" hidden />}
      {mapError && (
        <p role="status" className="absolute inset-x-2 bottom-10 z-10 rounded bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm">
          {hasApiKey
            ? 'Google Maps could not load. Check the API key restrictions and that Maps JavaScript is enabled.'
            : 'Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to hrsolutions/.env and restart the app.'}
        </p>
      )}

      {/* Zoom and GPS Buttons */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <div className="flex flex-col bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => {
              const map = mapInstanceRef.current;
              if (!map) return;
              map.setZoom((map.getZoom() || 16) + 1);
            }}
            className="h-6 w-6 text-xs text-slate-700 hover:bg-slate-100 border-b border-slate-100 font-bold"
            title="Zoom In"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              const map = mapInstanceRef.current;
              if (!map) return;
              map.setZoom(Math.max((map.getZoom() || 16) - 1, 1));
            }}
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
