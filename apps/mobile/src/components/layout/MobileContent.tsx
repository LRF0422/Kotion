import React from 'react';

export interface MobileContentProps {
  children: React.ReactNode;
  className?: string;
  withHeader?: boolean;
  withNavigation?: boolean;
  scrollable?: boolean;
}

export const MobileContent: React.FC<MobileContentProps> = ({
  children,
  className = '',
  withHeader = true,
  withNavigation = true,
  scrollable = true,
}) => {
  const paddingTop = withHeader ? 'pt-[56px]' : '';
  const paddingBottom = withNavigation ? 'pb-[64px]' : '';
  const overflowClass = scrollable ? 'overflow-y-auto' : 'overflow-hidden';

  return (
    <main
      className={`min-h-screen ${paddingTop} ${paddingBottom} ${overflowClass} ${className}`}
      style={{
        paddingTop: withHeader ? 'calc(56px + var(--safe-area-inset-top))' : undefined,
        paddingBottom: withNavigation ? 'calc(64px + var(--safe-area-inset-bottom))' : undefined,
      }}
    >
      {children}
    </main>
  );
};
