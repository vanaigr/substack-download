import jsdomLib from 'jsdom'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'

import * as C from './conf.ts'
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
    fs.cpSync(externalDir, assetsBase, { recursive: true })
    assetsIndex = JSON.parse(fs.readFileSync(path.join(assetsBase, 'index.json')).toString())
}
catch(err) {
    baseLog.e('While copying assets', err)
}

const postList = JSON.parse(fs.readFileSync(path.join(C.data, 'postList', 'posts.json')).toString())

const idToName: Record<string, string> = {}
for(const post of postList) {
    idToName[post.id] = post.title + '-' + post.id
}

for(const post of postList) {
    const log = baseLog.withIds(post.id)
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

        const html = values.feedData.initialPost.post.body_html
        const jsdom = new JSDOM(html)

        let result = join([
            '# ' + post.title + '\n',
            '## ' + post.subtitle + '\n',
            process(log, jsdom.window.document, (url, log) => {
                log = log.withIds('image url ' + url)
                try {
                    const filename = assetsIndex.imagePaths[url]
                    if(!filename) return
                    return path.join(assetsBaseRelative, filename)
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
