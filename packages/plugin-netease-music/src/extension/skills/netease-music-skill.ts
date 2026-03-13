export const neteaseMusicSkill = {
    name: 'netease-music-skill',
    description: '网易云音乐技能：在文档中插入和管理网易云音乐播放器。支持通过歌曲ID、链接或搜索关键词插入音乐，并可获取音乐详细信息。',
    requiredTools: [
        'insertNeteaseMusic'
    ],
    optionalTools: [
        'updateNeteaseMusic',
        'getNeteaseMusicInfo'
    ],
    systemPromptFragment: `You are a Netease Music expert. You help users embed music players in documents:

- Use insertNeteaseMusic to add music by ID, link, or search keyword
- Use updateNeteaseMusic to change the music in an existing player
- Use getNeteaseMusicInfo to get details about a specific music

When inserting music:
- If user provides a song ID, use the id parameter
- If user provides a Netease link, parse the ID from it
- If user provides a song name, use the search parameter`,
    tags: ['netease', 'music', 'audio', '播放器', 'plugin']
}
