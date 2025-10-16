

export const usePath = (path: string) => {

    const downloadPath = "https://kotion.top:888/api/knowledge-resource/oss/endpoint/download?fileName="

    return downloadPath + path
}