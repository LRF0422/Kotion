export * from "./core/editor"
export * from "./core/dock"
export * from "./core/active-editor"
export * from "./core/route"
export * from "./core/PluginManager"
export * from "./core/plugin-runtime"
export * from "./core/global-namespace"
export * from "./core/AppContext"
export * from "./core/ServiceRegistry"
export * from "./core/menu"
export * from "./core/tour"
export * from "./core/tour-registry"
export * from "./core/use-tour-registry"
export * from "./event"
export * from "./locales"
// Services type is exported for module augmentation by plugins
export type {
    KeysWithTypeOf, ValuesOf,
    UploadedFile, UploadOptions, FileSelectorOptions, SelectedFile, FileService,
    AIFoundation, Services
} from "./core/types"
export * from "./entity"
export * from "./domain/space-page"
export * from "./utils/logger"
export * from "./utils/env-utils"
export * from "./utils/auth"
export * from "./api"
export * from "./hooks/use-navigator"
export * from "./hooks/use-upload-file"
export * from "./hooks/use-modal"
export * from "./hooks/use-service"
export * from "./hooks/use-instant-message"
export * from "./hooks/use-plugin-config"
export * from "./hooks/use-plugin-state"
export * from "./hooks/use-page-tabs"
export * from "./hooks/use-dock-panels"
export * from "./hooks/use-active-editor"
export * from "./services"
export * from "./store"
export * from "./ai"
export * from "./context/MobilePageHeaderContext"
export * from "react-redux"
export * from "react-router-dom"
export * from "ahooks"
import axios from "axios";
import smoothScrollIntoViewIfNeeded from 'smooth-scroll-into-view-if-needed';
import deepEqual from "deep-equal"
import moment from "moment"
import { isArray, isObject } from "lodash";
export { smoothScrollIntoViewIfNeeded, axios, deepEqual, moment, isArray, isObject }
export { default as request, setRequestToast, setSessionExpiredHandler, resetSessionExpiredGuard } from "./utils/request"
export { createRoot } from "react-dom/client"
export * from "browser-fs-access"

