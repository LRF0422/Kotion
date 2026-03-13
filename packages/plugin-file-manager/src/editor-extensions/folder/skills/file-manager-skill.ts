export const fileManagerSkill = {
    name: 'file-manager-skill',
    description: '文件管理技能：插入网络图片到文档中。支持通过 URL 插入图片，可指定图片宽度。',
    requiredTools: [
        'insertNetworkImage'
    ],
    systemPromptFragment: `You are a File Manager expert. You help users insert network images:

- Use insertNetworkImage to insert images from URLs
- You can specify the width of the image

When inserting images:
- Verify the URL is accessible before inserting
- Consider reasonable image dimensions`,
    tags: ['file-manager', 'image', '网络图片', 'plugin']
}
