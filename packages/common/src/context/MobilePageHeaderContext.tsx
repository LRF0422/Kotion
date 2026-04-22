import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

export interface MobilePageHeaderInfo {
    title?: string;
    icon?: string;
    actions?: ReactNode;
}

interface MobilePageHeaderContextValue {
    headerInfo: MobilePageHeaderInfo | null;
    setHeaderInfo: (info: MobilePageHeaderInfo | null) => void;
    clearHeaderInfo: () => void;
}

const MobilePageHeaderContext = createContext<MobilePageHeaderContextValue | null>(null);

export const MobilePageHeaderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [headerInfo, setHeaderInfo] = useState<MobilePageHeaderInfo | null>(null);

    const clearHeaderInfo = useCallback(() => {
        setHeaderInfo(null);
    }, []);

    return (
        <MobilePageHeaderContext.Provider value={{ headerInfo, setHeaderInfo, clearHeaderInfo }}>
            {children}
        </MobilePageHeaderContext.Provider>
    );
};

export const useMobilePageHeader = () => {
    const context = useContext(MobilePageHeaderContext);
    if (!context) {
        // Return a no-op implementation if used outside provider
        return {
            headerInfo: null,
            setHeaderInfo: () => { },
            clearHeaderInfo: () => { },
        };
    }
    return context;
};
