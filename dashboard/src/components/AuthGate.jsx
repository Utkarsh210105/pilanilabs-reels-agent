import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Spinner } from './ui.jsx';

const BASE = `${import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4100' : '')}/api`;
const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

// "Sign in with Google" button from Google Identity Services.
function GoogleButton({ clientId, onCredential }) {
  const ref = useRef(null);
  useEffect(() => {
    const draw = () => {
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential) });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with' });
    };
    if (window.google?.accounts?.id) { draw(); return undefined; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = draw;
    document.head.appendChild(s);
    return () => { s.onload = null; };
  }, [clientId, onCredential]);
  return <div ref={ref} />;
}

// Shows the sign-in page until the server says who you are. On the laptop
// (login off) the server answers straight away and this is invisible.
export default function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true });

  const check = async () => {
    const res = await fetch(`${BASE}/auth/me`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    setState(res.ok ? { user: data } : { clientId: data.client_id, error: null });
  };
  useEffect(() => { check().catch(() => setState({ error: 'Could not reach the server.' })); }, []);

  const signIn = async (credential) => {
    setState((s) => ({ ...s, busy: true, error: null }));
    const res = await fetch(`${BASE}/auth/google`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setState({ user: data });
    else setState((s) => ({ ...s, busy: false, error: data.error || 'Sign-in failed' }));
  };

  if (state.loading) return <div className="flex min-h-screen items-center justify-center text-muted"><Spinner /></div>;
  if (state.user) {
    const signOut = async () => { await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'same-origin' }); window.location.reload(); };
    return <UserContext.Provider value={{ ...state.user, signOut }}>{children}</UserContext.Provider>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="font-mono text-lg font-bold">PilaniLabs</div>
        <div className="label mt-1">Reels agent</div>
        <p className="mt-6 mb-5 text-sm text-muted">Sign in with your Google account. Only team members on the access list can open the dashboard.</p>
        <div className="flex justify-center">
          {state.clientId ? <GoogleButton clientId={state.clientId} onCredential={signIn} /> : <span className="text-sm text-muted">Login is not configured.</span>}
        </div>
        {state.busy && <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted"><Spinner size={14} /> Signing in…</p>}
        {state.error && <p className="mt-4 text-sm" style={{ color: 'var(--c-bad)' }}>{state.error}</p>}
      </div>
    </div>
  );
}
