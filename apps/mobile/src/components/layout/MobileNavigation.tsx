import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, FileText, Settings } from '@kn/icon';

export interface MobileNavigationItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

export interface MobileNavigationProps {
  className?: string;
}

const defaultNavItems: MobileNavigationItem[] = [
  {
    path: '/',
    label: 'Home',
    icon: <Home className="w-6 h-6" />,
  },
  {
    path: '/browse',
    label: 'Browse',
    icon: <FileText className="w-6 h-6" />,
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: <Settings className="w-6 h-6" />,
  },
];

export const MobileNavigation: React.FC<MobileNavigationProps> = ({ className = '' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav
      className={`mobile-nav-height bg-background border-t border-border fixed bottom-0 left-0 right-0 z-50 safe-area-bottom ${className}`}
    >
      <div className="flex items-center justify-around h-full px-4">
        {defaultNavItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`touch-target-lg flex flex-col items-center justify-center gap-1 flex-1 rounded-lg transition-colors ${active
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <span className={active ? 'scale-110 transition-transform' : ''}>
                {item.icon}
              </span>
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
