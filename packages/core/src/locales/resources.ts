
export const resources = {
    zh: {
        translation: {
            "errorPage": {
                "title": "哎呀！出错了",
                "subtitle": "我们遇到了一个意外错误",
                "errorDetails": "错误详情",
                "unknownError": "发生未知错误",
                "showDetails": "显示技术详情",
                "hideDetails": "隐藏技术详情",
                "backToHome": "返回首页",
                "reloadPage": "重新加载页面",
                "helpTitle": "如果问题持续存在，请尝试：",
                "helpClearCache": "清除浏览器缓存和Cookie",
                "helpCheckConnection": "检查您的网络连接",
                "helpContactSupport": "如果问题仍然存在，请联系支持"
            },
            "marketplace": {
                "create-your-own-plugin": "创建你自己的插件",
                "get-started": "马上开始",
                "doc": "开发者文档",
                "title": "增强你的体验",
                "description": "探索可扩展Kotion功能并助您高效工作的插件。"
            },
            "messageBox": {
                "title": "消息盒子",
                "unreadCount": "{{n}} 条未读消息",
                "tabs": {
                    "all": "全部",
                    "system": "系统",
                    "collaboration": "协作"
                },
                "empty": {
                    "all": "暂无消息",
                    "allDesc": "新消息将会显示在这里",
                    "system": "没有系统消息",
                    "systemDesc": "系统通知和更新信息将在这里显示",
                    "collaboration": "都看完啦！",
                    "collaborationDesc": "您将在这里收到页面协作邀请"
                },
                "actions": {
                    "markAsRead": "标记为已读",
                    "markAllRead": "全部已读",
                    "delete": "删除"
                },
                "time": {
                    "justNow": "刚刚",
                    "minutesAgo": "{{n}} 分钟前",
                    "hoursAgo": "{{n}} 小时前",
                    "daysAgo": "{{n}} 天前"
                },
                "viewAll": "查看全部消息"
            },
            "pluginUploader": {
                "dialogTitle": "发布插件",
                "step": "步骤",
                "steps": {
                    "basicInfo": "基本信息",
                    "basicInfoDesc": "填写插件基础信息",
                    "features": "功能介绍",
                    "featuresDesc": "添加详细功能描述",
                    "upload": "上传发布",
                    "uploadDesc": "上传文件并提交"
                },
                "sections": {
                    "basicIdentity": "基础标识",
                    "versionAndCategory": "版本与分类",
                    "displayInfo": "展示信息"
                },
                "fields": {
                    "pluginName": "插件名称",
                    "pluginNamePlaceholder": "例如：AI 智能助手",
                    "pluginNameHint": "用于展示的插件显示名称",
                    "pluginKey": "插件标识",
                    "pluginKeyPlaceholder": "例如：ai-assistant",
                    "pluginKeyHint": "唯一标识，仅小写字母、数字和连字符",
                    "version": "版本号",
                    "versionPlaceholder": "1.0.0",
                    "versionHint": "语义化版本格式：主版本.次版本.修订号",
                    "tags": "分类标签",
                    "tagsPlaceholder": "输入标签后按 Enter 添加",
                    "tagsHint": "添加 1-5 个标签，便于用户搜索发现",
                    "icon": "插件图标",
                    "iconHint": "PNG/JPG, 建议 120×120px",
                    "iconUpload": "上传",
                    "description": "插件简介",
                    "descriptionPlaceholder": "请简要描述插件的核心功能和使用场景，这将显示在插件列表中...",
                    "descriptionHint": "一句话描述插件的核心价值"
                },
                "tabs": {
                    "feature": "功能特性",
                    "featureHint": "介绍插件的主要功能和亮点",
                    "detail": "使用说明",
                    "detailHint": "详细的使用方法和配置指南",
                    "changelog": "更新日志",
                    "changelogHint": "版本更新内容和历史记录",
                    "customHint": "自定义描述内容",
                    "addCustom": "添加自定义分类"
                },
                "docTip": {
                    "title": "丰富的文档能提升用户体验",
                    "content": "详尽的功能介绍和使用说明可以帮助用户快速上手，也能减少后期的支持工作量"
                },
                "uploadSection": {
                    "title": "上传插件文件",
                    "hint": "支持 .js 文件，最大 100MB",
                    "uploading": "正在上传文件...",
                    "uploaded": "插件文件已就绪"
                },
                "preview": {
                    "title": "发布预览",
                    "aboutToPublish": "即将发布",
                    "noName": "未填写名称",
                    "noDescription": "暂无描述",
                    "pluginKey": "插件标识",
                    "fileStatus": "文件状态",
                    "uploaded": "已上传",
                    "pending": "待上传",
                    "tags": "分类标签",
                    "noTags": "未添加标签"
                },
                "submitTip": {
                    "content": "提交须知：提交后插件将进入审核队列，审核通过后自动上架到插件市场。审核周期通常为 1-3 个工作日。"
                },
                "buttons": {
                    "prev": "上一步",
                    "next": "下一步",
                    "submit": "提交审核",
                    "submitting": "提交中..."
                },
                "exitDialog": {
                    "title": "确认退出？",
                    "description": "您的进度尚未保存，退出后所有填写的信息将会丢失。确定要退出吗？",
                    "cancel": "取消",
                    "confirm": "确认退出"
                },
                "validation": {
                    "nameMin": "插件名称不能少于 2 个字符",
                    "nameMax": "插件名称不能超过 50 个字符",
                    "keyMin": "插件标识符不能少于 2 个字符",
                    "keyMax": "插件标识符不能超过 50 个字符",
                    "keyFormat": "仅支持小写字母、数字和连字符（如：my-plugin）",
                    "versionFormat": "请输入正确的版本号格式（如：1.0.0）",
                    "tagsMin": "请至少添加一个分类标签",
                    "descriptionMin": "插件描述不能少于 10 个字符，请详细描述插件功能",
                    "descriptionMax": "插件描述不能超过 500 个字符",
                    "formIncomplete": "请完善必填信息后再继续",
                    "fileRequired": "请先上传插件文件（.js 格式）",
                    "validationError": "表单验证失败，请检查输入",
                    "keepOneTab": "至少保留一个描述分类"
                },
                "toast": {
                    "submitSuccess": "🎉 插件提交成功！审核通过后将自动上架",
                    "submitFailed": "提交失败，请检查网络后重试",
                    "iconUploaded": "图标上传成功",
                    "iconUploadFailed": "图标上传失败，请检查图片格式",
                    "iconRemoved": "图标已移除，可重新上传",
                    "fileUploaded": "✅ 文件上传成功：{{filename}}",
                    "fileUploadFailed": "文件上传失败，请检查网络后重试"
                }
            },
            "pluginManager": {
                "title": "管理插件",
                "description": "管理、发布和配置您的插件。",
                "overview": "概览",
                "total": "总计",
                "active": "已启用",
                "inactive": "已禁用",
                "pending": "待审核",
                "status": "状态",
                "type": "类型",
                "allPlugins": "全部插件",
                "pendingReview": "待审核",
                "feature": "功能",
                "uiEnhancement": "界面增强",
                "integration": "集成",
                "utility": "工具",
                "pluginsShown": "个插件",
                "searchPlugins": "搜索插件...",
                "sortBy": "排序",
                "name": "名称",
                "lastUpdated": "最后更新",
                "created": "创建时间",
                "newPlugin": "新建插件",
                "selected": "已选择",
                "enable": "启用",
                "disable": "禁用",
                "delete": "删除",
                "clear": "清除",
                "noPluginsFound": "未找到插件",
                "noPluginsYet": "暂无插件",
                "tryAdjusting": "请尝试调整搜索条件",
                "createFirst": "创建您的第一个插件开始使用",
                "viewDetails": "查看详情",
                "activate": "启用",
                "deactivate": "禁用",
                "edit": "编辑",
                "publishNewVersion": "发布新版本",
                "copyPluginKey": "复制插件Key",
                "pluginDetails": "插件详情",
                "developer": "开发者",
                "maintainer": "维护者",
                "pluginKey": "插件Key",
                "quickActions": "快捷操作",
                "publish": "发布",
                "settings": "设置",
                "versionHistory": "版本历史",
                "viewAll": "查看全部",
                "currentVersion": "当前版本",
                "latest": "最新",
                "unknown": "未知",
                "deletePlugin": "删除插件",
                "deleteConfirm": "确定要删除",
                "deleteWarning": "此操作无法撤销。",
                "cancel": "取消",
                "confirm": "确认",
                "publishVersion": "发布新版本",
                "uploadPluginFile": "上传插件文件",
                "required": "必填",
                "chooseFile": "选择文件",
                "versionDescription": "版本描述",
                "publishing": "发布中...",
                "keyCopied": "插件Key已复制到剪贴板",
                "enableSuccess": "插件已启用",
                "disableSuccess": "插件已禁用",
                "deleteSuccess": "插件已删除",
                "publishSuccess": "插件发布成功",
                "bulkEnableSuccess": "个插件已启用",
                "bulkDisableSuccess": "个插件已禁用",
                "bulkDeleteSuccess": "个插件已删除",
                "tabAdded": "标签页已添加",
                "tabRemoved": "标签页已移除",
                "tabNameEmpty": "标签页名称不能为空",
                "tabNameExists": "标签页名称已存在",
                "cannotRemoveLastTab": "无法移除最后一个标签页",
                "uploadFile": "请上传插件文件",
                "noPluginSelected": "未选择插件",
                "fileUploaded": "文件上传成功",
                "loadFailed": "加载插件详情失败",
                "operationFailed": "操作失败"
            }
        }
    },
    en: {
        translation: {
            "errorPage": {
                "title": "Oops! Something went wrong",
                "subtitle": "We encountered an unexpected error",
                "errorDetails": "Error Details",
                "unknownError": "Unknown error occurred",
                "showDetails": "Show technical details",
                "hideDetails": "Hide technical details",
                "backToHome": "Back to Home",
                "reloadPage": "Reload Page",
                "helpTitle": "If the problem persists, please try:",
                "helpClearCache": "Clear your browser cache and cookies",
                "helpCheckConnection": "Check your internet connection",
                "helpContactSupport": "Contact support if the issue continues"
            },
            "marketplace": {
                "create-your-own-plugin": "Build your own plugin",
                "get-started": "Get Started",
                "doc": "Developer Docs",
                "title": "Enhance your Kotion experience",
                "description": "Discover plugins that extend Kotion's capabilities and help you work more efficiently."
            },
            "messageBox": {
                "title": "Messages",
                "unreadCount": "{{n}} unread messages",
                "tabs": {
                    "all": "All",
                    "system": "System",
                    "collaboration": "Collaboration"
                },
                "empty": {
                    "all": "No messages",
                    "allDesc": "New messages will appear here",
                    "system": "No system messages",
                    "systemDesc": "System notifications and updates will appear here",
                    "collaboration": "All caught up!",
                    "collaborationDesc": "You'll receive page collaboration invites here"
                },
                "actions": {
                    "markAsRead": "Mark as read",
                    "markAllRead": "Mark all read",
                    "delete": "Delete"
                },
                "time": {
                    "justNow": "Just now",
                    "minutesAgo": "{{n}} min ago",
                    "hoursAgo": "{{n}} hr ago",
                    "daysAgo": "{{n}} days ago"
                },
                "viewAll": "View all messages"
            },
            "pluginUploader": {
                "dialogTitle": "Publish Plugin",
                "step": "Step",
                "steps": {
                    "basicInfo": "Basic Info",
                    "basicInfoDesc": "Fill in plugin basic information",
                    "features": "Features",
                    "featuresDesc": "Add detailed feature descriptions",
                    "upload": "Upload & Publish",
                    "uploadDesc": "Upload file and submit"
                },
                "sections": {
                    "basicIdentity": "Basic Identity",
                    "versionAndCategory": "Version & Category",
                    "displayInfo": "Display Info"
                },
                "fields": {
                    "pluginName": "Plugin Name",
                    "pluginNamePlaceholder": "e.g., AI Smart Assistant",
                    "pluginNameHint": "Display name shown in plugin listings",
                    "pluginKey": "Plugin Key",
                    "pluginKeyPlaceholder": "e.g., ai-assistant",
                    "pluginKeyHint": "Unique identifier, lowercase letters, numbers and hyphens only",
                    "version": "Version",
                    "versionPlaceholder": "1.0.0",
                    "versionHint": "Semantic version format: major.minor.patch",
                    "tags": "Tags",
                    "tagsPlaceholder": "Type and press Enter to add",
                    "tagsHint": "Add 1-5 tags to help users discover your plugin",
                    "icon": "Plugin Icon",
                    "iconHint": "PNG/JPG, recommended 120×120px",
                    "iconUpload": "Upload",
                    "description": "Description",
                    "descriptionPlaceholder": "Briefly describe your plugin's core features and use cases. This will be shown in the plugin list...",
                    "descriptionHint": "One sentence describing your plugin's core value"
                },
                "tabs": {
                    "feature": "Features",
                    "featureHint": "Introduce main features and highlights",
                    "detail": "Usage Guide",
                    "detailHint": "Detailed usage instructions and configuration",
                    "changelog": "Changelog",
                    "changelogHint": "Version updates and history",
                    "customHint": "Custom description content",
                    "addCustom": "Add custom category"
                },
                "docTip": {
                    "title": "Rich documentation improves user experience",
                    "content": "Detailed feature descriptions and usage guides help users get started quickly and reduce support workload"
                },
                "uploadSection": {
                    "title": "Upload Plugin File",
                    "hint": "Supports .js files, max 100MB",
                    "uploading": "Uploading file...",
                    "uploaded": "Plugin file ready"
                },
                "preview": {
                    "title": "Publish Preview",
                    "aboutToPublish": "Ready to publish",
                    "noName": "No name provided",
                    "noDescription": "No description",
                    "pluginKey": "Plugin Key",
                    "fileStatus": "File Status",
                    "uploaded": "Uploaded",
                    "pending": "Pending",
                    "tags": "Tags",
                    "noTags": "No tags added"
                },
                "submitTip": {
                    "content": "Submission Notice: After submission, your plugin will enter the review queue and be published automatically once approved. Review typically takes 1-3 business days."
                },
                "buttons": {
                    "prev": "Previous",
                    "next": "Next",
                    "submit": "Submit for Review",
                    "submitting": "Submitting..."
                },
                "exitDialog": {
                    "title": "Confirm Exit?",
                    "description": "Your progress has not been saved. All entered information will be lost if you exit. Are you sure?",
                    "cancel": "Cancel",
                    "confirm": "Confirm Exit"
                },
                "validation": {
                    "nameMin": "Plugin name must be at least 2 characters",
                    "nameMax": "Plugin name cannot exceed 50 characters",
                    "keyMin": "Plugin key must be at least 2 characters",
                    "keyMax": "Plugin key cannot exceed 50 characters",
                    "keyFormat": "Only lowercase letters, numbers and hyphens allowed (e.g., my-plugin)",
                    "versionFormat": "Please enter a valid version format (e.g., 1.0.0)",
                    "tagsMin": "Please add at least one tag",
                    "descriptionMin": "Description must be at least 10 characters, please describe your plugin in detail",
                    "descriptionMax": "Description cannot exceed 500 characters",
                    "formIncomplete": "Please complete all required fields before continuing",
                    "fileRequired": "Please upload a plugin file (.js format)",
                    "validationError": "Form validation failed, please check your input",
                    "keepOneTab": "Keep at least one description category"
                },
                "toast": {
                    "submitSuccess": "🎉 Plugin submitted successfully! It will be published after review",
                    "submitFailed": "Submission failed, please check your network and try again",
                    "iconUploaded": "Icon uploaded successfully",
                    "iconUploadFailed": "Icon upload failed, please check image format",
                    "iconRemoved": "Icon removed, you can upload a new one",
                    "fileUploaded": "✅ File uploaded: {{filename}}",
                    "fileUploadFailed": "File upload failed, please check your network and try again"
                }
            },
            "pluginManager": {
                "title": "Manage Plugins",
                "description": "Manage, publish, and configure your plugins.",
                "overview": "Overview",
                "total": "Total",
                "active": "Active",
                "inactive": "Inactive",
                "pending": "Pending",
                "status": "Status",
                "type": "Type",
                "allPlugins": "All Plugins",
                "pendingReview": "Pending Review",
                "feature": "Feature",
                "uiEnhancement": "UI Enhancement",
                "integration": "Integration",
                "utility": "Utility",
                "pluginsShown": "plugin(s)",
                "searchPlugins": "Search plugins...",
                "sortBy": "Sort by",
                "name": "Name",
                "lastUpdated": "Last Updated",
                "created": "Created",
                "newPlugin": "New Plugin",
                "selected": "selected",
                "enable": "Enable",
                "disable": "Disable",
                "delete": "Delete",
                "clear": "Clear",
                "noPluginsFound": "No plugins found",
                "noPluginsYet": "No plugins yet",
                "tryAdjusting": "Try adjusting your search terms",
                "createFirst": "Create your first plugin to get started",
                "viewDetails": "View Details",
                "activate": "Activate",
                "deactivate": "Deactivate",
                "edit": "Edit",
                "publishNewVersion": "Publish New Version",
                "copyPluginKey": "Copy Plugin Key",
                "pluginDetails": "Plugin Details",
                "developer": "Developer",
                "maintainer": "Maintainer",
                "pluginKey": "Plugin Key",
                "quickActions": "Quick Actions",
                "publish": "Publish",
                "settings": "Settings",
                "versionHistory": "Version History",
                "viewAll": "View All",
                "currentVersion": "Current version",
                "latest": "Latest",
                "unknown": "Unknown",
                "deletePlugin": "Delete Plugin",
                "deleteConfirm": "Are you sure you want to delete",
                "deleteWarning": "This action cannot be undone.",
                "cancel": "Cancel",
                "confirm": "Confirm",
                "publishVersion": "Publish New Version",
                "uploadPluginFile": "Upload Plugin File",
                "required": "Required",
                "chooseFile": "Choose File",
                "versionDescription": "Version Description",
                "publishing": "Publishing...",
                "keyCopied": "Plugin key copied to clipboard",
                "enableSuccess": "Plugin enabled successfully",
                "disableSuccess": "Plugin disabled successfully",
                "deleteSuccess": "Plugin deleted successfully",
                "publishSuccess": "Plugin published successfully",
                "bulkEnableSuccess": "plugin(s) enabled successfully",
                "bulkDisableSuccess": "plugin(s) disabled successfully",
                "bulkDeleteSuccess": "plugin(s) deleted successfully",
                "tabAdded": "Tab added successfully",
                "tabRemoved": "Tab removed successfully",
                "tabNameEmpty": "Tab name cannot be empty",
                "tabNameExists": "Tab name already exists",
                "cannotRemoveLastTab": "Cannot remove the last tab",
                "uploadFile": "Please upload a plugin file",
                "noPluginSelected": "No plugin selected",
                "fileUploaded": "File uploaded successfully",
                "loadFailed": "Failed to load plugin details",
                "operationFailed": "Operation failed"
            }
        }
    }

}