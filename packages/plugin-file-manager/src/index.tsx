
import { KPlugin, PluginConfig, liftLegacySkills, liftLegacyTools } from "@kn/common"
import { FolderExtension } from "./editor-extensions/folder"
import { fileManagerTools } from "./editor-extensions/folder/tools"
import { fileManagerSkill } from "./editor-extensions/folder/skills/file-manager-skill"
import { AttachmentExtension } from "./editor-extensions/attachment"
import { Folder } from "@kn/icon"
import React from "react"
import { FileManagerView } from "./editor-extensions/component/FileManager"
import { ImageExtension } from "./editor-extensions/image"
import { getFileService } from "./services/FileServiceImpl"

// import "@kn/ui/globals.css"

interface FileManagerPluginConfig extends PluginConfig {
    // Add custom configuration options here if needed
    defaultView?: 'grid' | 'list'
    maxUploadSize?: number
}

class FileManager extends KPlugin<FileManagerPluginConfig> {
    constructor(config: FileManagerPluginConfig) {
        super(config)
    }
}

// Create FileService instance for registration
const fileService = getFileService();

export const fileManager = new FileManager({
    status: '',
    name: 'File Manager',
    editorExtension: [FolderExtension, ImageExtension, AttachmentExtension],
    agent: {
        agents: [{
            id: 'file-manager-ops',
            name: '文件与图片嵌入',
            description: '把外部资源写进当前页面：目前提供按网络 URL 插入图片（可指定宽度、替代文本）。'
                + '当用户给出图片链接、要求把某张在线图片放进文档时派给它。',
            scope: 'page',
            systemPrompt: '你是当前页面的文件/图片嵌入助手，目前只有一个工具 insertNetworkImage。'
                + '插入前确认 URL 是可直接访问的图片地址（http/https，扩展名或内容类型像图片），宽度按用户要求设置，未指定就不要乱改。'
                + 'URL 明显不是图片时要如实说明，不要插入坏图。不要改动本页其他内容。'
                + '完成后一句话汇报：插入了哪张图片、宽度是多少、落在文档的哪个位置。',
            tools: liftLegacyTools(fileManagerTools, { scope: 'page' }),
            skills: liftLegacySkills([fileManagerSkill]),
        }],
    },
    routes: [
        {
            name: 'fileManager',
            path: '/fileManager',
            element: <FileManagerView className=" h-full" />
        }
    ],
    menus: [
        {
            id: '/fileManager',
            name: 'fileManager',
            key: 'File Manager',
            icon: <Folder className="h-5 w-5" />
        }
    ],
    // Register FileService to be accessed via useService/useFileService
    services: {
        fileService: fileService
    }
})