import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import fs from 'fs'
import os from 'os'
import path from 'path'

ffmpeg.setFfmpegPath(ffmpegStatic)
function detectExtensionFromBuffer(buffer){
  try{
    const head = buffer.slice(0, 64)
    const hexHead = head.toString('hex')
    // GIF
    if (hexHead.startsWith('47494638')) return '.gif'
    // WEBP (RIFF....WEBP)
    if (head.slice(0,4).toString() === 'RIFf'.replace('f','f') && head.slice(8,12).toString() === 'WEBP') return '.webp'
    // MP4/MOV (ftyp present)
    if (head.includes(Buffer.from('ftyp'))) return '.mp4'
  }catch(e){}
  return '.mp4'
}

export async function makeSticker(buffer, author='Satoru', pack='Satoru Pack', opts = {}){
  // If animated requested, try to convert input (gif/mp4) to animated webp via ffmpeg
  if (opts.animated){
    const ext = detectExtensionFromBuffer(buffer)
    const tmpIn = path.join(os.tmpdir(), `in_stk_${Date.now()}${ext}`)
    const tmpOut = path.join(os.tmpdir(), `out_stk_${Date.now()}.webp`)
    let ffmpegStderr = ''
    try{
      fs.writeFileSync(tmpIn, buffer)
      await new Promise((res, rej)=>{
        ffmpeg(tmpIn)
          .duration(6)
          .outputOptions([
            '-vcodec', 'libwebp',
            '-lossless', '0',
            '-qscale', '75',
            '-preset', 'default',
            '-loop', '0',
            '-an',
            '-vsync', '0',
            '-s', '512:512',
            '-r', '15',
            '-t', '6'
          ])
          .toFormat('webp')
          .save(tmpOut)
          .on('stderr', (line)=>{ ffmpegStderr += line + '\n' })
          .on('end', res)
          .on('error', (err)=> rej(new Error(err.message + '\n' + ffmpegStderr)))
      })
      const out = fs.readFileSync(tmpOut)
      return out
    }finally{
      try{ if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn) }catch{}
      try{ if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut) }catch{}
    }
  }
  // fallback to static sticker using wa-sticker-formatter
  const st = new Sticker(buffer, { pack, author, type: StickerTypes.FULL, quality: 75 })
  return await st.toBuffer()
}
