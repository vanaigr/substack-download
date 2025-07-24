import jsdomLib from 'jsdom'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import sharp from 'sharp'
import { Temporal as T } from 'temporal-polyfill'

import * as C from './conf.ts'
import * as U from './util.ts'
import { makeConsoleAndFileLogger, type Log } from './log.ts'
import { process, join } from './toMd.ts'

const JSDOM = jsdomLib.JSDOM

const base = path.join(C.data, 'md')
fs.rmSync(base, { recursive: true, force: true })
fs.mkdirSync(base, { recursive: true })
const baseLog = makeConsoleAndFileLogger(path.join(base, 'log.txt'))

const rawPostsDir = path.join(C.data, 'rawPosts')
const externalDir = path.join(C.data, 'externalFiles')

const assetsBaseRelative = 'assets'
const assetsBase = path.join(base, assetsBaseRelative)

type AssetsIndex = {
    videoPaths: Record<string, string>
    imagePaths: Record<string, string>
}

let assetsIndex: AssetsIndex = {
    videoPaths: {},
    imagePaths: {},
}

baseLog.i('Copying assets')
try {
    const rawAssetIndex = JSON.parse(fs.readFileSync(path.join(externalDir, 'index.json')).toString()) as AssetsIndex
    fs.mkdirSync(assetsBase)

    const promises: Promise<unknown>[] = []

    for(const url in rawAssetIndex.imagePaths) {
        let filename = rawAssetIndex.imagePaths[url]
        const srcPath = path.join(externalDir, filename)

        const log = baseLog.withIds('image ' + filename)
        const p = (async() => {
            try { await promises.at(-20) }
            catch(_) {}

            if(filename.endsWith('.webp')) {
                filename = filename.substring(0, filename.length - 5) + '.png'

                await sharp(srcPath)
                    .png()
                    .toFile(path.join(assetsBase, filename))
            }
            else {
                await fsp.copyFile(srcPath, path.join(assetsBase, filename))
            }

            assetsIndex.imagePaths[url] = filename
        })().catch(err => {
            log.e(err)
            throw err
        })

        promises.push(p)
    }

    for(const url in rawAssetIndex.videoPaths) {
        let filename = rawAssetIndex.videoPaths[url]
        const srcPath = path.join(externalDir, filename)

        const log = baseLog.withIds('video ' + filename)
        const p = (async() => {
            try { await promises.at(-20) }
            catch(_) {}
            await fsp.copyFile(srcPath, path.join(assetsBase, filename))
            assetsIndex.videoPaths[url] = filename
        })().catch(err => {
            log.e(err)
            throw err
        })

        promises.push(p)
    }

    await Promise.all(promises)
}
catch(err) {
    baseLog.e('While copying assets', err)
}

const existingPosts = new Set(
    fs.readdirSync(rawPostsDir)
        .filter(it => it.endsWith('.html'))
        .map(it => parseInt(it.substring(0, it.length - 5)))
)

const postList = JSON.parse(fs.readFileSync(path.join(C.data, 'postList', 'posts.json')).toString())

const nameCounts = new Map<string, number>()
for(const post of postList) {
    let count = nameCounts.get(post.title) ?? 0
    nameCounts.set(post.title, count + 1)
}

const idToName: Record<string, string> = {}
for(const post of postList) {
    let name = post.title
    if(nameCounts.get(name)! > 1) {
        name = name + '-' + post.id
    }
    idToName[post.id] = name
}

for(const post of postList) {
    if(!existingPosts.has(post.id)) continue

    const log = baseLog.withIds('post ' + post.id)
    try {
        log.i('Processing')

        let values: any
        {
            const rawPostPath = path.join(rawPostsDir, post.id + '.html')

            const jsdom = new JSDOM(fs.readFileSync(rawPostPath).toString())
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

        const { html, videoUpload } = U.getPostData(values)
        if(!html) {
            log.e('Could not find body_html of the post. Skipping')
            continue
        }

        const jsdom = new JSDOM(html)
        fs.writeFileSync('a.html', html)

        let video = ''
        if(videoUpload) {
            const filename = assetsIndex.videoPaths[videoUpload.id]
            if(!filename) {
                log.w('Missing video', videoUpload.id)
            }
            else {
                video = '![]('
                    + path.join(assetsBaseRelative, encodeURIComponent(filename))
                    + ')\n'
            }
        }

        let result = join([
            post.subtitle + '\n\n',
            '\n\[Original](' + post.canonical_url + ')\n\n',
            video,
            process(log, jsdom.window.document, (url, log) => {
                log = log.withIds('image url ' + url)
                try {
                    const filename = assetsIndex.imagePaths[url]
                    if(!filename) {
                        log.w('Missing')
                        return
                    }
                    return path.join(assetsBaseRelative, encodeURIComponent(filename))
                }
                catch(err) {
                    log.e(err)
                }
            })
        ]).trim()

        const name = idToName[post.id]
        fs.writeFileSync(path.join(base, name + '.md'), result)
    }
    catch(err) {
        log.e(err)
    }
}

try {
    let content = ''
    for(const post of postList) {
        if(!existingPosts.has(post.id)) continue

        const date = T.Instant.from(post.post_date).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
        })
        content += '['
            + post.title
            + ' ('
            + date
            + ')](./'
            + encodeURIComponent(idToName[post.id])
            + '.md)\n\n'
    }

    fs.writeFileSync(path.join(base, 'index.md'), content)
}
catch(err) {
    baseLog.e('While creating index file', err)
}
