import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Building2,
  Gauge,
  Inbox,
  Menu,
  MessageSquareText,
  Scale,
  SearchCheck,
  Truck,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useApiStatus } from '../lib/useApi';
import { API_BASE, probeApi } from '../api/client';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'The decision',
    items: [
      { to: '/', label: 'Overview', icon: BarChart3 },
      { to: '/why-late', label: 'Why deliveries are late', icon: SearchCheck },
      { to: '/vendor', label: 'Vendor decision', icon: Scale },
      { to: '/what-if', label: 'What-if simulator', icon: Gauge },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/carriers', label: 'Carriers', icon: Truck },
      { to: '/clients', label: 'At-risk clients', icon: Building2 },
      { to: '/stock-routes', label: 'Stock & routes', icon: Warehouse },
    ],
  },
  {
    group: 'AI agents',
    items: [
      { to: '/order-intake', label: 'Order intake agent', icon: Inbox },
      { to: '/ask', label: 'Ask DeliveryLens', icon: MessageSquareText },
      { to: '/activity', label: 'Agent activity', icon: Activity },
    ],
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#15212B" />
        <path d="M7 21h12" stroke="#5E6B75" strokeWidth="3" strokeLinecap="round" />
        <path d="M7 21h6" stroke="#E08A3C" strokeWidth="3" strokeLinecap="round" />
        <circle cx="23" cy="11" r="4" fill="#2BA394" />
        <path d="M19 21c3 0 4-2 4-6" stroke="#2BA394" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <div className="text-[17px] font-bold tracking-tight text-ink">DeliveryLens</div>
        <div className="text-sm text-slate">Halcyon Logistics</div>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="mb-1.5 px-3 text-sm text-slate">{g.group}</div>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    [
                      'relative flex min-h-[40px] items-center gap-3 rounded-md px-3 text-[15px] transition-colors',
                      isActive ? 'bg-route-tint font-semibold text-route-dark' : 'text-ink-soft hover:bg-paper hover:text-ink',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-route" aria-hidden="true" />}
                      <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" strokeWidth={isActive ? 2.25 : 1.75} />
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function OfflineBanner() {
  const status = useApiStatus();
  const [checking, setChecking] = useState(false);
  if (status !== 'offline') return null;
  return (
    <div role="status" className="border-b border-late/30 bg-late-tint">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-[15px] text-ink sm:px-8">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-late" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Showing sample data.</span> The DeliveryLens API at{' '}
          <span className="break-all">{API_BASE}</span> is not reachable, so figures come from the saved analysis of 48,340
          deliveries and agent replies are rule-based stand-ins.
        </p>
        <button
          type="button"
          className="btn-secondary min-h-[34px] px-3 text-sm"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            const next = await probeApi();
            setChecking(false);
            if (next === 'live') window.location.reload();
          }}
        >
          {checking ? 'Checking…' : 'Try again'}
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="min-h-screen lg:pl-[248px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="px-3 pb-7">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <p className="px-3 pt-4 text-sm leading-snug text-slate">
          48,340 deliveries
          <br />1 Apr – 25 Sep 2026
        </p>
      </aside>

      {/* Tablet / mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Brand />
        <button type="button" className="btn-secondary px-3" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span>Menu</span>
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div id="mobile-nav" className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-surface px-3 py-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-3">
              <Brand />
              <button type="button" className="btn-quiet text-ink" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <OfflineBanner />
      <main id="main" className="mx-auto max-w-[1240px] px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
        {children}
      </main>
    </div>
  );
}
