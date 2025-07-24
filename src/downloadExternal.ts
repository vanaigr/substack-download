import jsdomLib from 'jsdom'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import fetch from 'node-fetch'

import * as C from './conf.ts'
import { makeConsoleAndFileLogger, type Log } from './log.ts'

const JSDOM = jsdomLib.JSDOM

const base = path.join(C.data, 'externalFiles')
fs.rmSync(base, { recursive: true, force: true })
fs.mkdirSync(base, { recursive: true })
const baseLog = makeConsoleAndFileLogger(path.join(base, 'log.txt'))


let cookies: string | undefined
try {
    const contentStr = fs.readFileSync(path.join(C.data, 'setupCookie', 'rawCookies.json')).toString()
    if(!contentStr) throw new Error('File is empty')
    const content = JSON.parse(contentStr) as any[]
    cookies = content.map(it => it.name + '=' + it.value).join('; ')
}
catch(err) {
    baseLog.w('Could not parse cookies. Videos will fail to load', err)
}

let processedCount = 0
for(const filename of fs.readdirSync(C.config.downloadedPostsPath)) {
    if(!filename.endsWith('.html')) continue

    const log = baseLog.withIds(filename)
    log.i('Processing')

    let values: any
    {
        const jsdom = new JSDOM(fs.readFileSync(
            path.join(C.config.downloadedPostsPath, filename)
        ).toString())
        const scriptCands = jsdom.window.document
            .querySelectorAll('script:not([defer]):not([src])')

        const contentRegexp = /window\._preloads\s*=\s*JSON\.parse\(['"](.*)['"]\);?$/


        for(const cand of scriptCands) {
            let content = cand.textContent
            if(!content) continue
            content = content.trim()
            const match = content.match(contentRegexp)
            if(!match) continue
            values = JSON.parse(JSON.parse('"' + match[1] + '"'))
        }
    }
    if(!values) {
        log.w('Could not find values. Skipping')
        continue
    }
    //fs.writeFileSync(C.root + '/file.json', JSON.stringify(values, null, 2))

    const postDir = path.join(base, filename.substring(0, filename.length - 5))
    fs.mkdirSync(postDir)

    let filenamesEnd = 1
    const externalSources: Record<string, string> = {}
    let videoPath: string | undefined

    const html = values.feedData.initialPost.post.body_html
    const jsdom = new JSDOM(html)

    const videoUpload = values.feedData.initialPost.post.videoUpload
    if(videoUpload) {
        const videoLog = log.withIds('video')
        try {
            videoLog.i('Found video upload. Fetching')

            const videoUrl = new URL(
                'api/v1/video/upload/' + encodeURIComponent(videoUpload.id) + '/src',
                C.config.substackBaseUrl,
            )

            log.i('Fetching from', videoUrl.toString())
            const resp = await fetch(videoUrl, {
                headers: {
                    ...(cookies ? { cookie: cookies } : {}),
                },
            })
            if(!resp.ok) {
                const body = await resp.text().then(
                    it => 'Body:' + it,
                    it => 'Body error:' + it
                )
                throw new Error(
                    'Response status: ' + resp.status + '. Body: ' + body
                )
            }
            const filename = '' + (filenamesEnd++) + '.mp4'
            await fsp.writeFile(
                path.join(postDir, filename),
                Buffer.from(await resp.arrayBuffer())
            )
            videoPath = filename
            /*const videoTag = jsdom.window.document.createElement('video')
            videoTag.setAttribute('controls', '')
            const source = jsdom.window.document.createElement('source')
            source.setAttribute('src', './' + filename)
            source.classList.add('main-video')
            videoTag.append(source)
            jsdom.window.document.body.prepend(videoTag)*/
        }
        catch(err) {
            videoLog.e(err)
        }
    }

    const images = jsdom.window.document.querySelectorAll('img')

    const imageSrcs = new Map<string, string>()
    for(const it of images) {
        const src = it.getAttribute('src')
        if(src) {
            let extension = '.png'
            let extensionI = src.lastIndexOf('.')
            if(extensionI !== -1) {
                extension = src.substring(extensionI)
            }

            const filename = '' + (filenamesEnd++) + extension
            externalSources[src] = filename
            imageSrcs.set(src, filename)
        }
    }

    const galleries = jsdom.window.document.querySelectorAll('div[data-attrs]')
    for(const it of galleries) {
        const attrs = JSON.parse(it.getAttribute('data-attrs')!)
        if(!attrs.gallery) continue
        for(const image of attrs.gallery.images) {
            const src = image.src

            let extension = '.png'
            let extensionI = src.lastIndexOf('.')
            if(extensionI !== -1) {
                extension = src.substring(extensionI)
            }

            const filename = '' + (filenamesEnd++) + extension
            externalSources[src] = filename
            imageSrcs.set(src, filename)
        }
    }

    log.i('Fetching', imageSrcs.size, 'images')
    const promises: Promise<unknown>[] = []
    for(const [src, filename] of imageSrcs) {
        const imgLog = log.withIds('image ' + src)

        promises.push(
            (async() => {
                try { await promises.at(-5) }
                catch(err) {  }

                const resp = await fetch(src)
                if(!resp.ok) {
                    const body = await resp.text().then(
                        it => 'Body:' + it,
                        it => 'Body error:' + it
                    )
                    throw new Error(
                        'Response status: ' + resp.status + '. Body: ' + body
                    )
                }

                await fsp.writeFile(
                    path.join(postDir, filename),
                    Buffer.from(await resp.arrayBuffer())
                )

                imgLog.i('Done')
            })()
                .catch(err => {
                    imgLog.e(err)
                    throw err
                })
        )
    }

    await Promise.all(promises)

    //fs.writeFileSync(path.join(postDir, 'index.html'), jsdom.serialize())
    log.i('Done')
    processedCount++
    break
}

baseLog.i('Done. Downloaded external files for', processedCount, 'posts')
