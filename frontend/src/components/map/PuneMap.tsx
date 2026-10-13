import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import type { Hospital } from '../../types/hospital';
import type { Ambulance } from '../../types/ambulance';
import type { HospitalRecommendation } from '../../types/allocation';
import { fetchDrivingRoute } from '../../services/routingService';
import type { RouteResult } from '../../services/routingService';
import type { AmbulanceSimulationSnapshot } from '../../services/ambulanceSimulation';
import {
  MapPin,
  Clock,
  Compass,
  RotateCcw,
} from 'lucide-react';

export interface EmergencyPoint {
  latitude: number;
  longitude: number;
  label?: string;
  caseNumber?: string;
}

export interface PuneLocationPreset {
  name: string;
  latitude: number;
  longitude: number;
  description: string;
}

export const PUNE_PRESETS: PuneLocationPreset[] = [
  {
    name: 'FC Road / Deccan',
    latitude: 18.5204,
    longitude: 73.841,
    description: 'Central Commercial Area',
  },
  {
    name: 'Swargate Chowk',
    latitude: 18.5018,
    longitude: 73.858,
    description: 'Major Transit Hub',
  },
  {
    name: 'Shivajinagar Station',
    latitude: 18.5314,
    longitude: 73.851,
    description: 'Railway & Metro Hub',
  },
  {
    name: 'Kothrud (Paud Road)',
    latitude: 18.5074,
    longitude: 73.8077,
    description: 'Western Residential Corridor',
  },
  {
    name: 'Hadapsar (Magarpatta)',
    latitude: 18.5089,
    longitude: 73.926,
    description: 'Eastern IT & Industrial Zone',
  },
  {
    name: 'Viman Nagar (Airport Rd)',
    latitude: 18.5679,
    longitude: 73.9143,
    description: 'North-East Corridor',
  },
  {
    name: 'Pune Railway Station',
    latitude: 18.5284,
    longitude: 73.8742,
    description: 'Central Station Area',
  },
];

interface PuneMapProps {
  hospitals: Hospital[];
  emergencyPoint: EmergencyPoint;
  onEmergencyPointChange?: (point: EmergencyPoint) => void;
  ambulances?: Ambulance[];
  ambulanceSimulation?: AmbulanceSimulationSnapshot | null;
  selectedHospitalId: number | null;
  onSelectHospital: (hospitalId: number) => void;
  onRouteInfoChange?: (route: RouteResult | null) => void;
  recommendations?: HospitalRecommendation[];
  height?: string;
  showRouteInfo?: boolean;
  showControls?: boolean;
}

