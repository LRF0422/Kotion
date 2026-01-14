import { axios } from '@kn/common'
import { toast } from '@kn/ui'
import { showDlg } from './create-portal'

const TOKEN_KEY = 'knowledge-token'
const axiosInstance = axios.create({
    baseURL: "/api",
    timeout: 50000
})

function tansParams(params: Record<string, string>) {
    let result = ''

    for (const propName of Object.keys(params)) {
        const value = params[propName]
        const part = `${encodeURIComponent(propName)}=`

        if (value !== null && value !== '' && typeof (value) !== 'undefined') {
            if (value && typeof value === 'object') {
                for (const key of Object.keys(value)) {
                    if (value && value[key] !== null && value[key] !== '' && typeof (value[key]) !== 'undefined') {
                        const params = `${propName}[${key}]`
                        const subPart = `${encodeURIComponent(params)}=`

                        result += `${subPart + encodeURIComponent(value[key])}&`
                    }
                }
            } else {
                result += `${part + encodeURIComponent(value)}&`
            }
        }
    }
    return result
}

axiosInstance.interceptors.request.use(config => {

    config.headers['Knowledge-Auth'] = localStorage.getItem(TOKEN_KEY)
    config.headers.Authorization = `Basic ${window.btoa(`${'wiki'}:${'wiki_secret'}`)}`

    if (config.method === 'get' && config.params) {
        let url = `${config.url}?${tansParams(config.params)}`
        url = url.slice(0, -1)
        config.params = {}
        config.url = url
    }
    return config
}, error => {
    Promise.reject(error)
})

axiosInstance.interceptors.response.use(res => {

    const status = res.status
    if (status === 401) {
        return Promise.reject('Invalid session or session expired, please login again.')
    }

    if (status !== 200) {
        toast.error(res.data.msg)
        window.location.href = '/login'
        return Promise.reject(res.data.msg)
    }

    if (res.request.responseType === 'blob' || res.request.responseType === 'arraybuffer') {
        return res.data
    }
    return res.data

}, error => {
    const { response } = error
    let { message } = error
    if (response?.status === 401) {
        showDlg('Login session expired', 'You can continue to stay on this page, or login again', () => { }, () => { })
        return Promise.reject(error)
    }
    if (message === 'Network Error') {
        message = 'Backend interface connection exception'
    } else if (message.includes('timeout')) {
        message = 'System interface request timeout'
    } else if (message.includes('Request failed with status code')) {
        message = `System interface ${message.substr(message.length - 3)} exception`
    }
    if (response?.data?.msg) {
        toast.error(response.data.msg, {
            position: 'top-right',
            duration: 2 * 1000
        })
    }
    return Promise.reject(error)
})

export default axiosInstance