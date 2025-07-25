import jsdomLib from 'jsdom'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import fetch from 'node-fetch'

import * as C from './conf.ts'
import * as U from './util.ts'
import { makeConsoleAndFileLogger, type Log } from './log.ts'

const JSDOM = jsdomLib.JSDOM

const base = path.join(C.data, 'externalFiles')
fs.mkdirSync(base, { recursive: true })
const baseLog = makeConsoleAndFileLogger(path.join(base, 'log.txt'))

const cookies = U.makeCookie(baseLog)

type Index = {
    videoPaths: Record<string, string>
    imagePaths: Record<string, string>
    filePathEnd: number
}

const fileIndexPath = path.join(base, 'index.json')

let fileIndex = ((): Index | undefined => {
    let fileIndexBuf: Buffer | undefined
    try {
        fileIndexBuf = fs.readFileSync(fileIndexPath)
    }
    catch(_) {
        return
    }

    try {
        const fileIndexStr = fileIndexBuf.toString()
        if(fileIndexStr === '') {
            throw new Error('File is empty')
        }
        return JSON.parse(fileIndexStr) as Index
    }
    catch(err) {
        baseLog.e('While reading current file index', err, 'Starting from scratch')
    }
})()
if(fileIndex == null) {
    fileIndex = {
        videoPaths: {},
        imagePaths: {},
        filePathEnd: 1,
    }
}

function writeIndex() {
    fs.writeFileSync(fileIndexPath, JSON.stringify(fileIndex))
}

const postsDir = path.join(C.data, 'rawPosts')

let processedCount = 0
let downloaded = 0
let errors = 0

const filenames = fs.readdirSync(postsDir)
for(let i = 0; i < filenames.length; i++) {
    const filename = filenames[i]
    if(!filename.endsWith('.html')) continue

    const log = baseLog.withIds(filename)
    log.i('Processing', 1 + i, 'of', filenames.length)

    let values: any
    {
        const jsdom = new JSDOM(fs.readFileSync(
            path.join(postsDir, filename)
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
            break
        }
    }
    if(!values) {
        log.w('Could not find post html. Skipping')
        continue
    }
    //fs.writeFileSync(C.root + '/file.json', JSON.stringify(values, null, 2))

    const { html, videoUpload } = U.getPostData(values)

    if(!html) {
        log.e('Could not find body_html of the post. Skipping')
        continue
    }

    const jsdom = new JSDOM(html)

    const images = jsdom.window.document.querySelectorAll('img')

    const imageSrcs = new Map<string, { ext: string }>()
    for(const it of images) {
        const src = it.getAttribute('src')
        if(src) {
            let extension = '.png'
            let extensionI = src.lastIndexOf('.')
            if(extensionI !== -1) {
                extension = src.substring(extensionI)
            }
            imageSrcs.set(src, { ext: extension })
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

            imageSrcs.set(src, { ext: extension })
        }
    }

    log.i('Fetching', imageSrcs.size, 'images')
    const promises: Promise<unknown>[] = []
    if(videoUpload) {
        const videoLog = log.withIds('video')

        const p = (async() => {
            videoLog.i('Found video upload')
            if(fileIndex.videoPaths[videoUpload.id]) {
                videoLog.i('Already exists. Skipping')
                return
            }

            try { await promises.at(-5) }
            catch(err) {}

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

            const filename = '' + fileIndex.filePathEnd + '.mp4'
            fileIndex.filePathEnd++
            writeIndex()

            const fileStream = fs.createWriteStream(
                path.join(base, filename),
                { flags: 'wx' },
            )
            await new Promise((s, j) => {
                resp.body!.pipe(fileStream)
                fileStream.on('finish', () => s(undefined))
                resp.body!.on('error', j)
            })

            fileIndex.videoPaths[videoUpload.id] = filename
            writeIndex()
            downloaded++

            videoLog.i('Done')
        })().catch(err => {
            videoLog.e(err)
            errors++
            throw err
        })

        promises.push(p)
    }

    for(const [src, srcProps] of imageSrcs) {
        const imgLog = log.withIds('image ' + src)

        const p = (async() => {
            if(fileIndex.imagePaths[src]) {
                imgLog.i('Already exists. Skipping')
                return
            }

            try { await promises.at(-5) }
            catch(err) {}

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

            const filename = '' + fileIndex.filePathEnd + srcProps.ext
            fileIndex.filePathEnd++
            writeIndex()

            const fileStream = fs.createWriteStream(
                path.join(base, filename),
                { flags: 'wx' },
            )
            await new Promise((s, j) => {
                resp.body!.pipe(fileStream)
                fileStream.on('finish', () => s(undefined))
                resp.body!.on('error', j)
            })

            fileIndex.imagePaths[src] = filename
            writeIndex()
            downloaded++

            imgLog.i('Done')
        })().catch(err => {
            imgLog.e(err)
            errors++
            throw err
        })

        promises.push(p)
    }

    await Promise.all(promises)

    log.i('Done')
    processedCount++
}

baseLog.i('Done. Downloaded external files for', processedCount, 'posts')
baseLog.i(
    'Total videos:',
    Object.keys(fileIndex.videoPaths).length,
    'Total images:',
    Object.keys(fileIndex.imagePaths).length,
)
baseLog.i('Files downloaded:', downloaded, 'Errors:', errors)
