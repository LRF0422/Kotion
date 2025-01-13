import React, { PropsWithChildren, createContext, useContext, useState } from 'react';

const DnDContext = createContext([null, (_: any) => { }]);

export const DnDProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const [type, setType] = useState(null);

    return (
        <DnDContext.Provider value={[type, setType]}>
            {children}
        </DnDContext.Provider>
    );
}

export default DnDContext;

export const useDnD = () => {
    return useContext(DnDContext);
}