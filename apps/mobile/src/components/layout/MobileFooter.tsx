import React from 'react';

export interface MobileFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const MobileFooter: React.FC<MobileFooterProps> = ({ children, className = '' }) => {
  return (
    <footer
      className={`bg-background border-t border-border px-4 py-3 safe-area-bottom ${className}`}
    >
      {children}
    </footer>
  );
};
