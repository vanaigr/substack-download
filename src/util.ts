import fs from 'node:fs'
import path from 'node:path'

import type { Log } from './log.ts'
import * as C from './conf.ts'

export function getPostData(values: any) {
    let post: any

    try {
        if(!post) post = values.feedData.initialPost.post
    }
    catch(err) {}

    try {
        if(!post) post = values.post
    }
    catch(err) {}

    if(!post) {
        return {

        }
    }

    return {
        html: post.body_html,
        videoUpload: post.videoUpload,
        podcastUpload: post.podcastUpload,
    }
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

export function extractValues(html: string, log: Log) {
    // OOM 🤡. Even global.gc!() doesn't help
    // "Developers focus on writing logic rather than managing memory manually"
    //let values: any
    /*{
        const jsdom = new JSDOM(html)
        const scriptCands = jsdom.window.document
            .querySelectorAll('script:not([defer]):not([src])')

        const contentRegexp = /^\s*window\._preloads\s*=\s*JSON\.parse\(['"](.*)['"]\);?$/

        for(const cand of scriptCands) {
            let content = cand.textContent
            if(!content) continue
            content = content.trim()
            const match = content.match(contentRegexp)
            if(!match) continue
            values = JSON.parse(JSON.parse('"' + match[1] + '"'))
            break
        }
    }*/
    return (() => {
        const content = html

        const preloads1 = '<script>window._preloads'
        const preloads2 = 'JSON.parse('
        const preloads3 = '</script>'

        const preloads1I = content.indexOf(preloads1)
        if(preloads1I === -1) {
            log.w('Did not find', preloads1)
            return
        }

        const preloads2I = content.indexOf(preloads2, preloads1I + preloads1.length)
        if(preloads2I === -1) {
            log.w('Did not find', preloads2)
            return
        }

        const preloads3I = content.indexOf(preloads3, preloads1I + preloads1.length)
        if(preloads3I === -1) {
            log.w('Did not find where preloads end')
            return
        }
        if(preloads3I < preloads2I) {
            log.w('Should not be possible')
            return
        }

        const beginI = preloads2I + preloads2.length

        const lastI = content.lastIndexOf('"', preloads3I - 1)
        if(lastI === -1 || lastI <= beginI) {
            log.w('bugged html')
            return
        }

        return JSON.parse(JSON.parse(content.substring(beginI, lastI + 1)))
    })()
}
