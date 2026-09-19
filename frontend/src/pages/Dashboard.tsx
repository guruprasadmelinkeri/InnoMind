import React from 'react';
import { Ambulance, ShieldAlert, Cpu, Database, CheckCircle } from 'lucide-react';
import { BackendStatus } from '../components/BackendStatus';

export const Dashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Navigation / Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-rose-600 to-amber-500 rounded-xl shadow-lg shadow-rose-500/20">
              <Ambulance className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent tracking-tight">
                MediRoute
              </h1>
              <p className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold">
                Real-Time Emergency Resource Allocator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
              Phase 1 Foundation
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-rose-950/40 border border-slate-800 p-8 shadow-2xl">
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20">
              <ShieldAlert className="w-3.5 h-3.5" /> Emergency Response System
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Optimized Dispatch & Hospital Resource Allocation
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              MediRoute connects ambulance dispatchers with nearby medical centers in real time, matching critical patient requirements against live hospital capacity and data freshness.
            </p>
          </div>

          {/* Decorative Glow */}
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Status Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <BackendStatus />
          </div>

          {/* Foundation Overview */}
          <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-200">System Architecture Foundation</h3>
              <p className="text-xs text-slate-400">Core technology stack initialized for phase 1</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">React + TypeScript + Vite</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Frontend component framework with modular service architecture</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">FastAPI Backend</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Python API service with CORS middleware & Pydantic config</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                <Database className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">PostgreSQL & SQLAlchemy</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Database service containerized via Docker Compose</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                <Cpu className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Axios API Service Layer</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Modularized HTTP communication & custom hooks</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        MediRoute Phase 1 Foundation Prototype
      </footer>
    </div>
  );
};
