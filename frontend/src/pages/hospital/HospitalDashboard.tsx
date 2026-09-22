import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Hospital, HospitalResource } from '../../types/hospital';
import { getHospitalById, getHospitalResources, updateHospitalResource } from '../../services/hospitalApi';
import { ResourceCard } from '../../components/hospitals/ResourceCard';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../components/common/Toast';
import { useWebSocket } from '../../hooks/useWebSocket';
import {
  Building2,
  MapPin,
  ShieldCheck,
  RefreshCw,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Inbox,
  Activity,
  Bed,
  Check,
  Loader2,
} from 'lucide-react';

export const HospitalDashboard: React.FC = () => {
  const { hospitalId } = useParams<{ hospitalId: string }>();
  const id = Number(hospitalId);
  const { addToast } = useToast();

  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [resources, setResources] = useState<HospitalResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Resource state
  const [editingResource, setEditingResource] = useState<HospitalResource | null>(null);
  const [editTotal, setEditTotal] = useState<number>(0);
  const [editAvailable, setEditAvailable] = useState<number>(0);
  const [savingResource, setSavingResource] = useState(false);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (!id || isNaN(id)) {
      setError('Invalid Hospital ID');
      setLoading(false);
      return;
    }
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const [hData, rData] = await Promise.all([
        getHospitalById(id),
        getHospitalResources(id),
      ]);
      setHospital(hData);
      setResources(rData);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load hospital dashboard details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-Time WebSocket Event Subscriptions
  useWebSocket(['RESOURCE_UPDATED', 'RESERVATION_CREATED'], (payload) => {
    if (payload.event === 'RESOURCE_UPDATED' && payload.data) {
      if (payload.data.hospital_id === id) {
        setResources((prev) =>
          prev.map((r) =>
            r.id === payload.data.resource_id || r.resource_type === payload.data.resource_type
              ? {
                  ...r,
                  available: payload.data.available,
                  reserved: payload.data.reserved,
                  total: payload.data.total,
                  last_updated: payload.data.last_updated || new Date().toISOString(),
                }
              : r
          )
        );
        addToast('info', 'Capacity Updated', `${payload.data.resource_type} updated to ${payload.data.available} available.`);
      }
    } else if (payload.event === 'RESERVATION_CREATED' && payload.data) {
      if (payload.data.hospital_id === id) {
        fetchData(false);
        addToast('success', 'New Resource Reservation Locked', 'Resource capacity has been reserved for incoming emergency case.');
      }
    }
  });

  const handleOpenEdit = (res: HospitalResource) => {
    setEditingResource(res);
    setEditTotal(res.total);
    setEditAvailable(res.available);
  };

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResource || !hospital) return;
    if (editAvailable > editTotal) {
      addToast('error', 'Available resources cannot exceed total capacity.');
      return;
    }

    setSavingResource(true);
    try {
      await updateHospitalResource(hospital.id, {
        resource_type: editingResource.resource_type,
        total: editTotal,
        available: editAvailable,
      });
      addToast('success', `${editingResource.resource_type} capacity updated successfully!`);
      setEditingResource(null);
      fetchData(true);
    } catch (err: any) {
      addToast('error', err?.response?.data?.detail || 'Failed to update resource capacity.');
    } finally {
      setSavingResource(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <LoadingSpinner label="Loading Hospital Portal..." size="lg" />
      </div>
    );
  }

  if (error || !hospital) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <ErrorAlert message={error || 'Hospital not found'} onRetry={() => fetchData()} />
      </div>
    );
  }

  // Calculate statistics safely
  const safeResources = Array.isArray(resources) ? resources : [];
  const totalCapacity = safeResources.reduce((sum, r) => sum + (Number(r?.total) || 0), 0);
  const totalAvailable = safeResources.reduce((sum, r) => sum + (Number(r?.available) || 0), 0);
  const totalReserved = safeResources.reduce((sum, r) => sum + (Number(r?.reserved) || 0), 0);
  const utilizationRate = totalCapacity > 0 ? Math.round(((totalCapacity - totalAvailable) / totalCapacity) * 100) : 0;

  const formatCoordinate = (val: any) => {
    if (val == null) return 'N/A';
    const num = Number(val);
    return isNaN(num) ? 'N/A' : num.toFixed(4);
  };

  return (
    <div className="space-y-8">
      {/* Top Banner Header */}
      <div className="p-6 md:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-black text-slate-100 flex items-center gap-3">
                <Building2 className="w-8 h-8 text-emerald-400" />
                {hospital.name}
              </h1>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${
                  hospital.status === 'Active'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                {hospital.status}
              </span>
              {hospital.trauma_center && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  <ShieldCheck className="w-4 h-4 text-amber-400" /> Trauma Level I Center
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-5 text-xs text-slate-400">
              {hospital.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-500" /> {hospital.address}
                </span>
              )}
              <span className="flex items-center gap-1.5 text-slate-500">
                GPS: {formatCoordinate(hospital.latitude)}, {formatCoordinate(hospital.longitude)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all flex items-center gap-2 text-xs font-semibold border border-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
              Refresh Status
            </button>
            <Link
              to={`/hospital/${hospital.id}/requests`}
              className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 transition-all flex items-center gap-2"
            >
              <Inbox className="w-4 h-4" /> Incoming Requests
            </Link>
          </div>
        </div>
      </div>

      {/* Overview Statistics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Bed Capacity</span>
            <Bed className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-3xl font-black text-slate-100">{totalCapacity}</p>
          <p className="text-[11px] text-slate-500">Configured across {resources.length} resource types</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Available Beds</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-black text-emerald-400">{totalAvailable}</p>
          <p className="text-[11px] text-emerald-500/80 font-medium">Ready for immediate dispatch</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Active Reservations</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-3xl font-black text-amber-400">{totalReserved}</p>
          <p className="text-[11px] text-amber-500/80 font-medium">Locked for incoming cases</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Overall Utilization</span>
            <AlertTriangle className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-3xl font-black text-slate-100">{utilizationRate}%</p>
          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-500 ${
                utilizationRate > 85 ? 'bg-rose-500' : utilizationRate > 60 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${utilizationRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Resource Inventory Breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" /> Live Resource Inventory
            </h2>
            <p className="text-xs text-slate-400">
              Real-time resource counts updated automatically during emergency allocations.
            </p>
          </div>
        </div>

        {resources.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900/50 border border-slate-800 text-slate-500 text-sm">
            No resources currently registered for this hospital.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {resources.map((res) => (
              <div key={res.id} className="relative group">
                <ResourceCard resource={res} />
                <button
                  onClick={() => handleOpenEdit(res)}
                  className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/90 hover:bg-emerald-600 text-slate-400 hover:text-white border border-slate-700 transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                  title="Update capacity"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for editing capacity */}
      {editingResource && (
        <Modal
          isOpen={Boolean(editingResource)}
          onClose={() => setEditingResource(null)}
          title={`Update Capacity - ${editingResource.resource_type}`}
        >
          <form onSubmit={handleSaveResource} className="space-y-4">
            <p className="text-xs text-slate-400">
              Adjust capacity for <strong className="text-slate-200">{editingResource.resource_type}</strong>.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Total Capacity</label>
                <input
                  type="number"
                  min="0"
                  value={editTotal}
                  onChange={(e) => setEditTotal(Number(e.target.value))}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Available Count</label>
                <input
                  type="number"
                  min="0"
                  max={editTotal}
                  value={editAvailable}
                  onChange={(e) => setEditAvailable(Number(e.target.value))}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Currently Reserved:</span>
              <span className="font-bold text-amber-400">{editingResource.reserved}</span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingResource(null)}
                disabled={savingResource}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingResource}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {savingResource ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Resource Capacity
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
