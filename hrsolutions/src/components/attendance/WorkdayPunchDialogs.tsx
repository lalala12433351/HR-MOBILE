'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PunchLocationLeafletMap } from '@/components/common/PunchLocationLeafletMap';
import { reverseGeocodeLatLng } from '@/lib/googleMaps';
import {
  getCurrentPosition,
  getSelfieStream,
  isNativePlatform,
} from '@/lib/native';

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface PunchConfirmPayload {
  selfiePhoto?: string | null;
  latitude?: number;
  longitude?: number;
  asRemote: boolean;
  notes?: string;
}

interface WorkdayPunchDialogsProps {
  open: boolean;
  now: Date;
  isCheckedIn: boolean;
  selectedLocation: string;
  locationLabel: string;
  requireSelfie: boolean;
  requireGps: boolean;
  geofenceOptional: boolean;
  outOfRadiusAction: 'Block' | 'Allow' | 'Warn';
  officeLat?: number | null;
  officeLng?: number | null;
  radiusMeters: number;
  isInstitution: boolean;
  saving: boolean;
  clockOutNotes: string;
  onClockOutNotesChange: (value: string) => void;
  onClose: () => void;
  onConfirm: (payload: PunchConfirmPayload) => void;
}

export function WorkdayPunchDialogs({
  open,
  now,
  isCheckedIn,
  selectedLocation,
  locationLabel,
  requireSelfie,
  requireGps,
  geofenceOptional,
  outOfRadiusAction,
  officeLat,
  officeLng,
  radiusMeters,
  isInstitution,
  saving,
  clockOutNotes,
  onClockOutNotesChange,
  onClose,
  onConfirm,
}: WorkdayPunchDialogsProps) {
  const isWfh = selectedLocation === 'wfh';
  const hasOfficeCoords =
    Number.isFinite(Number(officeLat)) &&
    Number.isFinite(Number(officeLng)) &&
    Number(officeLat) !== 0 &&
    Number(officeLng) !== 0;

  const [step, setStep] = useState<'map' | 'confirm_out_radius' | 'selfie'>('map');
  const [punchAddress, setPunchAddress] = useState('Finding your location…');
  const [currentLat, setCurrentLat] = useState(Number(officeLat) || 0);
  const [currentLng, setCurrentLng] = useState(Number(officeLng) || 0);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'locating' | 'granted' | 'denied'>('locating');
  const [hasDeviceGps, setHasDeviceGps] = useState(false);
  const [insideRadius, setInsideRadius] = useState(true);
  const [distance, setDistance] = useState(0);
  const [asRemote, setAsRemote] = useState(isWfh);

  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const fetchLocation = useCallback(() => {
    setIsLocating(true);
    setGpsStatus('locating');

    void (async () => {
      try {
        const coords = await getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
        const lat = coords.latitude;
        const lng = coords.longitude;
        setCurrentLat(lat);
        setCurrentLng(lng);
        setHasDeviceGps(true);
        setGpsStatus('granted');
        setIsLocating(false);

        if (isWfh || geofenceOptional) {
          setInsideRadius(true);
          setDistance(0);
        } else if (!hasOfficeCoords) {
          setInsideRadius(false);
          setDistance(0);
        } else {
          const dist = distanceMeters(lat, lng, Number(officeLat), Number(officeLng));
          setDistance(dist);
          setInsideRadius(dist <= radiusMeters);
        }

        try {
          const address = await reverseGeocodeLatLng(lat, lng);
          setPunchAddress(address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } catch {
          setPunchAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      } catch (error) {
        setIsLocating(false);
        setHasDeviceGps(false);
        setGpsStatus(geofenceOptional || isWfh ? 'granted' : 'denied');
        if (geofenceOptional || isWfh) setInsideRadius(true);
        const message = error instanceof Error ? error.message : '';
        const denied = /denied|permission/i.test(message);
        setPunchAddress(
          denied
            ? isNativePlatform()
              ? 'Location is blocked. Allow location for this app in system settings, then retry.'
              : 'Location is blocked. Allow it in the address bar, then retry.'
            : 'Unable to retrieve your current location.'
        );
      }
    })();
  }, [geofenceOptional, hasOfficeCoords, isWfh, locationLabel, officeLat, officeLng, radiusMeters]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setStep('map');
      setCapturedSelfie(null);
      setCameraError(null);
      setAsRemote(isWfh);
      return;
    }
    setStep('map');
    setAsRemote(isWfh);
    setPunchAddress('Finding your location…');
    fetchLocation();
    // Reset only when the dialog opens, not on later GPS helper identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || step !== 'selfie') {
      if (step !== 'selfie') stopCamera();
      return;
    }
    let cancelled = false;
    setIsCameraLoading(true);
    setIsCameraReady(false);
    setCameraError(null);

    (async () => {
      try {
        stopCamera();
        const { stream } = await getSelfieStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = async () => {
            if (cancelled || !videoRef.current) return;
            try {
              await videoRef.current.play();
            } catch {
              // Autoplay can be blocked; the muted attribute usually allows it.
            }
            if (!cancelled) {
              setIsCameraLoading(false);
              setIsCameraReady(true);
            }
          };
          window.setTimeout(() => {
            if (!cancelled && videoRef.current && videoRef.current.srcObject === stream) {
              videoRef.current.play().catch(() => {});
              setIsCameraLoading(false);
              setIsCameraReady(true);
            }
          }, 600);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: string }).name) : '';
        const message = err instanceof Error ? err.message : '';
        setCameraError(
          name === 'NotAllowedError' || name === 'PermissionDeniedError' || /denied|permission/i.test(message)
            ? isNativePlatform()
              ? 'Camera access is blocked. Allow camera for this app in system settings and retry.'
              : 'Camera access is blocked. Allow camera permissions in the address bar and retry.'
            : 'Camera device unavailable. Connect a camera and retry.'
        );
        setIsCameraLoading(false);
        setIsCameraReady(false);
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
      setIsCameraReady(false);
    };
  }, [open, step, cameraAttempt, stopCamera]);

  const finish = (remote: boolean, photo?: string | null) => {
    onConfirm({
      selfiePhoto: photo,
      latitude: hasDeviceGps ? currentLat : undefined,
      longitude: hasDeviceGps ? currentLng : undefined,
      asRemote: remote || isWfh,
      notes: isCheckedIn ? clockOutNotes : undefined,
    });
  };

  const openSelfieOrFinish = (remote: boolean) => {
    setAsRemote(remote);
    if (requireSelfie) {
      setCapturedSelfie(null);
      setCameraError(null);
      setIsCameraLoading(true);
      setIsCameraReady(false);
      setCameraAttempt((n) => n + 1);
      setStep('selfie');
      return;
    }
    finish(remote, null);
  };

  const proceedFromMap = () => {
    if (!isWfh && !geofenceOptional && !hasOfficeCoords) return;
    if (isWfh || geofenceOptional || insideRadius) {
      openSelfieOrFinish(isWfh);
      return;
    }
    if (outOfRadiusAction === 'Allow') {
      openSelfieOrFinish(true);
      return;
    }
    setStep('confirm_out_radius');
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isCameraReady || isCameraLoading) return;
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return;

    setIsFlashing(true);
    window.setTimeout(() => setIsFlashing(false), 400);

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    setCapturedSelfie(canvas.toDataURL('image/jpeg', 0.92));
    stopCamera();
  };

  const retryCamera = () => {
    setCapturedSelfie(null);
    setCameraError(null);
    setIsCameraLoading(true);
    setIsCameraReady(false);
    stopCamera();
    setCameraAttempt((n) => n + 1);
  };

  if (!open) return null;

  const officeCoordsMissing = !geofenceOptional && !isWfh && !hasOfficeCoords;
  const gpsRequiredMissing =
    requireGps &&
    !geofenceOptional &&
    !isWfh &&
    hasOfficeCoords &&
    (!hasDeviceGps || gpsStatus !== 'granted');
  const isPunchDisabled = isLocating || officeCoordsMissing || gpsRequiredMissing || saving;

  const timeLabel = formatClock(now);
  const dateLabel = formatDate(now);

  if (step === 'selfie') {
    return (
      <div className="att-overlay" role="presentation">
        <div className="att-dialog" role="dialog" aria-modal="true" aria-labelledby="att-selfie-title">
          <div className="att-dialog-head">
            <h2 id="att-selfie-title">Take photo</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="work-btn-secondary h-9 px-3 text-xs"
                onClick={() => {
                  stopCamera();
                  setStep('map');
                }}
              >
                Location
              </button>
              <button type="button" className="att-dialog-close" aria-label="Close" onClick={onClose} disabled={saving}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="att-dialog-camera">
            {isFlashing && (
              <div className="absolute inset-0 bg-[var(--bg-surface)] z-50 pointer-events-none animate-camera-flash" />
            )}
            {cameraError ? (
              <div className="att-dialog-camera-empty">
                <p>{cameraError}</p>
                <p>Allow the camera in the address bar, then retry.</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={retryCamera} disabled={isCameraLoading} className="work-btn-primary">
                    {isCameraLoading ? 'Connecting…' : 'Retry camera'}
                  </button>
                </div>
              </div>
            ) : capturedSelfie ? (
              <img src={capturedSelfie} alt="Captured punch photo" />
            ) : (
              <>
                {isCameraLoading && (
                  <div className="att-dialog-camera-empty">
                    <p>Connecting camera…</p>
                  </div>
                )}
                <video
                  ref={videoRef}
                  className={`scale-x-[-1] transition-opacity duration-300 ${isCameraReady ? 'opacity-100' : 'opacity-0'}`}
                  autoPlay
                  playsInline
                  muted
                />
              </>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          <div className="att-dialog-foot">
            <div className="att-dialog-meta">
              <strong suppressHydrationWarning>{timeLabel}</strong>
              <span>{dateLabel}</span>
            </div>
            {capturedSelfie ? (
              <div className="flex items-center gap-2">
                <button type="button" className="work-btn-secondary" onClick={retryCamera} disabled={saving}>
                  Retake
                </button>
                <button
                  type="button"
                  className="work-btn-primary"
                  onClick={() => finish(asRemote, capturedSelfie)}
                  disabled={saving}
                >
                  {saving ? 'Recording…' : 'Confirm punch'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="work-btn-primary"
                onClick={takePhoto}
                disabled={isCameraLoading || !isCameraReady || !!cameraError || saving}
              >
                {cameraError ? 'Camera offline' : isCameraLoading || !isCameraReady ? 'Connecting…' : 'Take photo'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="att-overlay" role="presentation" onClick={saving ? undefined : onClose}>
      <div
        className="att-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="att-punch-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="att-dialog-head">
          <h2 id="att-punch-title">{step === 'map' ? 'Confirm location' : 'Outside the office'}</h2>
          <button type="button" className="att-dialog-close" onClick={onClose} aria-label="Close" disabled={saving}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 'map' ? (
          <div className="att-dialog-body">
            <PunchLocationLeafletMap
              latitude={currentLat}
              longitude={currentLng}
              onRecalibrateGPS={fetchLocation}
              isLocating={isLocating}
            />
          </div>
        ) : (
          <div className="att-dialog-warn">
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed m-0">
              You are{' '}
              <strong className="text-[var(--text-primary)]">
                {distance > 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} meters`}
              </strong>{' '}
              from {locationLabel}. The boundary is {radiusMeters} meters.
            </p>
            <div className="att-dialog-alert">
              {isInstitution
                ? 'Campus attendance is blocked outside the campus boundary. You need to be on campus to punch.'
                : 'Office attendance is blocked outside the radius. Be at the workplace, or request WFH approval for your manager.'}
            </div>
            <div className="dash-clock-dialog-actions" style={{ justifyContent: 'stretch' }}>
              <button type="button" className="work-btn-secondary flex-1" onClick={() => setStep('map')}>
                Back to map
              </button>
              {!isInstitution && (
                <button
                  type="button"
                  className="work-btn-primary flex-1"
                  onClick={() => openSelfieOrFinish(true)}
                  disabled={saving}
                >
                  Request WFH approval
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="shrink-0">
            {geofenceOptional && !isWfh && (
              <div className="att-dialog-notice">Geofence is off for this punch — office radius is not enforced.</div>
            )}
            {officeCoordsMissing && (
              <div className="att-dialog-notice att-dialog-notice--error">
                Office GPS is not set. Add coordinates in Settings, or punch as work from home.
              </div>
            )}
            <div
              className={`att-dialog-status flex items-center justify-between gap-3 ${
                gpsStatus === 'denied' && !isWfh ? 'att-dialog-status--error' : ''
              }`}
            >
              <p className="truncate m-0 text-[12px]">
                {isLocating
                  ? 'Finding your location…'
                  : isWfh && gpsStatus === 'denied'
                    ? 'Work from home — location not required'
                    : isWfh
                      ? `${punchAddress} (WFH)`
                      : punchAddress}
              </p>
              {gpsStatus === 'denied' && !isWfh && (
                <button type="button" className="work-btn-secondary h-8 px-3 text-xs" onClick={fetchLocation}>
                  Retry GPS
                </button>
              )}
            </div>

            {isCheckedIn && (
              <div className="px-4 pt-3">
                <textarea
                  className="dash-clock-notes"
                  value={clockOutNotes}
                  onChange={(e) => onClockOutNotesChange(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                />
              </div>
            )}

            <div className="att-dialog-foot">
              <div className="att-dialog-meta">
                <strong suppressHydrationWarning>{timeLabel}</strong>
                <span>{dateLabel}</span>
              </div>
              <button
                type="button"
                onClick={proceedFromMap}
                disabled={isPunchDisabled}
                title={
                  officeCoordsMissing
                    ? 'Configure office latitude/longitude in Settings, or switch to WFH'
                    : isLocating
                      ? 'Acquiring device GPS location...'
                      : gpsRequiredMissing
                        ? 'Location permission is required to verify office attendance'
                        : requireSelfie
                          ? 'Proceed to face verification'
                          : isCheckedIn
                            ? 'Confirm clock out'
                            : 'Confirm punch in'
                }
                className={`work-btn-primary ${isPunchDisabled ? 'opacity-55 cursor-not-allowed' : ''}`}
              >
                Confirm location
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
