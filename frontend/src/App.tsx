import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DispatcherDashboard } from './pages/dispatcher/DispatcherDashboard';
import { CreateEmergencyPage } from './pages/dispatcher/CreateEmergencyPage';
import { EmergencyDetailPage } from './pages/dispatcher/EmergencyDetailPage';
import { UserDashboard } from './pages/user/UserDashboard';
import { HospitalDashboard } from './pages/hospital/HospitalDashboard';
import { HospitalRequestsPage } from './pages/hospital/HospitalRequestsPage';
import { AllocationSimulation } from './pages/dispatcher/AllocationSimulation';
import { SimulationLab } from './pages/dispatcher/SimulationLab';
import { HospitalOperationsPage } from './pages/dispatcher/HospitalOperationsPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { RequireRole, homeForRole, useAuth, type Role } from './services/auth';
import { RoleLayout } from './components/layout/RoleLayout';

const Workspace: React.FC<React.PropsWithChildren<{ roles: Role[] }>> = ({ roles, children }) => <RequireRole roles={roles}><RoleLayout>{children}</RoleLayout></RequireRole>;
const RootRedirect: React.FC = () => { const {account,loading}=useAuth(); if(loading)return <div className="min-h-screen grid place-items-center text-slate-500">Loading your workspace…</div>; return <Navigate to={account?homeForRole(account):'/login'} replace/>; };

export const App: React.FC = () => <Routes>
  <Route path="/" element={<RootRedirect/>}/>
  <Route path="/login" element={<LoginPage/>}/>
  <Route path="/register" element={<RegisterPage/>}/>
  <Route path="/dispatcher" element={<Workspace roles={['ADMIN']}><DispatcherDashboard/></Workspace>}/>
  <Route path="/dispatcher/hospitals" element={<Workspace roles={['ADMIN']}><HospitalOperationsPage/></Workspace>}/>
  <Route path="/dispatcher/hospitals/:hospitalId/capacity" element={<Workspace roles={['ADMIN']}><HospitalDashboard/></Workspace>}/>
  <Route path="/dispatcher/hospitals/:hospitalId/requests" element={<Workspace roles={['ADMIN']}><HospitalRequestsPage/></Workspace>}/>
  <Route path="/dispatcher/emergency/new" element={<Workspace roles={['ADMIN']}><CreateEmergencyPage/></Workspace>}/>
  <Route path="/dispatcher/emergency/:id" element={<Workspace roles={['ADMIN']}><EmergencyDetailPage/></Workspace>}/>
  <Route path="/dispatcher/simulation" element={<Workspace roles={['ADMIN']}><SimulationLab/></Workspace>}/>
  <Route path="/dispatcher/allocation-simulation" element={<Workspace roles={['ADMIN']}><AllocationSimulation/></Workspace>}/>
  <Route path="/user" element={<Workspace roles={['USER']}><UserDashboard/></Workspace>}/>
  <Route path="/hospital" element={<RootRedirect/>}/>
  <Route path="/hospital/:hospitalId" element={<Workspace roles={['HOSPITAL']}><HospitalDashboard/></Workspace>}/>
  <Route path="/hospital/:hospitalId/requests" element={<Workspace roles={['HOSPITAL']}><HospitalRequestsPage/></Workspace>}/>
  <Route path="*" element={<RootRedirect/>}/>
</Routes>;

export default App;
