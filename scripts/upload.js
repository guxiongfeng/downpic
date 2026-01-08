import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import axios from 'axios'
import mime from 'mime'
import AdmZip from 'adm-zip'
import pico from 'picocolors'
import figures from 'figures'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAX_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

const log = {
    info: (...msg) => console.log(pico.cyan('➡️'), ...msg),
    warn: (...msg) =>
        console.log(pico.yellow(`${figures.warning} ${msg.join(' ')}`)),
    error: (...msg) =>
        console.log(pico.red(`${figures.cross} ${msg.join(' ')}`))
}

async function main() {
    let root = path.resolve(__dirname, '../comics-zip')

    if (!existsSync(root)) {
        root = path.resolve(__dirname, '../comics')
        if (!existsSync(root)) {
            log.warn('没有发现已下载的漫画')
            return
        }
    }

    // 获取目录下所有项目
    const items = await fs.readdir(root)
    
    // 过滤并处理任务
    for (const item of items) {
        const fullPath = path.join(root, item)
        const stats = await fs.stat(fullPath)

        // 核心修改：只处理文件夹，跳过文件（如 done.txt）
        if (!stats.isDirectory()) {
            continue 
        }

        try {
            log.info(`正在打包并上传: ${item}...`)
            const zip = new AdmZip()
            zip.addLocalFolder(fullPath)
            const zipBuffer = zip.toBuffer()
            const filename = `${item}.zip`

            if (zipBuffer.byteLength < MAX_SIZE) {
                const file = new File([zipBuffer], filename, {
                    type: mime.getType('zip')
                })
                
                const form = new FormData()
                form.append('file', file)

                const { data } = await axios.post(
                    `https://file.io?title=${encodeURIComponent(filename)}`,
                    form
                )

                // 优化点：增加对 data 类型的检查
                // 如果 data.link 是函数，尝试从 data.data.link 获取（某些 axios 版本会包装一层）
                // 或者直接确保取到的是字符串
                const downloadLink = typeof data.link === 'string' ? data.link : (data.data?.link || '获取失败');

                if (data.success || downloadLink !== '获取失败') {
                    console.log(
                        `${pico.cyan(filename)} 已上传。下载地址：${pico.green(downloadLink)}`
                    )
                } else {
                    log.error(`「${filename}」上传虽然成功但未获取到链接`, JSON.stringify(data));
                }

                console.log(
                    `${pico.cyan(filename)} 已上传。下载地址：${pico.green(data.link)}`
                )
            } else {
                log.warn(`${filename} 大小超过了 2GB，跳过上传`)
            }
        } catch (error) {
            log.error(`「${item}」处理失败：`, error.message)
        }
    }
    
    log.info('所有任务处理完毕')
}

main().catch(err => log.error('程序运行崩溃：', err.message))
