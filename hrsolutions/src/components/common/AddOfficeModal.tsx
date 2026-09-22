'use client';

import React, { useState, useEffect } from 'react';
import { OfficeLocationPickerMap } from './OfficeLocationPickerMap';
import {
  DEFAULT_GEO_COORDINATES,
  DEFAULT_OFFICE_RADIUS_METERS,
  MAX_GEOFENCE_LIMIT_METERS,
  MIN_GEOFENCE_LIMIT_METERS,
} from '@/config/constants';
import { getCurrentPosition } from '@/lib/native';

export interface OfficeModalData {
  id?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  clockingDevices?: string;
  qrCodeEnabled?: boolean;
  geofencingStatus?: 'Active' | 'Inactive';
  policyDescription?: string;
}

interface AddOfficeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (office: OfficeModalData) => void;
  initialData?: OfficeModalData | null;
}

export const AddOfficeModal: React.FC<AddOfficeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number>(DEFAULT_GEO_COORDINATES.latitude);
  const [longitude, setLongitude] = useState<number>(DEFAULT_GEO_COORDINATES.longitude);
  const [radiusMeters, setRadiusMeters] = useState<number>(DEFAULT_OFFICE_RADIUS_METERS);
  const [geofencingStatus, setGeofencingStatus] = useState<'Active' | 'Inactive'>('Active');
  const [clockingDevices, setClockingDevices] = useState('Desktop, Mobile');
  const [policyDescription, setPolicyDescription] = useState('Not allow clock in/out outside the office');

  const MAX_GEOFENCE_LIMIT = MAX_GEOFENCE_LIMIT_METERS;
  const MIN_GEOFENCE_LIMIT = MIN_GEOFENCE_LIMIT_METERS;

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name || '');
        setAddress(initialData.address || '');
        setLatitude(initialData.latitude || DEFAULT_GEO_COORDINATES.latitude);
        setLongitude(initialData.longitude || DEFAULT_GEO_COORDINATES.longitude);
        setRadiusMeters(Math.min(MAX_GEOFENCE_LIMIT, Math.max(MIN_GEOFENCE_LIMIT, initialData.radiusMeters || DEFAULT_OFFICE_RADIUS_METERS)));
        setGeofencingStatus(initialData.geofencingStatus || 'Active');
        setClockingDevices(initialData.clockingDevices || 'Desktop, Mobile');
        setPolicyDescription(initialData.policyDescription || 'Not allow clock in/out outside the office');
      } else {
        setName('');
        setAddress('');
        setRadiusMeters(DEFAULT_OFFICE_RADIUS_METERS);
        setGeofencingStatus('Active');
        setClockingDevices('Desktop, Mobile');
        setPolicyDescription('Not allow clock in/out outside the office');
        void getCurrentPosition({ enableHighAccuracy: true, timeout: 6000 })
          .then((pos) => {
            setLatitude(pos.latitude);
            setLongitude(pos.longitude);
          })
          .catch(() => {
            setLatitude(DEFAULT_GEO_COORDINATES.latitude);
            setLongitude(DEFAULT_GEO_COORDINATES.longitude);
          });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleLocationChange = (lat: number, lng: number, newAddress?: string) => {
    setLatitude(lat);
    setLongitude(lng);
    if (newAddress) {
      setAddress(newAddress);
    }
  };

  const handleRadiusChange = (val: number) => {
    const clamped = Math.min(MAX_GEOFENCE_LIMIT, Math.max(MIN_GEOFENCE_LIMIT, val));
    setRadiusMeters(clamped);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const finalRadius = Math.min(MAX_GEOFENCE_LIMIT, Math.max(MIN_GEOFENCE_LIMIT, Number(radiusMeters) || 150));

    onSave({
      id: initialData?.id || `off_${Date.now()}`,
      name: name.trim(),
      address: address.trim() || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      latitude,
      longitude,
      radiusMeters: finalRadius,
      clockingDevices,
      qrCodeEnabled: true,
      geofencingStatus,
      policyDescription,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <div className="relative w-full max-w-lg h-full bg-white border-l border-slate-200 shadow-lg flex flex-col text-slate-800">
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {initialData?.id ? 'Edit Office Location' : 'Add Office Location'}
            </h3>
            <p className="text-[11px] text-slate-500">
              Set campus address, GPS coordinates, and geofence radius.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 text-xs"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between overflow-hidden bg-white">
          <div className="p-6 space-y-4 overflow-y-auto text-xs">
            {/* Office Name */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Office / Branch Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Bengaluru HQ"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Map */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">Location</label>
                <span className="text-[11px] text-slate-400 font-mono">{latitude.toFixed(4)}, {longitude.toFixed(4)}</span>
              </div>
              <OfficeLocationPickerMap
                latitude={latitude}
                longitude={longitude}
                onLocationChange={handleLocationChange}
                className="h-44"
              />
            </div>

            {/* Street Address */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                readOnly
                placeholder="Street address (Selected on map) *"
                value={address}
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:outline-none cursor-default font-medium select-none"
              />
            </div>

            {/* Geofence Radius Minimal */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">
                  Geofence Radius
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={MIN_GEOFENCE_LIMIT}
                    max={MAX_GEOFENCE_LIMIT}
                    step={1}
                    value={radiusMeters}
                    onChange={(e) => handleRadiusChange(Number(e.target.value))}
                    className="w-14 px-1.5 py-0.5 text-right font-mono text-xs border border-slate-300 rounded text-blue-600 focus:outline-none focus:border-blue-600 font-semibold"
                  />
                  <span className="text-xs text-slate-500">meters</span>
                </div>
              </div>

              <input
                type="range"
                min={25}
                max={MAX_GEOFENCE_LIMIT}
                step={25}
                value={radiusMeters}
                onChange={(e) => handleRadiusChange(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />

              <div className="flex gap-1">
                {[50, 100, 250, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleRadiusChange(preset)}
                    className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                      radiusMeters === preset
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {preset === 1000 ? '1km' : `${preset}m`}
                  </button>
                ))}
              </div>
            </div>

            {/* Geofencing Status & Allowed Devices */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={geofencingStatus}
                  onChange={(e) => setGeofencingStatus(e.target.value as 'Active' | 'Inactive')}
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-blue-600"
                >
                  <option value="Active">Active (Strict GPS)</option>
                  <option value="Inactive">Inactive (GPS Optional)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Allowed Devices
                </label>
                <select
                  value={clockingDevices}
                  onChange={(e) => setClockingDevices(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-blue-600"
                >
                  <option value="Desktop, Mobile">Desktop & Mobile</option>
                  <option value="Mobile Only">Mobile Only</option>
                  <option value="Biometric Kiosk Only">Biometric Only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 px-6 border-t border-slate-200 bg-white flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              {initialData?.id ? 'Save Changes' : 'Add Office'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
