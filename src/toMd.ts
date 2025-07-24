import { type Log } from './log.ts'

export type Ctx = {
    log: Log
    listNesting: number
}

export function process(log: Log, document: Document) {
    return [...document.body.childNodes].map(it => {
        return processNode(it, {
            log,
            listNesting: 0,
        })
    }).join('')
}

function processNode(it: ChildNode, ctx: Ctx): string {
    const name = it.nodeName
    const log = ctx.log.withIds(name)

    const c: Ctx = { ...ctx, log }

    if(name === '#text') {
        return (it.textContent ?? '').trim()
    }
    else if(name === 'P') {
        return '\n' + processChildren(it.childNodes, c) + '\n'
    }
    else if(/^H\d$/.test(name)) {
        return '#'.repeat(parseInt(name.substring(1)))
            + ' '
            + processChildren(it.childNodes, c)
            + '\n\n'
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
            return '\n```\n' + processChildren(cn[0].childNodes, c) + '\n```\n'
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
        return '\n' + processChildrenInList(it.childNodes, c, true) + '\n'
    }
    else if(name === 'UL') {
        return '\n' + processChildrenInList(it.childNodes, c, false) + '\n'
    }
    else {
        log.w('Unknown node', name)
        return (it.textContent ?? '').trim()
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

function join(arr: string[]) {
    let result = ''
    for(const it of arr) {
        if(result.length > 0) {
            if(!result.endsWith('\n') && !it.startsWith('\n')) {
                result += ' '
            }
        }
        result += it
    }
    return result
}
