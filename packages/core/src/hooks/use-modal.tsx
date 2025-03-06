import { XIcon } from "@repo/icon";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, cn } from "@repo/ui";
import React, { PropsWithChildren, ReactNode, createContext, useContext, useState } from "react";


const ModalContext = createContext<any>({})

export const useModal = () => useContext(ModalContext)


export interface ModalState {
    isOpen: boolean,
    title?: ReactNode,
    desc?: ReactNode,
    content: ReactNode,
    footer?: ReactNode,
    width: number,
    height: number,
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
            height: config.height || 800
        })
    }

    const onClose = (data: any) => {

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
                className={cn(" max-w-none", {
                    "p-0": modalState.simple
                })}
                style={{
                    width: modalState.width + 'px',
                    height: modalState.height + 'px'
                }}
            >


                <div className="">
                    {modalState.content}
                </div>
                {modalState.footer && <DialogFooter>{modalState.footer}</DialogFooter>}
            </DialogContent>
        </Dialog>
    </ModalContext.Provider>
}