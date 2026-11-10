/**
 * 文件中心的 API 目录现在由 `@kn/common` 统一维护（宿主内核的 `fileService`
 * 与插件 UI 共用同一份端点定义）。这里保留 `APIS` 名字只是为了不动插件内部的
 * 调用点。
 */
export { FILE_CENTER_APIS as APIS } from "@kn/common";
