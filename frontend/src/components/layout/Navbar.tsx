import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Ambulance, Building2, ShieldAlert, ChevronDown } from 'lucide-react';
import type { Hospital } from '../../types/hospital';
import { useWebSocket } from '../../hooks/useWebSocket';

interface NavbarProps {
  hospitals: Hospital[];
  selectedHospitalId: number;
  onSelectHospital: (id: number) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  hospitals,
  selectedHospitalId,
  onSelectHospital,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { status: wsStatus } = useWebSocket(null);

  const isHospitalRoute = location.pathname.startsWith('/hospital');

  React.useEffect(() => {
    if (location.pathname.startsWith('/hospital/')) {
      const parts = location.pathname.split('/');
      const pathId = Number(parts[2]);
      if (!isNaN(pathId) && pathId > 0 && pathId !== selectedHospitalId) {
        onSelectHospital(pathId);
      }
    }
  }, [location.pathname, selectedHospitalId, onSelectHospital]);

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-sm shadow-slate-900/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo & Brand */}
        <div className="flex items-center gap-4">
          <Link to="/dispatcher" className="flex items-center gap-3 group">
            <div className="p-2.5 bg-teal-700 rounded-xl shadow-sm shadow-teal-900/15 group-hover:scale-105 transition-transform duration-200">
              <Ambulance className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-slate-900 tracking-tight">
                  MediRoute
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                  PROTOTYPE
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Emergency Resource Allocator
              </p>
            </div>
          </Link>

          {/* Real-Time WebSocket Connection Indicator */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-slate-950 border border-slate-800">
            {wsStatus === 'CONNECTED' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-400 font-mono text-[11px]">LIVE — Real-time connection active</span>
              </>
            )}
            {wsStatus === 'RECONNECTING' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span className="text-amber-400 font-mono text-[11px]">RECONNECTING...</span>
              </>
            )}
            {wsStatus === 'OFFLINE' && (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-rose-400 font-mono text-[11px]">OFFLINE</span>
              </>
            )}
          </div>
        </div>

        {/* View Selector & Switcher */}
        <div className="flex items-center gap-3">
          {/* Dispatcher Command Center Link */}
          <Link
            to="/dispatcher"
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
              !isHospitalRoute && location.pathname !== '/user'
                ? 'bg-teal-50 text-teal-800 border border-teal-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-teal-700" />
            <span className="hidden sm:inline">Dispatcher Command Center</span>
          </Link>

          <Link
            to="/user"
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
              location.pathname === '/user'
                ? 'bg-teal-50 text-teal-800 border border-teal-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Ambulance className="w-4 h-4 text-teal-700" />
            <span className="hidden sm:inline">User Dashboard</span>
          </Link>

          {/* Hospital Staff View Selector */}
          <div className="relative flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
            <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
            <span className="text-slate-400 font-medium hidden md:inline">Hospital Staff:</span>
            <div className="relative flex items-center">
              <select
                value={selectedHospitalId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  onSelectHospital(id);
                  navigate(`/hospital/${id}`);
                }}
                className="bg-transparent text-slate-800 font-semibold pr-6 focus:outline-none cursor-pointer appearance-none"
              >
                {hospitals.length === 0 ? (
                  <>
                    <option value={1} className="bg-white text-slate-900">CityCare Hospital (#1)</option>
                    <option value={2} className="bg-white text-slate-900">Metro General Hospital (#2)</option>
                    <option value={3} className="bg-white text-slate-900">Apex Trauma Center (#3)</option>
                  </>
                ) : (
                  hospitals.map((h) => (
                    <option key={h.id} value={h.id} className="bg-white text-slate-900">
                      {h.name} (#{h.id})
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-0" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
