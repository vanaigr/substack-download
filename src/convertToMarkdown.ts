import jsdomLib from 'jsdom'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import sharp from 'sharp'
import { Temporal as T } from 'temporal-polyfill'

import * as C from './conf.ts'
import * as U from './util.ts'
import { makeConsoleAndFileLogger } from './log.ts'
import { process, join } from './toMd.ts'

const JSDOM = jsdomLib.JSDOM

const base = path.join(C.data, 'md')
fs.rmSync(base, { recursive: true, force: true })
fs.mkdirSync(base, { recursive: true })
const baseLog = makeConsoleAndFileLogger(path.join(base, 'log.txt'))

const rawPostsDir = path.join(C.data, 'rawPosts')
const externalDir = path.join(C.data, 'externalFiles')
const audioDir = path.join(C.data, 'audio')

const assetsBase = path.join(base, 'assets')
let assetsBaseRelative: string

let audioRelativeBase: string

type AssetsIndex = {
    videoPaths: Record<string, string>
    podcastPaths: Record<string, string>
    imagePaths: Record<string, string>
    audioPaths: Record<string, string>
}

let assetsIndex: AssetsIndex = {
    videoPaths: {},
    podcastPaths: {},
    imagePaths: {},
    audioPaths: {},
}

let copyFiles = false
if(!copyFiles) {
    assetsBaseRelative = path.join('..', 'externalFiles')

    baseLog.w('Using ../externalFiles/ as asset directory to not copy files')

    try {
        const index = JSON.parse(fs.readFileSync(path.join(externalDir, 'index.json')).toString())
        assetsIndex.videoPaths = index.videoPaths ?? assetsIndex.videoPaths
        assetsIndex.podcastPaths = index.podcastPaths ?? assetsIndex.podcastPaths
        assetsIndex.imagePaths = index.imagePaths ?? assetsIndex.imagePaths
        assetsIndex.audioPaths = index.audioPaths ?? assetsIndex.audioPaths
    }
    catch(err) {
        baseLog.e('While creating asset index', err)
    }
}
else {
    assetsBaseRelative = './assets'
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

        for(const url in rawAssetIndex.podcastPaths) {
            let filename = rawAssetIndex.podcastPaths[url]
            const srcPath = path.join(externalDir, filename)

            const log = baseLog.withIds('podcast ' + filename)
            const p = (async() => {
                try { await promises.at(-20) }
                catch(_) {}

                await fsp.copyFile(srcPath, path.join(assetsBase, filename))

                assetsIndex.podcastPaths[url] = filename
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

        await Promise.allSettled(promises)
    }
    catch(err) {
        baseLog.e('While copying assets', err)
    }
}

if(!copyFiles) {
    audioRelativeBase = path.join('..', 'audio')
}
else {
    audioRelativeBase = './audio'
    try {
        const dstAudio = path.join(base, audioRelativeBase)
        // Operation not permitted
        // fs.cpSync(audioDir, dstAudio, { recursive: true })
        fs.mkdirSync(dstAudio)
        let promises: Promise<unknown>[] = []
        for(const it of fs.readdirSync(audioDir)) {
            const log = baseLog.withIds('audio ' + it)
            const p = (async() => {
                try { await promises.at(-5) }
                catch(_) {}

                // Not permitted, again.
                //await fsp.copyFile(path.join(audioDir, it), path.join(dstAudio, it))

                const content = await fsp.readFile(path.join(audioDir, it))
                await fsp.writeFile(path.join(dstAudio, it), content)
            })().catch(err => {
                log.e(err)
                throw err
            })
            promises.push(p)
        }
        await Promise.allSettled(promises)
    }
    catch(err) {
        baseLog.w('Could not copy audio. Not including it', err)
    }
}

try {
    const audioConfig = fs.readFileSync(path.join(audioDir, 'index.json')).toString()
    assetsIndex.audioPaths = JSON.parse(audioConfig)
}
catch(err) {
    baseLog.w('Could not read audio index', err)
}

const existingPosts = new Set(
    fs.readdirSync(rawPostsDir)
        .filter(it => it.endsWith('.html'))
        .map(it => parseInt(it.substring(0, it.length - 5)))
)

const postList = JSON.parse(fs.readFileSync(path.join(C.data, 'postList', 'posts.json')).toString())

const nameCounts = new Map<string, number>()
nameCounts.set('index', 1)
for(const post of postList) {
    const title = post.slug
    let count = nameCounts.get(title) ?? 0
    nameCounts.set(title, count + 1)
}

const idToName: Record<string, string> = {}
for(const post of postList) {
    let title = post.slug
    if(nameCounts.get(title)! > 1) {
        title = title + '-' + post.id
    }
    idToName[post.id] = title
}

for(const post of postList) {
    if(!existingPosts.has(post.id)) continue

    const name = idToName[post.id]

    const log = baseLog.withIds('post ' + post.id)
    try {
        log.i('Processing')

        const values = U.extractValues(
            fs.readFileSync(path.join(rawPostsDir, post.id + '.html')).toString(),
            log,
        )
        if(!values) {
            log.w('Could not find post html. Skipping')
            continue
        }

        const { html, videoUpload, podcastUpload } = U.getPostData(values)
        if(!html) {
            log.e('Could not find body_html of the post. Skipping')
            continue
        }

        const jsdom = new JSDOM(html)
        fs.writeFileSync('a.html', html)

        const content: string[] = []
        content.push('# ' + post.title + '\n\n')
        content.push(post.subtitle + '\n\n')
        content.push('\n\[Original](' + post.canonical_url + ')\n\n')

        if(videoUpload) {
            const filename = assetsIndex.videoPaths[videoUpload.id]
            if(!filename) {
                log.w('Missing video', videoUpload.id)
            }
            else {
                content.push(
                    '![]('
                        + path.join(assetsBaseRelative, encodeURIComponent(filename))
                        + ')\n'
                )
            }
        }

        const audioFilename = assetsIndex.audioPaths[name]
        if(audioFilename) {
            content.push(
                '![]('
                    + path.join(audioRelativeBase, encodeURIComponent(audioFilename))
                    + ')\n'
            )
        }

        if(podcastUpload) {
            const filename = assetsIndex.podcastPaths[podcastUpload.id]
            if(!filename) {
                log.w('Missing podcast', podcastUpload.id)
            }
            else {
                content.push(
                    '![]('
                        + path.join(assetsBaseRelative, encodeURIComponent(filename))
                        + ')\n'
                )
            }
        }

        content.push(
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
        )

        let result = join(content).trim()
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
