/**
 * useUserChoiceBridge — turns the agent's askUserChoice tool call into a
 * pending UI request, resolved by the UserChoiceCard. Extracted from Chat.tsx
 * so the panel does not own the promise/state lifecycle inline.
 */

import { useCallback, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { UserChoiceRequest } from '@kn/common'
import type { PendingUserChoice } from './chat-types'

export interface UseUserChoiceBridgeApi {
    pendingChoice: PendingUserChoice | null
    customInput: string
    setCustomInput: Dispatch<SetStateAction<string>>
    handleUserChoiceRequest: (request: UserChoiceRequest) => Promise<string>
    handleOptionSelect: (optionId: string) => void
    handleCustomSubmit: () => void
    handleCancelChoice: () => void
}

export function useUserChoiceBridge(): UseUserChoiceBridgeApi {
    const [pendingChoice, setPendingChoice] = useState<PendingUserChoice | null>(null)
    const [customInput, setCustomInput] = useState("")
    const pendingChoiceRef = useRef<PendingUserChoice | null>(null)

    const handleUserChoiceRequest = useCallback((request: UserChoiceRequest): Promise<string> => {
        return new Promise((resolve, reject) => {
            const choice: PendingUserChoice = { request, resolve, reject }
            pendingChoiceRef.current = choice
            setPendingChoice(choice)
        })
    }, [])

    const handleOptionSelect = useCallback((optionId: string) => {
        if (pendingChoiceRef.current) {
            pendingChoiceRef.current.resolve(optionId)
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [])

    const handleCustomSubmit = useCallback(() => {
        if (pendingChoiceRef.current && customInput.trim()) {
            pendingChoiceRef.current.resolve(customInput.trim())
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [customInput])

    const handleCancelChoice = useCallback(() => {
        if (pendingChoiceRef.current) {
            pendingChoiceRef.current.reject(new Error('User cancelled the choice'))
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [])

    return {
        pendingChoice,
        customInput,
        setCustomInput,
        handleUserChoiceRequest,
        handleOptionSelect,
        handleCustomSubmit,
        handleCancelChoice,
    }
}
