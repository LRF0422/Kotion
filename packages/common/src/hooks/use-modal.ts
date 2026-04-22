import { createContext, useContext } from "react";
import { ReactNode } from "react";

export interface ModalCTX {
    openModal: (config: Omit<ModalState, 'isOpen'>) => void
    closeModal: () => void
}

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

const ModalContext = createContext<ModalCTX>({} as ModalCTX)

export const useModal = () => useContext(ModalContext)

export { ModalContext }
