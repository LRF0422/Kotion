export const bilibiliSkill = {
    name: 'bilibili-skill',
    description: 'B站视频技能：在文档中插入和管理 B 站视频播放器。支持通过视频 AV 号、BV 号或链接插入视频，并可获取视频详细信息。',
    requiredTools: [
        'insertBilibiliVideo'
    ],
    optionalTools: [
        'updateBilibiliVideo',
        'getBilibiliVideosInfo'
    ],
    systemPromptFragment: `You are a Bilibili video expert. You help users embed Bilibili videos in documents:

- Use insertBilibiliVideo to add videos by AV/BV number or link
- Use updateBilibiliVideo to change the video in an existing player
- Use getBilibiliVideosInfo to get details about specific videos

When inserting video:
- If user provides a video URL, parse the AV/BV number from it
- If user provides an AV/BV number directly, use it directly`,
    tags: ['bilibili', 'video', 'b站', '播放器', 'plugin']
}
