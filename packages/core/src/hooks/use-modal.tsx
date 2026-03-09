import { XIcon } from "@kn/icon";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, cn } from "@kn/ui";
import { isNumber } from "lodash";
import React, { PropsWithChildren, ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";


export interface ModalCTX {
    openModal: (config: Omit<ModalState, 'isOpen'>) => void
    closeModal: () => void
}

const ModalContext = createContext<ModalCTX>({} as ModalCTX)

export const useModal = () => useContext(ModalContext)


export interface ModalState {
    isOpen: boolean,
    title?: ReactNode,
    desc?: ReactNode,
    content: ReactNode,
    footer?: ReactNode,
    width?: number,
    height?: number | string,
    simple?: boolean

}

export const ModalProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const [modalState, setModalState] = useState<ModalState>({
        isOpen: false,
        title: null,
        desc: null,
        content: null,
        footer: null,
        width: 600,
        height: 800
    });
    const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const openModal = useCallback((config: Omit<ModalState, 'isOpen'>) => {
        // Clear any pending cleanup timer when opening a new modal
        if (cleanupTimerRef.current) {
            clearTimeout(cleanupTimerRef.current);
            cleanupTimerRef.current = null;
        }
        setModalState({
            isOpen: true,
            title: config.title,
            content: config.content,
            desc: config.desc,
            footer: config.footer,
            simple: config.simple,
            width: config.width || 600,
            height: config.height || 'auto'
        });
    }, []);

    const closeModal = useCallback(() => {
        // First set isOpen to false to trigger the close animation
        setModalState(prev => ({ ...prev, isOpen: false }));
        // Clear content after animation completes (duration-200 = 200ms)
        cleanupTimerRef.current = setTimeout(() => {
            setModalState(prev => ({
                ...prev,
                title: null,
                content: null,
                desc: null,
                footer: null
            }));
            cleanupTimerRef.current = null;
        }, 250);
    }, []);

    return <ModalContext.Provider
        value={{
            openModal,
            closeModal
        }}
    >
        <Dialog open={modalState.isOpen}
            onOpenChange={(value) => {
                if (value) {
                    setModalState(prev => ({ ...prev, isOpen: true }));
                } else {
                    closeModal();
                }
            }}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent
                className={cn(" max-w-none overflow-auto", {
                    "p-0": modalState.simple
                })}
                style={{
                    width: modalState.width + 'px',
                    height: modalState.height + 'px',
                    maxHeight: isNumber(modalState.height) ? modalState.height + 'px' : modalState.height,
                }}
            >
                {
                    !modalState.simple && modalState.title &&
                    <DialogHeader>
                        <DialogTitle>{modalState.title}</DialogTitle>
                        <DialogDescription></DialogDescription>
                    </DialogHeader>
                }
                <div className="w-full h-full overflow-auto">
                    {modalState.content}
                </div>
                {modalState.footer && <DialogFooter>{modalState.footer}</DialogFooter>}
            </DialogContent>
        </Dialog>
    </ModalContext.Provider>
}