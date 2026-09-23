/**
 * Plugin Studio — marketplace glue.
 *
 * The studio no longer contributes a settings panel: the publish action lives
 * on the dock's plugin rows. It builds the selected project, uploads the
 * artifact, then asks the host to open its own publish flow (the same wizard /
 * version dialog the plugin center uses) through the pluginMarketplace service.
 */
import { useCallback } from 'react'
import { useDevCapability, useMarketplace } from './studio-service'

export interface PublishProjectInput {
    root?: string
    pluginKey?: string
    name?: string
}

export const usePublishProject = () => {
    const capability = useDevCapability()
    const marketplace = useMarketplace()
    return useCallback(
        async (input: PublishProjectInput): Promise<void> => {
            if (!capability) throw new Error('插件开发台不可用：当前宿主缺少 dev.* 能力')
            if (!marketplace) throw new Error('宿主未注册 pluginMarketplace 服务，无法发布')
            if (!input.root) throw new Error('请先选择一个插件工程')
            const status = await capability.dev.build({ root: input.root })
            if (!status.build?.code) {
                throw new Error(status.error ?? '构建失败，没有可发布的产物')
            }
            const uploaded = await marketplace.uploadArtifact({
                fileName: (input.pluginKey || status.plugin.pluginKey || 'index') + '.js',
                data: new Blob([status.build.code], { type: 'text/javascript' }),
            })
            const mine = await marketplace.listMine().catch(() => [])
            const listed = input.pluginKey
                ? mine.find((entry) => entry.pluginKey === input.pluginKey)
                : undefined
            marketplace.openPublisher({
                pluginId: listed?.id,
                prefill: {
                    name: input.name || status.plugin.name,
                    pluginKey: input.pluginKey || status.plugin.pluginKey,
                    version: '1.0.0',
                },
                artifact: uploaded,
            })
        },
        [capability, marketplace],
    )
}
