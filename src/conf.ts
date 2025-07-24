import path from 'node:path'
import config from '../config.ts'

export const root = path.join(import.meta.dirname, '..')
export const data = path.join(root, 'data')

export { config }
