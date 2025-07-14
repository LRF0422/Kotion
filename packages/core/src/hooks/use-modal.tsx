import { XIcon } from "@repo/icon";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, cn } from "@repo/ui";
import { isNumber } from "lodash";
import React, { PropsWithChildren, ReactNode, createContext, useContext, useState } from "react";


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

    const openModal = (config: Omit<ModalState, 'isOpen'>) => {
        setModalState({
            ...modalState,
            isOpen: true,
            title: config.title,
            content: config.content,
            desc: config.desc,
            footer: config.footer,
            simple: config.simple,
            width: config.width || 600,
            height: config.height || 'auto'
        })
    }

    const closeModal = () => {
        setModalState({
            ...modalState,
            isOpen: false,
            title: null,
            content: null,
            desc: null,
            footer: null
        })
    }

    return <ModalContext.Provider
        value={{
            openModal,
            closeModal
        }}
    >
        <Dialog open={modalState.isOpen}
            onOpenChange={(value) => {
                setModalState({
                    ...modalState,
                    isOpen: value
                })
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