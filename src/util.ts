import fs from 'node:fs'
import path from 'node:path'

import type { Log } from './log.ts'
import * as C from './conf.ts'

export function getPostData(values: any) {
    let html: string | undefined
    let videoUpload: any

    try {
        if(!html) {
            html = values.feedData.initialPost.post.body_html
            videoUpload = values.feedData.initialPost.post.videoUpload
        }
    }
    catch(err) {}

    try {
        if(!html) {
            html = values.post.body_html
            videoUpload = values.post.videoUpload
        }
    }
    catch(err) {}

    return { html, videoUpload }
}

export function makeCookie(log: Log) {
    let cookies: string | undefined
    try {
        const contentStr = fs.readFileSync(path.join(C.data, 'setupCookie', 'rawCookies.json')).toString()
        if(!contentStr) throw new Error('File is empty')
        const content = JSON.parse(contentStr) as any[]
        cookies = content.map(it => it.name + '=' + it.value).join('; ')
    }
    catch(err) {
        log.w('Could not parse cookies. Videos will fail to load', err)
    }
    return cookies
}
