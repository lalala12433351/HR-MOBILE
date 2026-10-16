export type AddressSearchResult = {
  name: string;
  lat: number;
  lng: number;
};

declare global {
  interface Window {
    google?: { maps: typeof google.maps };
    __pixbeGoogleMapsReady?: () => void;
  }
}

let mapsLoader: Promise<typeof google.maps> | null = null;

export function getGoogleMapsApiKey(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
}

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser'));
  }

  if (window.google?.maps?.Map && window.google?.maps?.Geocoder) {
    return Promise.resolve(window.google.maps);
  }

  if (mapsLoader) return mapsLoader;

  mapsLoader = new Promise((resolve, reject) => {
    if (window.google?.maps?.Map && window.google?.maps?.Geocoder) {
      resolve(window.google.maps);
      return;
    }

    const key = getGoogleMapsApiKey();
    if (!key) {
      mapsLoader = null;
      reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set'));
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-pixbe-google-maps="true"]');
    if (existing) {
      existing.addEventListener('error', () => {
        mapsLoader = null;
        reject(new Error('Failed to load Google Maps'));
      });
      window.__pixbeGoogleMapsReady = () => resolve(window.google!.maps);
      return;
    }

    window.__pixbeGoogleMapsReady = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else {
        mapsLoader = null;
        reject(new Error('Google Maps loaded without the maps API'));
      }
    };

    const script = document.createElement('script');
    script.dataset.pixbeGoogleMaps = 'true';
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__pixbeGoogleMapsReady&v=weekly`;
    script.onerror = () => {
      mapsLoader = null;
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });

  return mapsLoader;
}

function asLatLngLiteral(value: google.maps.LatLng | google.maps.LatLngLiteral): { lat: number; lng: number } {
  if (typeof (value as google.maps.LatLng).lat === 'function') {
    const latLng = value as google.maps.LatLng;
    return { lat: latLng.lat(), lng: latLng.lng() };
  }
  const literal = value as google.maps.LatLngLiteral;
  return { lat: literal.lat, lng: literal.lng };
}

function geocode(request: google.maps.GeocoderRequest): Promise<google.maps.GeocoderResult[]> {
  return loadGoogleMaps().then(
    (maps) =>
      new Promise((resolve, reject) => {
        const geocoder = new maps.Geocoder();
        geocoder.geocode(request, (results, status) => {
          if (status === 'OK' || status === 'ZERO_RESULTS') {
            resolve(results || []);
            return;
          }
          reject(new Error(`Google geocoder failed: ${status}`));
        });
      }),
  );
}

export async function searchGoogleAddresses(query: string): Promise<AddressSearchResult[]> {
  const results = await geocode({ address: query });
  return results.slice(0, 5).map((item) => {
    const { lat, lng } = asLatLngLiteral(item.geometry.location);
    return {
      name: item.formatted_address || query,
      lat,
      lng,
    };
  });
}

export async function reverseGeocodeLatLng(lat: number, lng: number): Promise<string | null> {
  const results = await geocode({ location: { lat, lng } });
  return results[0]?.formatted_address || null;
}
