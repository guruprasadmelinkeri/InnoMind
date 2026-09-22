import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { DispatcherDashboard } from './pages/dispatcher/DispatcherDashboard';
import { CreateEmergencyPage } from './pages/dispatcher/CreateEmergencyPage';
import { EmergencyDetailPage } from './pages/dispatcher/EmergencyDetailPage';
import { HospitalDashboard } from './pages/hospital/HospitalDashboard';
import { HospitalRequestsPage } from './pages/hospital/HospitalRequestsPage';
import { getHospitals } from './services/hospitalApi';
import type { Hospital } from './types/hospital';

export const App: React.FC = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<number>(1);

  useEffect(() => {
    const loadHospitals = async () => {
      try {
        const list = await getHospitals();
        setHospitals(list);
        if (list.length > 0) {
          setSelectedHospitalId(list[0].id);
        }
      } catch (err) {
        console.error('Failed to load initial hospital list for navbar selector:', err);
      }
    };
    loadHospitals();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-rose-500 selection:text-white">
      <Navbar
        hospitals={hospitals}
        selectedHospitalId={selectedHospitalId}
        onSelectHospital={setSelectedHospitalId}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/dispatcher" replace />} />
          <Route path="/dispatcher" element={<DispatcherDashboard />} />
          <Route path="/dispatcher/emergency/new" element={<CreateEmergencyPage />} />
          <Route path="/dispatcher/emergency/:id" element={<EmergencyDetailPage />} />
          <Route path="/hospital/:hospitalId" element={<HospitalDashboard />} />
          <Route path="/hospital/:hospitalId/requests" element={<HospitalRequestsPage />} />
          <Route path="*" element={<Navigate to="/dispatcher" replace />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 MediRoute — Real-Time Emergency Resource Allocator & Ranking System</p>
          <p className="font-mono text-[11px] text-slate-400">Phase 6: Frontend Dashboards</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
