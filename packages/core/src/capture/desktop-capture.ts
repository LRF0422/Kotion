import type {
    DesktopBridge,
    DesktopCaptureSource,
    DesktopCaptureSourceType,
} from '@kn/common'

/** Screen/window sources, with thumbnails, from the main process. */
export const getCaptureSources = (
    desktop: DesktopBridge,
    types?: DesktopCaptureSourceType[],
): Promise<DesktopCaptureSource[]> =>
    desktop.invoke('capture.sources', { types, thumbnailWidth: 320 })

const openDesktopStream = (sourceId: string): Promise<MediaStream> =>
    navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxFrameRate: 30,
            },
        },
    } as unknown as MediaStreamConstraints)

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

const waitForFrame = (video: HTMLVideoElement): Promise<void> =>
    new Promise((resolve) => {
        if (video.videoWidth > 0) {
            resolve()
            return
        }
        const done = () => {
            if (video.videoWidth > 0) {
                video.removeEventListener('loadedmetadata', done)
                video.removeEventListener('resize', done)
                resolve()
            }
        }
        video.addEventListener('loadedmetadata', done)
        video.addEventListener('resize', done)
        setTimeout(resolve, 1500)
    })

/** Grab a single PNG frame from a capture source. */
export const captureScreenshot = async (sourceId: string): Promise<File> => {
    const stream = await openDesktopStream(sourceId)
    try {
        const video = document.createElement('video')
        video.srcObject = stream
        video.muted = true
        await video.play()
        await waitForFrame(video)

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('CAPTURE_CANVAS')
        context.drawImage(video, 0, 0, canvas.width, canvas.height)

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (!blob) throw new Error('CAPTURE_ENCODE')
        return new File([blob], 'screenshot-' + stamp() + '.png', { type: 'image/png' })
    } finally {
        stream.getTracks().forEach((track) => track.stop())
    }
}

const pickRecorderMime = (): string => {
    if (typeof MediaRecorder === 'undefined') return ''
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

export interface DesktopRecording {
    /** Stop and resolve the recorded file. */
    stop: () => Promise<File>
    /** Stop without producing a file. */
    cancel: () => void
    stream: MediaStream
}

/** Start recording a capture source until stop()/cancel() is called. */
export const startRecording = async (sourceId: string): Promise<DesktopRecording> => {
    const stream = await openDesktopStream(sourceId)
    const mimeType = pickRecorderMime()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.start(1000)

    const dispose = () => stream.getTracks().forEach((track) => track.stop())

    return {
        stream,
        cancel: () => {
            try {
                if (recorder.state !== 'inactive') recorder.stop()
            } catch {
                // ignore
            }
            dispose()
        },
        stop: () =>
            new Promise<File>((resolve) => {
                recorder.onstop = () => {
                    const type = mimeType || 'video/webm'
                    const blob = new Blob(chunks, { type })
                    dispose()
                    const extension = type.includes('mp4') ? 'mp4' : 'webm'
                    resolve(new File([blob], 'recording-' + stamp() + '.' + extension, { type }))
                }
                if (recorder.state === 'inactive') {
                    dispose()
                    resolve(new File([], 'recording-' + stamp() + '.webm', { type: 'video/webm' }))
                    return
                }
                recorder.stop()
            }),
    }
}
