import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Building2, Activity, Clock, Plus, Eye } from 'lucide-react';
import { getEmergencies } from '../../services/emergencyApi';
import { getHospitals } from '../../services/hospitalApi';
import type { EmergencyCase } from '../../types/emergency';
import type { Hospital } from '../../types/hospital';
import { SeverityBadge } from '../../components/emergencies/SeverityBadge';
import { StatusBadge } from '../../components/emergencies/StatusBadge';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { EmptyState } from '../../components/common/EmptyState';
import { parseApiError } from '../../services/api';

import { useToast } from '../../components/common/Toast';
import { useWebSocket } from '../../hooks/useWebSocket';

export const DispatcherDashboard: React.FC = () => {
  const [emergencies, setEmergencies] = useState<EmergencyCase[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [eData, hData] = await Promise.all([getEmergencies(), getHospitals()]);
      setEmergencies(eData);
      setHospitals(hData);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, []);

  // Listen to Real-Time WebSocket Events
  useWebSocket(
    [
      'RESOURCE_UPDATED',
      'ALLOCATION_REQUEST_ACCEPTED',
      'ALLOCATION_REQUEST_REJECTED',
      'EMERGENCY_STATUS_UPDATED',
    ],
    (payload) => {
      if (payload.event === 'RESOURCE_UPDATED' && payload.data) {
        const { hospital_id, resource_id, resource_type, available, reserved, total } = payload.data;
        setHospitals((prev) =>
          prev.map((h) => {
            if (h.id === hospital_id && h.resources) {
              const updatedResources = h.resources.map((r) =>
                r.id === resource_id || r.resource_type === resource_type
                  ? { ...r, available, reserved, total }
                  : r
              );
              return { ...h, resources: updatedResources };
            }
            return h;
          })
        );
        addToast('info', 'Hospital Resource Availability Updated', `Hospital #${hospital_id} ${resource_type}: ${available} available`);
      } else if (payload.event === 'ALLOCATION_REQUEST_ACCEPTED' && payload.data) {
        addToast(
          'success',
          'Hospital Accepted Request',
          `${payload.data.hospital_name || 'Hospital'} accepted emergency request #${payload.data.emergency_id}`
        );
        fetchData(false);
      } else if (payload.event === 'ALLOCATION_REQUEST_REJECTED' && payload.data) {
        addToast(
          'warning',
          'Request Rejected',
          `Hospital #${payload.data.hospital_id} rejected allocation request: ${payload.data.rejection_reason || 'No reason provided'}`
        );
        fetchData(false);
      } else if (payload.event === 'EMERGENCY_STATUS_UPDATED' && payload.data) {
        setEmergencies((prev) =>
          prev.map((e) =>
            e.id === payload.data.emergency_id
              ? { ...e, status: payload.data.status }
              : e
          )
        );
      }
    }
  );

  // Compute KPI Statistics
  const activeEmergencies = emergencies.filter(
    (e) => e.status !== 'HANDOFF_COMPLETED' && e.status !== 'CANCELLED'
  ).length;

  const availableHospitals = hospitals.filter((h) => h.status === 'Active').length;

  const totalIcuAvailable = hospitals.reduce((acc, h) => {
    const icu = h.resources?.find((r) => r.resource_type === 'ICU_BED');
    return acc + (icu?.available || 0);
  }, 0);

  const pendingConfirmations = emergencies.filter((e) => e.status === 'SEARCHING').length;

  if (loading) {
    return <LoadingSpinner label="Loading Command Center Data..." />;
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Top Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Dispatcher Command Center
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time emergency incident monitoring and hospital resource allocation
          </p>
        </div>

        <Link
          to="/dispatcher/emergency/new"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs text-white bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 shadow-xl shadow-rose-600/20 transition-all duration-200 transform hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" /> CREATE EMERGENCY
        </Link>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchData} />}

      {/* Top KPI Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-xs font-semibold text-slate-400">Active Emergencies</span>
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="text-3xl font-black text-white">{activeEmergencies}</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-sky-400">
            <span className="text-xs font-semibold text-slate-400">Available Hospitals</span>
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-3xl font-black text-white">{availableHospitals}</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-semibold text-slate-400">Available ICU Beds</span>
            <Activity className="w-5 h-5" />
          </div>
          <div className="text-3xl font-black text-emerald-400">{totalIcuAvailable}</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-xs font-semibold text-slate-400">Pending Requests</span>
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-3xl font-black text-amber-400">{pendingConfirmations}</div>
        </div>
      </div>

      {/* Main Grid: Active Emergencies & Hospital Capacity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Emergencies Table/List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500" /> Active Emergency Incidents
            </h2>
            <span className="text-xs text-slate-400">Total: {emergencies.length}</span>
          </div>

          {emergencies.length === 0 ? (
            <EmptyState
              title="No Active Emergencies"
              description="Click Create Emergency to register a new dispatch case."
              action={
                <Link
                  to="/dispatcher/emergency/new"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white"
                >
                  <Plus className="w-4 h-4" /> Register Incident
                </Link>
              }
            />
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-4">Case #</th>
                      <th className="p-4">Severity</th>
                      <th className="p-4">Patient</th>
                      <th className="p-4">Requirements</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {emergencies.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-mono font-bold text-white">{e.case_number}</td>
                        <td className="p-4">
                          <SeverityBadge severity={e.severity} />
                        </td>
                        <td className="p-4 font-medium text-slate-200">
                          {e.patient_age ? `${e.patient_age} yrs` : 'Unknown'}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {e.requirements.map((r, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 border border-slate-800 text-slate-300"
                              >
                                {r.resource_type} ×{r.quantity}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-4">
                          <StatusBadge status={e.status} />
                        </td>
                        <td className="p-4 text-right">
                          <Link
                            to={`/dispatcher/emergency/${e.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Hospital Capacity Overview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-sky-400" /> Hospital Overview
            </h2>
            <span className="text-xs text-slate-400">Total: {hospitals.length}</span>
          </div>

          <div className="space-y-3">
            {hospitals.map((h) => {
              const icu = h.resources?.find((r) => r.resource_type === 'ICU_BED');
              const gen = h.resources?.find((r) => r.resource_type === 'GENERAL_BED');
              const vent = h.resources?.find((r) => r.resource_type === 'VENTILATOR');

              return (
                <div
                  key={h.id}
                  className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-md space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-100 text-sm">{h.name}</h4>
                      <p className="text-[10px] text-slate-400">{h.address || 'Central Region'}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {h.trauma_center && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20">
                          Trauma Center
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {h.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">ICU</span>
                      <span className="font-bold text-emerald-400">{icu?.available || 0}</span>
                      <span className="text-[10px] text-slate-500">/{icu?.total || 0}</span>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">General</span>
                      <span className="font-bold text-sky-400">{gen?.available || 0}</span>
                      <span className="text-[10px] text-slate-500">/{gen?.total || 0}</span>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Ventilators</span>
                      <span className="font-bold text-amber-400">{vent?.available || 0}</span>
                      <span className="text-[10px] text-slate-500">/{vent?.total || 0}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
