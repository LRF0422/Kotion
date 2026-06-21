export * from "./core/editor"
export * from "./core/route"
export * from "./core/PluginManager"
export * from "./core/AppContext"
export * from "./core/ServiceRegistry"
export * from "./core/menu"
export * from "./core/tour"
export * from "./core/tour-registry"
export * from "./core/use-tour-registry"
export * from "./event"
export * from "./locales"
// Export from core/types, excluding AIFoundation (already exported via ./ai)
// Services type is exported for module augmentation by plugins
export type {
    KeysWithTypeOf, ValuesOf,
    UploadedFile, UploadOptions, FileSelectorOptions, SelectedFile, FileService,
    Services
} from "./core/types"
export * from "./entity"
export * from "./utils/logger"
export * from "./utils/env-utils"
export * from "./utils/auth"
export * from "./api"
export * from "./hooks"
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
export { default as request, setRequestToast } from "./utils/request"
export { createRoot } from "react-dom/client"
export * from "browser-fs-access"

