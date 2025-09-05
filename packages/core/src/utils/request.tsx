import { Button } from '@kn/ui'
import axios from 'axios'
import { toast } from '@kn/ui'
import React from 'react'

const TOKEN_KEY = 'knowledge-token'

// http://www.simple-platform.cn:88
const axiosInstance = axios.create({
  baseURL: "/api",
  timeout: 50000
})

export const isRelogin = { show: false }

function tansParams(params: Record<any, string>) {
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

  config.headers['Knowledge-Auth'] = localStorage.getItem(TOKEN_KEY) // 让每个请求携带自定义token 请根据实际情况自行修改
  // 携带client_id client_secret 信息
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

  // 返回码
  const code: any = res.data.code || 200
  const status = res.status

  // 消息
  const msg = res.data.msg

  if (status !== 200) {
    toast.error(res.data.msg)
    window.location.href = '/login'
    return Promise.reject(res.data.msg)
  }

  if (res.request.responseType === 'blob' || res.request.responseType === 'arraybuffer') {
    return res.data
  }

  if (code === 401) {
    toast.warning('登录状态已过期，您可以继续留在该页面，或者重新登录', {
      position: 'top-center',
      action: <Button onClick={() => {
        throw new Error("no login ")
      }}>重新登录</Button>,
      duration: -1
    })
    return Promise.reject('无效的会话，或者会话已过期，请重新登录。')
  } if (code === 500) {
    return Promise.reject(new Error(msg))
  } if (code !== 200) {
    toast.error(res.data.msg, {
      position: 'top-center'
    })
    return Promise.reject(res.data.msg)
  }
  return res.data

}, error => {
  const { response, request } = error
  let { message } = error
  if (response.status === 401 && !isRelogin.show) {
    isRelogin.show = true
    return Promise.reject(error)
  }
  if (message === 'Network Error') {
    message = '后端接口连接异常'
  } else if (message.includes('timeout')) {
    message = '系统接口请求超时'
  } else if (message.includes('Request failed with status code')) {
    message = `系统接口${message.substr(message.length - 3)}异常`
  }
  toast.error(response.data.msg, {
    position: 'top-right',
    duration: 2 * 1000
  })
  return Promise.reject(error)
})

export default axiosInstance