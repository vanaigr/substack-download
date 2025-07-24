import { type Log } from './log.ts'

export type Ctx = {
    log: Log
    listNesting: number
    imageUrlToPath: (url: string, log: Log) => string | undefined
}

export function process(
    log: Log,
    document: Document,
    imageUrlToPath: Ctx['imageUrlToPath'],
) {
    return join(
        [...document.body.childNodes].map(it => {
            return processNode(it, {
                log,
                listNesting: 0,
                imageUrlToPath,
            })
        })
    )
}

function processNode(it: ChildNode, ctx: Ctx): string {
    const it2 = it as HTMLElement

    const name = it.nodeName
    const log = ctx.log.withIds(name)

    const c: Ctx = { ...ctx, log }

    if(name === '#text') {
        return (it.textContent ?? '').trim()
    }
    else if(name === 'IFRAME') {
        const src = it2.getAttribute('src')
        if(!src) {
            log.w('No source. Skipping')
            return ''
        }
        return '\n\n[' + src + '](' + src + ')\n\n'
    }
    else if(name === 'P') {
        return join(['\n\n', processChildren(it.childNodes, c), '\n\n'])
    }
    else if(name === 'IMG') {
        const src = it2.getAttribute('src')
        if(!src) {
            log.w('No image src. Skipping')
            return ''
        }
        const path = ctx.imageUrlToPath(src, log)
        if(!path) {
            log.w('Downloaded image not found for url', src, 'Skipping')
            return ''
        }

        return '![](' + path + ')'
    }
    else if(/^H\d$/.test(name)) {
        return '#'.repeat(parseInt(name.substring(1)))
            + ' '
            + it.textContent
            + '\n'
    }
    else if(name === 'FIGCAPTION') {
        return join(['\n', processChildren(it.childNodes, c).trim(), '\n\n'])
    }
    else if(name === 'STRONG') {
        return '**' + processChildren(it.childNodes, c) + '**'
    }
    else if(name === 'EM') {
        return '*' + processChildren(it.childNodes, c) + '*'
    }
    else if(name === 'S') {
        return '---' + processChildren(it.childNodes, c) + '---'
    }
    else if(name === 'PRE') {
        const cn = [...it.childNodes]
        if(cn.length === 1 && cn[0].nodeName === 'CODE') {
            c.log = c.log.withIds(cn[0].nodeName)
            return join([
                '\n```\n',
                processChildren(cn[0].childNodes, c),
                '\n```\n',
            ])
        }
        else {
            log.w('Don\'t know what to do with this')
            return processChildren(it.childNodes, c)
        }
    }
    else if(name === 'CODE') {
        return '`' + processChildren(it.childNodes, c) + '`'
    }
    else if(name === 'OL') {
        return join(['\n\n', processChildrenInList(it.childNodes, c, true), '\n\n'])
    }
    else if(name === 'UL') {
        return join(['\n\n', processChildrenInList(it.childNodes, c, false), '\n\n'])
    }
    else if(name === 'PICTURE') {
        return join(['\n', processChildren(it.childNodes, c), '\n'])
    }
    else if(name === 'FIGURE') {
        return join(['\n', processChildren(it.childNodes, c), '\n'])
    }
    else if(name === 'BLOCKQUOTE') {
        return join([
            '\n\n',
            ...processChildren(it.childNodes, c)
                .trim()
                .split('\n')
                .map(it => '> ' + it + '\n'),
            '\n\n',
        ])
    }
    else if(name === 'HR') {
        return '\n---\n'
    }
    else if(name === 'SOURCE') {
        return ''
    }
    else if(name === 'svg') {
        return ''
    }
    else {
        let result: string | undefined

        if(result == null) result = (() => {
            if(name !== 'A') return
            const classes = [...it2.classList.values()]
            if(classes.includes('image-link')) {
                return processChildren(it.childNodes, c)
            }
            else if(classes.includes('button') && classes.includes('primary')) {
                // Subscribe button
                return ''
            }
            else if(it2.id.startsWith('footnote-anchor-')) {
                let label = it2.id.substring('footnote-anchor-'.length)
                let endI = label.indexOf('-')
                if(endI === -1) endI = label.length
                label = label.substring(0, endI)
                if(!label) {
                    log.w('Empty footnote label for id', it2.id)
                    return ''
                }
                return '[^' + label + ']'
            }
            else if(it2.id.startsWith('footnote-')) {
                let label = it2.id.substring('footnote-'.length)
                let endI = label.indexOf('-')
                if(endI === -1) endI = label.length
                label = label.substring(0, endI)
                if(!label) {
                    log.w('Empty footnote for id', it2.id)
                    return ''
                }
                return '\n[^' + label + ']:'
            }
            else {
                const src = it2.getAttribute('href')
                if(!src) {
                    log.w('No href. Skipping')
                    return ''
                }
                return '[' + (it.textContent ?? '') + '](' + src + ')'
            }
        })()

        if(result == null) result = (() => {
            if(name !== 'DIV') return
            const attrs = JSON.parse(it2.getAttribute('data-attrs')!)
            if(!attrs) return
            if(!attrs.gallery) return

            const res: string[] = []
            for(const image of attrs.gallery.images) {
                const path = ctx.imageUrlToPath(image.src, log)
                if(!path) {
                    log.w('Downloaded image not found for url', image.src, 'Skipping')
                    continue
                }
                res.push('![](' + path + ')\n')
            }
            return join(['\n', ...res, '\n'])
        })()

        if(result == null) result = (() => {
            if(name !== 'DIV') return

            const classes = [...it2.classList.values()]

            if(
                classes.includes('subscription-widget-wrap')
                    || classes.includes('subscription-widget-wrap-editor')
            ) {
                return ''
            }

            if(classes.includes('footnote-content')) {
                return join([processChildren(it.childNodes, c).trim(), '\n'])
            }

            return join(['\n', processChildren(it.childNodes, c), '\n'])
        })()

        if(result == null) result = (() => {
            if(name !== 'FORM') return

            if([...it2.classList.values()].includes('subscription-widget-subscribe')) {
                return ''
            }
        })()

        if(result == null) {
            log.w('Unknown node', name)
            result = (it.textContent ?? '').trim()
        }

        return result
    }
}

function processChildren(children: HTMLElement['childNodes'], ctx: Ctx) {
    return join([...children].map(it => processNode(it, ctx)))
}

function processChildrenInList(
    children: HTMLElement['childNodes'],
    ctx: Ctx,
    numbered: boolean,
) {
    const childCtx: Ctx = { ...ctx, listNesting: ctx.listNesting + 1 }

    let listNumber = 0
    return join([...children].map(it => {
        if(it.nodeName === 'LI') {
            listNumber++

            return ' '.repeat(ctx.listNesting * 4)
                + (numbered ? listNumber + '. ' : '- ')
                + processChildren(
                    it.childNodes,
                    childCtx,
                ).trim()
                + '\n'
        }
        else {
            return processNode(it, childCtx)
        }
    }))
}

export function join(arr: string[]) {
    let result = ''
    for(const it of arr) {
        if(!it) continue

        if(result.length > 0) {
            let match = result.match(/(\n*)$/)
            let beforeNls = 0
            if(match) beforeNls = match[1].length

            match = it.match(/^(\n*)/)
            let afterNls = 0
            if(match) afterNls = match[1].length

            let nls = Math.max(beforeNls, afterNls)
            if(nls === 0) {
                result += ' ' + it
                continue
            }

            result = result.substring(0, result.length - beforeNls)
                + '\n'.repeat(nls)
                + it.substring(afterNls)
            continue
        }
        result += it
    }
    return result
}
