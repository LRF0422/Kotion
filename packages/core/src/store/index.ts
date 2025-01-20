import { AnyAction, createStore } from "redux";
import { GlobalState } from "./GlobalState";

export * from "./GlobalState"


export default createStore((state: GlobalState = {
    tabs: [],
    activeTabKey: '',
    collpase: false,
    rightCollpase: false
}, action: AnyAction) => {
    if (action.type === "UPDATE_USER") {
        const userInfo = action?.payload
        return {
            userInfo,
            ...state
        }
    }

    if (action.type === "ADD_TAB") {
        const tabInfo = action.payload
        const tabs = state.tabs
        const curr = tabs.find(it => it.key === tabInfo.key);
        if (curr) {
            return {
                ...state,
                activeTabKey: tabInfo.key
            }
        } else {
            tabs.push(tabInfo)
            return {
                ...state,
                tabs: [...tabs],
                activeTabKey: tabInfo.key
            }
        }
    }

    if (action.type === "UPDATE_ACTIVE_TAB") {
        const tabKey = action.payload
        return {
            ...state,
            activeTabKey: tabKey
        }
    }

    if (action.type === "CLOSE_TAB") {
        const tabKey = action.payload
        const tabs = state.tabs.filter((it, index) => it.key === tabKey)
        return {
            ...state,
            tabs,
        }
    }
    if (action.type === "UPDATE_COLLPASE") {
        const collpase = action.payload
        return {
            ...state,
            collpase
        }
    }
    if (action.type === "UPDATE_RIGHT_COLLPASE") {
        const collpase = action.payload
        return {
            ...state,
            rightCollpase: collpase
        }
    }
    return state;
})