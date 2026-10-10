import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Activity, Building2, ClipboardList, Command, LayoutDashboard, LogOut, PlusCircle, Radio, Siren } from 'lucide-react';
import { useAuth } from '../../services/auth';

const links = {
  ADMIN: [{ to: '/dispatcher', label: 'Operations overview', icon: LayoutDashboard }, { to: '/dispatcher/hospitals', label: 'Hospitals & access', icon: Building2 }, { to: '/dispatcher/emergency/new', label: 'Create emergency', icon: PlusCircle }, { to: '/dispatcher/simulation', label: 'Simulation lab', icon: Activity }, { to: '/dispatcher/allocation-simulation', label: 'Batch allocation', icon: Command }],
  USER: [{ to: '/user', label: 'My care', icon: LayoutDashboard }],
  HOSPITAL: [{ to: '/hospital', label: 'Clinical overview', icon: LayoutDashboard }, { to: '/hospital/requests', label: 'Incoming requests', icon: ClipboardList }],
};
const config = {
  ADMIN: { title: 'Emergency Operations', short: 'EOC', icon: Command, color: 'rose', descriptor: 'Regional command' },
  USER: { title: 'MediRoute Care', short: 'CARE', icon: Siren, color: 'teal', descriptor: 'Emergency assistance' },
  HOSPITAL: { title: 'Hospital Operations', short: 'CLINICAL', icon: Building2, color: 'blue', descriptor: 'Care coordination' },
};
export const RoleLayout: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { account, signOut } = useAuth(); const navigate = useNavigate();
  if (!account) return <>{children}</>;
  const role = account.role; const c = config[role]; const Brand = c.icon;
  const roleLinks = links[role].map((link) => ({ ...link, to: role === 'HOSPITAL' ? link.to === '/hospital' ? `/hospital/${account.hospital_id}` : `/hospital/${account.hospital_id}/requests` : link.to }));
  return <div className={`min-h-screen bg-[#f5f7fa] text-slate-800 dashboard-${role.toLowerCase()}`}>
    <aside className={`hidden lg:flex fixed inset-y-0 left-0 z-30 w-[258px] flex-col border-r border-slate-200 bg-white`}>
      <div className="px-6 pt-7 pb-6 border-b border-slate-100"><div className="flex items-center gap-3"><div className={`grid h-11 w-11 place-items-center rounded-2xl ${role === 'ADMIN' ? 'bg-rose-600' : role === 'USER' ? 'bg-teal-600' : 'bg-blue-700'} text-white shadow-lg`}><Brand size={22}/></div><div><div className="text-lg font-extrabold tracking-tight text-slate-900">MediRoute</div><div className="text-[10px] uppercase tracking-[.18em] font-bold text-slate-400">{c.descriptor}</div></div></div>
        <div className={`mt-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${role === 'ADMIN' ? 'bg-rose-50 text-rose-700' : role === 'USER' ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue-700'}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{c.title}</div>
      </div>
      <nav className="flex-1 px-4 py-6"><div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</div>{roleLinks.map(({to,label,icon:Icon})=><NavLink key={to} end to={to} className={({isActive})=>`mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${isActive ? role==='ADMIN'?'bg-rose-50 text-rose-700':role==='USER'?'bg-teal-50 text-teal-700':'bg-blue-50 text-blue-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><Icon size={18}/>{label}</NavLink>)}</nav>
      <div className="border-t border-slate-100 p-4"><div className="flex items-center gap-3 px-2 py-2"><div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{account.display_name.slice(0,2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{account.display_name}</p><p className="text-xs text-slate-400">{role === 'HOSPITAL' ? 'Hospital staff' : role === 'ADMIN' ? 'Administrator' : 'Patient / requester'}</p></div><button title="Sign out" onClick={()=>{signOut();navigate('/login');}} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><LogOut size={17}/></button></div></div>
    </aside>
    <header className="sticky top-0 z-20 flex h-[66px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:ml-[258px] lg:px-8"><div className="flex items-center gap-3 lg:hidden"><Brand className="text-slate-700" size={21}/><b>MediRoute</b></div><div className="hidden items-center gap-2 text-xs font-semibold text-slate-500 lg:flex"><Radio size={15} className="text-emerald-600"/> Secure operations workspace</div><div className="flex items-center gap-2"><span className="hidden text-sm font-semibold text-slate-600 sm:inline">{account.display_name}</span><button title="Sign out" onClick={()=>{signOut();navigate('/login');}} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><LogOut size={18}/></button></div></header>
    <main className="mx-auto max-w-[1600px] px-4 py-6 pb-24 sm:px-6 lg:ml-[258px] lg:px-8 lg:py-8">{children}</main>
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">{roleLinks.map(({to,label,icon:Icon})=><NavLink key={to} end to={to} className={({isActive})=>`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold ${isActive?'text-teal-700':'text-slate-400'}`}><Icon size={19}/>{label.split(' ')[0]}</NavLink>)}</nav>
  </div>;
};
