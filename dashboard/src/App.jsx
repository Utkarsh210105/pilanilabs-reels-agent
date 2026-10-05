import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { ListChecks, Newspaper, PlusCircle, Settings as SettingsIcon, Moon, Sun, Menu, X, TrendingUp, Users } from 'lucide-react';
import Creators from './pages/Creators.jsx';
import Leads from './pages/Leads.jsx';
import Queue from './pages/Queue.jsx';
import ScriptPage from './pages/ScriptPage.jsx';
import News from './pages/News.jsx';
import NewReel from './pages/NewReel.jsx';
import Settings from './pages/Settings.jsx';
import SyncButton from './components/SyncButton.jsx';

const NAV = [
  { to: '/', label: 'Review queue', icon: ListChecks, end: true },
  { to: '/news', label: 'AI news', icon: Newspaper },
  { to: '/creators', label: 'Creator reels', icon: TrendingUp },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/new', label: 'New reel', icon: PlusCircle },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function ThemeToggle() {
  const current = () => document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [theme, setTheme] = useState(current);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* ignore */ }
    setTheme(next);
  };
  return (
    <button className="btn w-full justify-center" onClick={toggle} aria-label="Toggle theme">
      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />} {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}

export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen md:flex">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
        <span className="font-mono text-sm font-bold">PilaniLabs · Reels</span>
        <button className="btn" onClick={() => setOpen((o) => !o)} aria-label="Menu">{open ? <X size={16} /> : <Menu size={16} />}</button>
      </header>
      <aside className={`${open ? 'block' : 'hidden'} border-b border-line bg-surface md:sticky md:top-0 md:block md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0`}>
        <div className="flex h-full flex-col p-4">
          <div className="mb-6 hidden md:block">
            <div className="font-mono text-sm font-bold">PilaniLabs</div>
            <div className="label mt-1">Reels agent</div>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setOpen(false)}
                className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-hover font-semibold text-gold-ink' : 'text-muted hover:bg-hover hover:text-ink'}`}
              >
                <Icon size={16} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-6 grid gap-4 md:mt-auto">
            <SyncButton />
            <ThemeToggle />
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        <Routes>
          <Route path="/" element={<Queue />} />
          <Route path="/scripts/:id" element={<ScriptPage />} />
          <Route path="/news" element={<News />} />
          <Route path="/creators" element={<Creators />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/new" element={<NewReel />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
