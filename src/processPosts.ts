import jsdomLib from 'jsdom'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import fetch from 'node-fetch'

import * as C from './conf.ts'
import { makeConsoleAndFileLogger, type Log } from './log.ts'

const JSDOM = jsdomLib.JSDOM

const base = path.join(C.data, 'processed')
fs.rmSync(base, { recursive: true, force: true })
fs.mkdirSync(base, { recursive: true })
const baseLog = makeConsoleAndFileLogger(path.join(base, 'log.txt'))

for(const filename of fs.readdirSync(C.config.downloadedPostsPath)) {
    if(!filename.endsWith('.html')) continue
    if(filename !== '2.html') continue

    const log = baseLog.withIds(filename)
    log.i('Processing')

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

        const values = JSON.parse(JSON.parse('"' + match[1] + '"'))
        const html = values.feedData.initialPost.post.body_html

        const postDir = path.join(base, filename.substring(0, filename.length - 5))
        fs.mkdirSync(postDir)

        const jsdom = new JSDOM(html)
        const images = jsdom.window.document.querySelectorAll('img')

        const imageSrcs = new Map<string, string>()
        let filenamesEnd = 1

        for(const it of images) {
            const src = it.getAttribute('src')
            if(src) {
                let extension = '.png'
                let extensionI = src.lastIndexOf('.')
                if(extensionI !== -1) {
                    extension = src.substring(extensionI)
                }
                const filename = '' + (filenamesEnd++) + extension
                imageSrcs.set(src, filename)
                it.setAttribute('src', './' + filename)
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

        fs.writeFileSync(path.join(postDir, 'index.html'), jsdom.serialize())
        log.i('Done')
    }
    break
}
