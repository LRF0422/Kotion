import React, { useEffect } from 'react';
import { X } from '@kn/icon';
import { disableBodyScroll, enableBodyScroll } from '../../utils';

export interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'left' | 'right';
  className?: string;
}

export const MobileSidebar: React.FC<MobileSidebarProps> = ({
  isOpen,
  onClose,
  children,
  side = 'left',
  className = '',
}) => {
  useEffect(() => {
    if (isOpen) {
      disableBodyScroll();
    } else {
      enableBodyScroll();
    }

    return () => {
      enableBodyScroll();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sideClass = side === 'left' ? 'left-0' : 'right-0';
  const slideClass = side === 'left' ? 'animate-slide-in-left' : 'animate-slide-in-right';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={`fixed top-0 ${sideClass} h-full w-4/5 max-w-sm bg-background z-50 shadow-xl ${slideClass} ${className}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-border safe-area-top">
            <h2 className="text-lg font-semibold">Menu</h2>
            <button
              onClick={onClose}
              className="touch-target p-2 hover:bg-accent rounded-md"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </aside>
    </>
  );
};
