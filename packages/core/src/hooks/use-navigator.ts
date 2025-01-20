import { useDispatch } from "react-redux"
import { NavigateOptions, To, useNavigate } from "react-router-dom"

export interface NavigatorProps {
    to: To,
    options?: NavigateOptions,
    extra?: {
        attacheTabs?: boolean,
        name?: string
    }
}

export const useNavigator = () => {

    const navigate = useNavigate()
    const dispatch = useDispatch()

    return {
        go: (props: NavigatorProps) => {
            if (props.extra?.attacheTabs) {
                dispatch({
                    type: 'ADD_TAB',
                    payload: {
                        path: props.to.toString(),
                        name: props.extra.name,
                        key: props.to.toString()
                    }
                })
            }
            navigate(props.to, props.options)
        }
    }
}