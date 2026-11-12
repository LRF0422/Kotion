// 误建文件（一次性事故），请删除本文件。
// 说明：插件工程 ssh-tool 的工具调用用了相对路径 `src/transferTask.ts`，而 `writePluginProjectFile`
// 的相对路径解析到的是本仓库根目录（apps/desktop/），于是这份属于插件的内容被写到了这里。
// 插件工程里的同名文件已按正确路径重建（plugin-projects/ssh-tool/src/transferTask.ts）。
// 本文件不导出任何东西、也不被任何地方 import，保留为纯注释只是为了避免本仓库 typecheck 报错。
export {}