export const PuneMap: React.FC<PuneMapProps> = ({
  hospitals,
  emergencyPoint,
  onEmergencyPointChange,
  ambulances = [],
  ambulanceSimulation = null,
  selectedHospitalId,
  onSelectHospital,
  onRouteInfoChange,
  recommendations = [],
  height = '520px',
  showRouteInfo = true,
  showControls = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const ambulanceMarkerRef = useRef<Record<number, L.Marker | null>>({});

  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Default Pune center
  const PUNE_CENTER: [number, number] = [18.5204, 73.8567];

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [emergencyPoint.latitude || PUNE_CENTER[0], emergencyPoint.longitude || PUNE_CENTER[1]],
        zoom: 12,
        zoomControl: true,
      });

      // Clean OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Layer group for dynamic markers
      const markerGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markerGroup;
      mapInstanceRef.current = map;

      // Handle click to set emergency location
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (onEmergencyPointChange) {
          onEmergencyPointChange({
            latitude: Number(e.latlng.lat.toFixed(6)),
            longitude: Number(e.latlng.lng.toFixed(6)),
            label: 'Custom Map Click',
          });
        }
      });
    }

    return () => {
      // Map cleanup on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const timer = window.setTimeout(() => map.invalidateSize({ pan: false }), 100);
    return () => window.clearTimeout(timer);
  }, [height, showControls]);

  // Update Route when selected hospital or emergency changes
  const updateRoute = useCallback(async () => {
    if (!selectedHospitalId) {
      if (routeLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }
      setRouteInfo(null);
      if (onRouteInfoChange) {
        onRouteInfoChange(null);
      }
      return;
    }

    const hospital = hospitals.find((h) => h.id === selectedHospitalId);
    if (!hospital || !hospital.latitude || !hospital.longitude) {
      setRouteInfo(null);
      if (onRouteInfoChange) {
        onRouteInfoChange(null);
      }
      return;
    }

    setRouteLoading(true);

    try {
      const result = await fetchDrivingRoute(
        emergencyPoint.latitude,
        emergencyPoint.longitude,
        Number(hospital.latitude),
        Number(hospital.longitude)
      );

      setRouteInfo(result);
      if (onRouteInfoChange) {
        onRouteInfoChange(result);
      }

      if (mapInstanceRef.current) {
        // Remove existing route layer
        if (routeLayerRef.current) {
          mapInstanceRef.current.removeLayer(routeLayerRef.current);
        }

        // Draw fresh medical transit route polyline
        const polyline = L.polyline(result.coordinates, {
          color: '#0F766E', // Healthcare Teal
          weight: 5,
          opacity: 0.85,
          lineJoin: 'round',
          dashArray: result.isFallback ? '6, 8' : undefined,
        }).addTo(mapInstanceRef.current);

        routeLayerRef.current = polyline;

        // Fit map bounds to show entire route with comfortable padding
        const bounds = L.latLngBounds([
          [emergencyPoint.latitude, emergencyPoint.longitude],
          [Number(hospital.latitude), Number(hospital.longitude)],
        ]);
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    } catch (err) {
      console.error('Failed to calculate route:', err);
    } finally {
      setRouteLoading(false);
    }
  }, [emergencyPoint, selectedHospitalId, hospitals]);

  useEffect(() => {
    updateRoute();
  }, [updateRoute]);

  // Update static map markers without recreating the live ambulance marker on every tick.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markerGroup = markersLayerRef.current;
    if (!map || !markerGroup) return;

    markerGroup.clearLayers();
    ambulanceMarkerRef.current = {};

    // 1. Emergency Scene Marker
    const emergencyIconHtml = `
      <div class="relative flex items-center justify-center">
        <span class="absolute w-8 h-8 rounded-full bg-red-500 opacity-30 animate-ping"></span>
        <div class="w-9 h-9 rounded-full bg-red-600 border-2 border-white shadow-lg flex items-center justify-center text-white font-bold">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
      </div>
    `;

    const emergencyIcon = L.divIcon({
      html: emergencyIconHtml,
      className: 'emergency-custom-marker',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    const emergencyMarker = L.marker([emergencyPoint.latitude, emergencyPoint.longitude], {
      icon: emergencyIcon,
      zIndexOffset: 1000,
    }).addTo(markerGroup);

    emergencyMarker.bindPopup(`
      <div class="p-2 min-w-[200px]">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-red-600"></span>
          <h4 class="font-bold text-sm text-slate-800">Emergency Incident Scene</h4>
        </div>
        <p class="text-xs text-slate-600 font-medium mb-1">${emergencyPoint.label || 'Active Incident Point'}</p>
        <p class="text-[11px] font-mono text-slate-400">GPS: ${emergencyPoint.latitude.toFixed(4)}, ${emergencyPoint.longitude.toFixed(4)}</p>
        <p class="text-[10px] text-teal-700 bg-teal-50 rounded px-1.5 py-0.5 mt-2 border border-teal-200">
          Tip: Click anywhere on map to relocate incident
        </p>
      </div>
    `);

    // 2. Pune Hospital Markers
    hospitals.forEach((hospital) => {
      if (!hospital.latitude || !hospital.longitude) return;

      const lat = Number(hospital.latitude);
      const lon = Number(hospital.longitude);
      const isSelected = selectedHospitalId === hospital.id;
      const isOffline = hospital.status === 'Offline';
      const isBusy = hospital.status === 'Busy';

      const rec = recommendations.find((r) => r.hospital_id === hospital.id);
      const isRankOne = rec && recommendations[0]?.hospital_id === hospital.id;

      let markerBg = 'bg-teal-600';
      if (isOffline) markerBg = 'bg-slate-400';
      else if (isBusy) markerBg = 'bg-amber-500';
      else if (isSelected) markerBg = 'bg-teal-700';

      const hospitalIconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-110">
          ${isSelected ? '<span class="absolute -inset-2 rounded-xl bg-teal-400 opacity-40 animate-pulse"></span>' : ''}
          <div class="w-8 h-8 rounded-xl ${markerBg} border-2 ${
        isSelected ? 'border-amber-400 ring-2 ring-amber-300' : 'border-white'
      } shadow-md flex items-center justify-center text-white">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
            </svg>
          </div>
          ${
            isRankOne
              ? '<span class="absolute -top-1.5 -right-1.5 bg-amber-400 text-slate-900 text-[9px] font-black rounded-full px-1.5 shadow">#1</span>'
              : ''
          }
        </div>
      `;

      const hospitalIcon = L.divIcon({
        html: hospitalIconHtml,
        className: 'hospital-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const hospitalMarker = L.marker([lat, lon], {
        icon: hospitalIcon,
        zIndexOffset: isSelected ? 900 : 700,
      }).addTo(markerGroup);

      const icu = hospital.resources?.find((r) => r.resource_type === 'ICU_BED');
      const gen = hospital.resources?.find((r) => r.resource_type === 'GENERAL_BED');
      const vent = hospital.resources?.find((r) => r.resource_type === 'VENTILATOR');
      const trauma = hospital.resources?.find((r) => r.resource_type === 'TRAUMA_BED');
      const or = hospital.resources?.find((r) => r.resource_type === 'OPERATING_ROOM');

      const popupHtml = `
        <div class="p-3 w-64 space-y-2">
          <div class="border-b border-slate-100 pb-2">
            <div class="flex items-center justify-between gap-1">
              <h4 class="font-bold text-slate-800 text-sm leading-tight">${hospital.name}</h4>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                isOffline
                  ? 'bg-slate-100 text-slate-600'
                  : isBusy
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-50 text-emerald-700'
              }">${hospital.status}</span>
            </div>
            <p class="text-[11px] text-slate-500 mt-1">${hospital.address || 'Pune, Maharashtra'}</p>
          </div>

          <div class="bg-teal-50 border border-teal-200 rounded-lg p-2 text-center">
            <span class="text-[10px] font-bold tracking-wide uppercase text-teal-800 block">
              Simulated Live Availability
            </span>
          </div>

          <div class="grid grid-cols-3 gap-1.5 text-center text-xs">
            <div class="bg-slate-50 p-1.5 rounded border border-slate-100">
              <span class="text-[10px] text-slate-400 block font-medium">ICU</span>
              <span class="font-bold text-teal-700">${icu?.available ?? 0}</span>
              <span class="text-[10px] text-slate-400">/${icu?.total ?? 0}</span>
            </div>
            <div class="bg-slate-50 p-1.5 rounded border border-slate-100">
              <span class="text-[10px] text-slate-400 block font-medium">Ventilator</span>
              <span class="font-bold text-teal-700">${vent?.available ?? 0}</span>
              <span class="text-[10px] text-slate-400">/${vent?.total ?? 0}</span>
            </div>
            <div class="bg-slate-50 p-1.5 rounded border border-slate-100">
              <span class="text-[10px] text-slate-400 block font-medium">General</span>
              <span class="font-bold text-slate-700">${gen?.available ?? 0}</span>
              <span class="text-[10px] text-slate-400">/${gen?.total ?? 0}</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-1.5 text-center text-xs">
            <div class="bg-slate-50 p-1.5 rounded border border-slate-100">
              <span class="text-[10px] text-slate-400 block font-medium">Trauma Beds</span>
              <span class="font-bold text-slate-700">${trauma?.available ?? 0}</span>
              <span class="text-[10px] text-slate-400">/${trauma?.total ?? 0}</span>
            </div>
            <div class="bg-slate-50 p-1.5 rounded border border-slate-100">
              <span class="text-[10px] text-slate-400 block font-medium">Operating OR</span>
              <span class="font-bold text-slate-700">${or?.available ?? 0}</span>
              <span class="text-[10px] text-slate-400">/${or?.total ?? 0}</span>
            </div>
          </div>

          <div class="pt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>Last updated: Recently</span>
            ${
              hospital.trauma_center
                ? '<span class="text-amber-600 font-semibold bg-amber-50 px-1 rounded">Trauma Center</span>'
                : ''
            }
          </div>

          <button
            id="popup-btn-${hospital.id}"
            class="w-full mt-2 py-1.5 px-3 rounded-lg text-xs font-semibold ${
              isSelected
                ? 'bg-slate-100 text-slate-600 border border-slate-300'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            } transition-colors cursor-pointer"
          >
            ${isSelected ? 'Selected Destination' : 'Select as Destination'}
          </button>
        </div>
      `;

      hospitalMarker.bindPopup(popupHtml);

      hospitalMarker.on('popupopen', () => {
        const btn = document.getElementById(`popup-btn-${hospital.id}`);
        if (btn) {
          btn.onclick = () => {
            onSelectHospital(hospital.id);
            hospitalMarker.closePopup();
          };
        }
      });
    });
  }, [hospitals, emergencyPoint, selectedHospitalId, recommendations, onSelectHospital]);

  useEffect(() => {
    const markerGroup = markersLayerRef.current;
    if (!markerGroup) return;

    ambulances.forEach((amb) => {
      const liveSimulation = ambulanceSimulation && ambulanceSimulation.ambulanceId === amb.id ? ambulanceSimulation : null;
      const currentLat = liveSimulation?.currentLatitude ?? amb.current_latitude;
      const currentLon = liveSimulation?.currentLongitude ?? amb.current_longitude;

      if (!currentLat || !currentLon) return;

      const markerStatus = liveSimulation?.status ?? amb.status;
      const isAvailable = !liveSimulation && amb.status === 'AVAILABLE';
      const markerBg =
        markerStatus === 'ARRIVED'
          ? 'bg-blue-600'
          : markerStatus === 'EN_ROUTE' || markerStatus === 'DISPATCHED'
          ? 'bg-teal-600'
          : 'bg-amber-500';

      const ambIconHtml = `
        <div class="relative flex items-center justify-center">
          <div class="w-8 h-8 rounded-lg ${markerBg} border-2 border-white shadow-md flex items-center justify-center text-white">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
        </div>
      `;

      const ambIcon = L.divIcon({
        html: ambIconHtml,
        className: 'ambulance-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      let ambMarker = ambulanceMarkerRef.current[amb.id];
      if (!ambMarker) {
        ambMarker = L.marker([currentLat, currentLon], {
          icon: ambIcon,
          zIndexOffset: 800,
        }).addTo(markerGroup);
        ambulanceMarkerRef.current[amb.id] = ambMarker;
      }

      ambMarker.setIcon(ambIcon);
      ambMarker.setLatLng([currentLat, currentLon]);
      ambMarker.bindPopup(`
        <div class="p-2">
          <div class="flex items-center justify-between gap-2 mb-1">
            <h4 class="font-bold text-xs text-slate-800">Ambulance ${amb.vehicle_number}</h4>
            <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
            }">${markerStatus}</span>
          </div>
          <p class="text-[11px] font-mono text-slate-500">Location: ${currentLat.toFixed(4)}, ${currentLon.toFixed(4)}</p>
          ${liveSimulation ? `<p class="text-[10px] text-teal-700 mt-1">ETA ${Math.max(0, Math.round(liveSimulation.etaSecondsRemaining / 60))}m ${Math.round(liveSimulation.etaSecondsRemaining % 60)}s · Progress ${Math.round(liveSimulation.progress * 100)}%</p>` : ''}
        </div>
      `);
    });

    Object.entries(ambulanceMarkerRef.current).forEach(([id, marker]) => {
      const numericId = Number(id);
      const stillExists = ambulances.some((amb) => amb.id === numericId);
      if (!stillExists && marker) {
        markerGroup.removeLayer(marker);
        delete ambulanceMarkerRef.current[numericId];
      }
    });
  }, [ambulances, ambulanceSimulation, emergencyPoint, selectedHospitalId, recommendations, onSelectHospital]);

  // Recenter Map on Pune
  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(PUNE_CENTER, 12);
    }
  };

  const selectedHospitalObj = hospitals.find((h) => h.id === selectedHospitalId);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Top Map Control Bar */}
      {showControls && <>
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-teal-600"></div>
          <h3 className="font-semibold text-sm text-slate-800">
            Pune Emergency Geographic Dispatcher Map
          </h3>
          <span className="text-[11px] font-medium text-teal-800 bg-teal-100/70 border border-teal-200 px-2 py-0.5 rounded-full">
            Pune, Maharashtra
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRecenter}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
            title="Recenter on Pune"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Recenter Pune
          </button>
        </div>
      </div>

      {/* Quick Preset Emergency Locations */}
      <div className="px-5 py-2 border-b border-slate-100 bg-white flex items-center gap-2 overflow-x-auto text-xs">
        <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-red-500" />
          Quick Emergency Locations:
        </span>
        {PUNE_PRESETS.map((preset) => {
          const isSelectedPreset =
            Math.abs(emergencyPoint.latitude - preset.latitude) < 0.001 &&
            Math.abs(emergencyPoint.longitude - preset.longitude) < 0.001;

          return (
            <button
              key={preset.name}
              onClick={() => {
                if (onEmergencyPointChange) {
                  onEmergencyPointChange({
                    latitude: preset.latitude,
                    longitude: preset.longitude,
                    label: preset.name,
                  });
                }
              }}
              className={`shrink-0 px-2.5 py-1 rounded-lg font-medium text-xs transition-colors cursor-pointer ${
                isSelectedPreset
                  ? 'bg-red-50 text-red-700 border border-red-200 font-semibold'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>
      </>}

      {/* Main Map Container */}
      <div className="relative w-full" style={{ height }}>
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Selected Route Information Floating Overlay */}
        {showRouteInfo && selectedHospitalObj && (
          <div className="absolute top-4 left-4 z-[500] max-w-sm bg-white/95 backdrop-blur-md rounded-xl border border-teal-200 shadow-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5">
              <div className="flex items-center gap-1.5 text-teal-700">
                <Compass className="w-4 h-4 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-wider">Active Route to Destination</span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                {selectedHospitalObj.status}
              </span>
            </div>

            <div>
              <h4 className="font-bold text-sm text-slate-800 leading-tight">
                {selectedHospitalObj.name}
              </h4>
              <p className="text-[11px] text-slate-500 truncate">{selectedHospitalObj.address}</p>
            </div>

            {/* Travel Time & Distance Stats */}
            <div className="grid grid-cols-2 gap-2 pt-1 text-center">
              <div className="bg-teal-50/80 border border-teal-100 rounded-lg p-2">
                <div className="text-[10px] text-teal-700 font-medium">Estimated Travel Time</div>
                <div className="text-lg font-black text-teal-800 flex items-center justify-center gap-1">
                  <Clock className="w-4 h-4 text-teal-600" />
                  {routeLoading ? '...' : `${routeInfo?.durationMinutes ?? '--'} min`}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <div className="text-[10px] text-slate-500 font-medium">Approx. Distance</div>
                <div className="text-lg font-black text-slate-800 flex items-center justify-center gap-1">
                  <MapPin className="w-4 h-4 text-slate-500" />
                  {routeLoading ? '...' : `${routeInfo?.distanceKm ?? '--'} km`}
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
              <span>OpenStreetMap / OSRM Route</span>
              <span className="text-emerald-600 font-medium">● Connected</span>
            </div>
          </div>
        )}

        {/* Click tip indicator */}
        {onEmergencyPointChange && (
          <div className="absolute bottom-4 left-4 z-[500] pointer-events-none bg-slate-900/80 text-white text-[11px] font-medium px-3 py-1.5 rounded-lg shadow backdrop-blur-xs flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-red-400" />
            Click anywhere on the map to set the emergency location
          </div>
        )}
      </div>

      {/* Map Legend Footer */}
      <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-600 border border-white"></div>
            <span className="font-medium">Emergency Incident</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-lg bg-teal-600 border border-white"></div>
            <span className="font-medium">Active Hospital</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-lg bg-amber-500 border border-white"></div>
            <span className="font-medium">Busy Hospital</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-lg bg-slate-400 border border-white"></div>
            <span className="font-medium">Offline Hospital</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-lg bg-amber-500 border border-white"></div>
            <span className="font-medium">Ambulance</span>
          </div>
        </div>

        <div className="text-[11px] font-medium text-slate-500">
          Showing 8+ real Pune hospitals · Accurate geographic coordinates
        </div>
      </div>
    </div>
  );
};
