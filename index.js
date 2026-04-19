import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } from  '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import ytdl from 'ytdl-core'

// ⚠️ Adicionando 'default as db_mod' para fácil acesso ao objeto de banco de dados
import { initDB, getUser, setUser, saveDB, getTopBy, getGroupCustom, addGroupCustom, removeGroupCustom, listGroupCustom, getGroupSettings, updateGroupSettings, default as db_mod } from './db.js'
import { makeSticker } from './sticker.js'
import { PROFESSIONS, STORE, PLANTS } from './config.js'
import { handleForca } from './games/forca.js'
import { handleRps } from './games/rps.js'
ffmpeg.setFfmpegPath(ffmpegStatic)

const logger = pino({ level: 'silent' }) // Silencia logs da Baileys
let sock = null
const AUTH_DIR = process.env.AUTH_DIR || './auth'
const DOWNLOAD_CONFIG_FILE = process.env.DOWNLOAD_CONFIG_FILE || './download.config.json'

async function initializeBot() {
  let qrGenerated = false
  let pairingCodeShown = false
  const pairingNumber = (process.env.PAIRING_NUMBER || '').replace(/\D/g, '')

  try {
    await initDB()
    fs.mkdirSync(AUTH_DIR, { recursive: true })
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
    const { version } = await fetchLatestBaileysVersion()
    
    sock = makeWASocket({ 
      version, 
      auth: state, 
      logger,
      shouldSyncHistoryMessage: () => false,
      syncFullHistory: false,
      logoutOnDisconnect: false,
      qrTimeout: 0 // Não expira o QR
    })
    
    sock.ev.on('creds.update', saveCreds)

    if (pairingNumber){
      setTimeout(async () => {
        try {
          const registered = sock?.authState?.creds?.registered
          if (!registered && !pairingCodeShown){
            const code = await sock.requestPairingCode(pairingNumber)
            pairingCodeShown = true
            console.log(`\n🔐 CÓDIGO DE PAREAMENTO: ${code}\n`)
            console.log('No WhatsApp: Dispositivos conectados > Conectar com número')
          }
        } catch (err) {
          console.log(`⚠️ Falha ao gerar código de pareamento: ${err?.message || err}`)
        }
      }, 2500)
    }
    
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update
      
      // Gera QR apenas se ainda não foi gerado
      if (qr && !qrGenerated) {
        qrGenerated = true
        console.log('\n╔═════════════════════════════════╗')
        console.log('║ 📱 ESCANEIE O QR NO WHATSAPP 📱║')
        console.log('╚═════════════════════════════════╝\n')
        qrcode.generate(qr, { small: true })
        console.log('⏳ Aguardando scan...\n')
      }
      
      // Quando conectar com sucesso, para de gerar QR
      if (connection === 'open') {
        console.log('\n✅ BOT CONECTADO COM SUCESSO!\n')
        ACTIVE_OWNER_NUMBER = jidDigits(sock?.user?.id || '')
        qrGenerated = true // Marca como "feito" para não gerar mais até desconectar
      }
      
      // Se desconectar, reseta para gerar novo QR na próxima tentativa
      if (connection === 'close') {
        qrGenerated = false // Reseta para poder gerar novo QR
        const reasonCode = lastDisconnect?.error?.output?.statusCode
        const reasonMsg = lastDisconnect?.error?.message || String(lastDisconnect?.error || 'sem detalhes')
        console.log(`⚠️ Conexão fechada. code=${reasonCode || 'n/a'} motivo=${reasonMsg}`)
        
        if (lastDisconnect?.error?.message?.includes('conflict')) {
          console.log('⚠️  Conflito: Você está conectado em outro lugar.')
          return
        }
        process.exit(1) // Força o launcher a reconectar
      }
    })

    sock.ev.on('messages.upsert', handleMessages)
    sock.ev.on('group-participants.update', handleGroupParticipants)
    
  } catch (error) {
    console.error('❌ Erro:', error.message)
    process.exit(1)
  }
}

await initializeBot()

function handleGroupParticipants(update) {
  return (async () => {
    const chatId = update.id
    const settings = await getGroupSettings(chatId)
    for (const participant of update.participants){
      const nick = jidToNumber(participant)
      if (update.action === 'add'){
        const text = settings.welcomeMessage || `Bem-vindo ${nick}! Aproveite o grupo.`
        if (settings.welcomeImage){
          const img = Buffer.from(settings.welcomeImage, 'base64')
          await sock.sendMessage(chatId, { image: img, caption: text })
        } else {
          await sock.sendMessage(chatId, { text })
        }
      }
      if (update.action === 'remove'){
        const text = settings.byeMessage || `Tchau ${nick}! Sentiremos sua falta.`
        if (settings.byeImage){
          const img = Buffer.from(settings.byeImage, 'base64')
          await sock.sendMessage(chatId, { image: img, caption: text })
        } else {
          await sock.sendMessage(chatId, { text })
        }
      }
    }
  })()
}

function handleMessages(data) {
  // Handler é registrado abaixo como sock.ev.on('messages.upsert', ...) no Main
}

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)] }
function toNumberJid(num){ return num.includes('@') ? num : `${num}@s.whatsapp.net` }
function resolveSenderJid(msg){
  // Em multi-dispositivo, mensagens enviadas pelo próprio dono podem chegar com formatos diferentes.
  if (msg?.key?.fromMe && sock?.user?.id) return sock.user.id
  return msg?.key?.participant || msg?.participant || msg?.key?.remoteJid || ''
}
function jidToNumber(jid){
  const base = String(jid || '')
    .replace(/:\d+@/, '@')
    .replace(/@.+$/, '')
  return base
}
function lvlForXP(xp){ return Math.floor(xp / 100) + 1 }
function fmtDate(ts){ const d=new Date(ts); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` }
function timeSince(ts){ const s=Math.floor((Date.now()-ts)/1000); const u=[[31536000,'ano'],[2592000,'mês'],[604800,'semana'],[86400,'dia'],[3600,'h'],[60,'min'],[1,'s']]; for(const [x,n] of u){ if(s>=x){const v=Math.floor(s/x); return `${v} ${n}${v>1&&n!=='h'?'s':''}`}} return 'agora' }
async function fetchBuffer(url){ const r=await fetch(url); const a=new Uint8Array(await r.arrayBuffer()); return Buffer.from(a) }

async function downloadMediaBuffer(messageLike){
  if (typeof sock?.downloadMediaMessage === 'function'){
    return await sock.downloadMediaMessage(messageLike, 'buffer')
  }

  const msg = messageLike?.message || {}
  const mediaMap = [
    ['image', msg.imageMessage],
    ['video', msg.videoMessage],
    ['audio', msg.audioMessage],
    ['sticker', msg.stickerMessage],
    ['document', msg.documentMessage]
  ]
  const entry = mediaMap.find(([, value]) => !!value)
  if (!entry) throw new Error('Mídia não encontrada na mensagem')

  const [mediaType, mediaPayload] = entry
  const stream = await downloadContentFromMessage(mediaPayload, mediaType)
  let buffer = Buffer.from([])
  for await (const chunk of stream){
    buffer = Buffer.concat([buffer, chunk])
  }
  return buffer
}

function isNewbie(user){ if (!user) return true; return !user.createdAt || (Date.now() - user.createdAt) < 7*24*60*60*1000 || (user.xp||0) < 50 }
function formatMaterials(mat){ return Object.entries(mat||{}).map(([k,v])=>`${k}: ${v}`).join(' | ') || 'Nenhum' }
function normalizeJobName(text){ return (text||'').toString().trim().toLowerCase().replace(/[^a-z0-9áéíóúâêîôûãõç]+/g,'') }
function getProfession(user){ return PROFESSIONS.find(p => normalizeJobName(p.name) === normalizeJobName(user.job) || p.id === normalizeJobName(user.job)) }
function findProfession(query){ const q = normalizeJobName(query); return PROFESSIONS.find(p => p.id === q || normalizeJobName(p.name) === q || normalizeJobName(p.id) === q) }
function getClassBonus(user){ const cls = CLASSES.find(c => c.id === (user.classe||'').toString()) || { powerBonus:0, defenseBonus:0, precisionBonus:0, luckBonus:0, resistanceBonus:0, escapeBonus:0 }; return cls }
function calcPower(user){ const base = (user.items||[]).reduce((sum,i)=>sum + (i.power||0),0) + 5; const prof = getProfession(user); const cls = getClassBonus(user); return Math.floor(base + (prof?.powerBoost||0) + base * cls.powerBonus) }
function calcDefense(user){ const base = (user.items||[]).reduce((sum,i)=>sum + (i.defense||0),0) + 3; const prof = getProfession(user); const cls = getClassBonus(user); return Math.floor(base + (prof?.defenseBoost||0) + base * cls.defenseBonus) }
function calcPrecision(user){ const cls = getClassBonus(user); const item = (user.items||[]).reduce((sum,i)=>sum+(i.precisionBoost||0),0); return cls.precisionBonus + item }
function calcLuck(user){ const cls = getClassBonus(user); const item = (user.items||[]).reduce((sum,i)=>sum+(i.luckBoost||0),0); return cls.luckBonus + item }
function calcResistance(user){ const cls = getClassBonus(user); const item = (user.items||[]).reduce((sum,i)=>sum+(i.resistanceBoost||0),0); return cls.resistanceBonus + item }
function calcEscape(user){ const cls = getClassBonus(user); const item = (user.items||[]).reduce((sum,i)=>sum+(i.escapeBoost||0),0); return cls.escapeBonus + item }
function getSalary(user){ const prof = getProfession(user); return prof ? prof.salary : 100 }
const CLASSES = [
  { id:'guerreiro', name:'Guerreiro(a)', bonus:'+20% em Força', description:'Esmague seus inimigos com poder bruto.', powerBonus:0.20, defenseBonus:0, precisionBonus:0, luckBonus:0, resistanceBonus:0, escapeBonus:0 },
  { id:'guardiao', name:'Guardião(a)', bonus:'+25% em Defesa', description:'Nada atravessa sua guarda absoluta.', powerBonus:0, defenseBonus:0.25, precisionBonus:0, luckBonus:0, resistanceBonus:0, escapeBonus:0 },
  { id:'ladrao', name:'Ladrão(a)', bonus:'+20% em Agilidade', description:'Seja mais rápido que os olhos deles.', powerBonus:0, defenseBonus:0, precisionBonus:0.20, luckBonus:0, resistanceBonus:0, escapeBonus:0 },
  { id:'arqueiro', name:'Arqueiro(a)', bonus:'+15% em Precisão', description:'Acerte o alvo antes dele te ver.', powerBonus:0, defenseBonus:0, precisionBonus:0.15, luckBonus:0, resistanceBonus:0, escapeBonus:0 },
  { id:'apostador', name:'Apostador(a)', bonus:'+30% em Sorte', description:'O caos está ao seu lado. Jogue os dados.', powerBonus:0, defenseBonus:0, precisionBonus:0, luckBonus:0.30, resistanceBonus:0, escapeBonus:0 },
  { id:'lutador', name:'Lutador(a)', bonus:'+15% em Resistência', description:'Aguente o castigo e continue de pé.', powerBonus:0, defenseBonus:0, precisionBonus:0, luckBonus:0, resistanceBonus:0.15, escapeBonus:0 },
  { id:'ninja', name:'Ninja', bonus:'+20% em Velocidade de Escape', description:'Fuja do perigo como se fosse fumaça.', powerBonus:0, defenseBonus:0, precisionBonus:0, luckBonus:0, resistanceBonus:0, escapeBonus:0.20 }
]
function findClass(query){ const q = normalizeJobName(query); return CLASSES.find(c => c.id === q || normalizeJobName(c.name) === q) }
function formatProfessionList(){ return PROFESSIONS.map(p=>`• ${p.name} — ${p.description} (salário ${p.salary})`).join('\n') }
function parseCommandText(text){ const trimmed = text.trim(); const prefix = trimmed[0]; if (prefix !== '.' && prefix !== '!') return null; return trimmed.slice(1).trim().split(/\s+/) }

const BOT_PLAN_MONTHLY_PRICE = 15
const BOT_OWNER_NUMBER = (process.env.BOT_OWNER_NUMBER || '5581986010094').replace(/\D/g,'')
const BOT_OWNER_LID = (process.env.BOT_OWNER_LID || '259184213934087').replace(/\D/g,'')
const BOT_LICENSE_CONTACT = (process.env.BOT_LICENSE_CONTACT || BOT_OWNER_NUMBER).replace(/\D/g,'')
const BOT_LICENSE_CONTACT_LINK = BOT_LICENSE_CONTACT ? `https://wa.me/${BOT_LICENSE_CONTACT}` : ''
let ACTIVE_OWNER_NUMBER = ''
const OWNER_NUMBER_ALIASES = [
  BOT_OWNER_NUMBER,
  BOT_OWNER_NUMBER.replace(/^55/, ''),
  BOT_OWNER_LID,
  '5581986010094',
  '81986010094'
]
function jidDigits(jid){ return jidToNumber(jid).replace(/\D/g,'') }
function sameNumber(a, b){
  const da = String(a || '').replace(/\D/g, '')
  const db = String(b || '').replace(/\D/g, '')
  if (!da || !db) return false
  return da === db || da.endsWith(db) || db.endsWith(da)
}
function getQuotedImageMessage(msg){
  const ctx = msg?.message?.extendedTextMessage?.contextInfo
  const quoted = ctx?.quotedMessage || {}
  return quoted.imageMessage
    || quoted.ephemeralMessage?.message?.imageMessage
    || quoted.viewOnceMessage?.message?.imageMessage
    || quoted.viewOnceMessageV2?.message?.imageMessage
    || null
}
function getDirectImageMessage(msg){
  const message = msg?.message || {}
  return message.imageMessage
    || message.ephemeralMessage?.message?.imageMessage
    || message.viewOnceMessage?.message?.imageMessage
    || message.viewOnceMessageV2?.message?.imageMessage
    || null
}
function normalizeTargetNumber(raw){
  let n = String(raw || '').replace(/\D/g, '')
  if (!n) return ''
  n = n.replace(/^0+/, '')
  if (n.length === 10 || n.length === 11) n = `55${n}`
  return n
}
function parseLicenseIssueArgs(args){
  const nums = (args || []).map(x => String(x || '').replace(/\D/g, '')).filter(Boolean)
  if (!nums.length) return { number:'', months:1 }

  // Formato clássico: .gerarchave <numero> [meses]
  if (nums[0].length >= 10){
    return {
      number: normalizeTargetNumber(nums[0]),
      months: Math.max(1, parseInt(nums[1] || '1', 10) || 1)
    }
  }

  // Formato com número quebrado em partes: .gerarchave 81 98601 0094 [meses]
  let months = 1
  let numberParts = nums
  if (nums.length >= 2){
    const maybeMonths = parseInt(nums[nums.length - 1], 10)
    const candidateNumber = nums.slice(0, -1).join('')
    if (Number.isFinite(maybeMonths) && maybeMonths >= 1 && maybeMonths <= 36 && candidateNumber.length >= 8){
      months = maybeMonths
      numberParts = nums.slice(0, -1)
    }
  }
  return {
    number: normalizeTargetNumber(numberParts.join('')),
    months
  }
}
function isBotOwner(jid){
  const digits = jidDigits(jid)
  if (sameNumber(digits, ACTIVE_OWNER_NUMBER)) return true
  for (const owner of OWNER_NUMBER_ALIASES){
    if (sameNumber(digits, owner)) return true
  }
  return false
}
function isOwnerContext(senderJid, chatId, msg){
  const candidates = [
    senderJid,
    chatId,
    msg?.key?.participant,
    msg?.participant,
    msg?.key?.remoteJid,
    sock?.user?.id
  ]
  if (candidates.some(candidate => isBotOwner(candidate))) return true
  if (msg?.key?.fromMe && isBotOwner(sock?.user?.id || '')) return true
  return false
}
function generateAccessKey(){ return `SB-${randomBytes(3).toString('hex').toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}` }
async function ensureBotLicenseStore(){
  await db_mod.read()
  db_mod.data.botLicense ||= { keys:{}, users:{} }
  return db_mod.data.botLicense
}
async function getBotLicenseStatus(userJid, aliases=[]){
  const store = await ensureBotLicenseStore()
  const direct = store.users[userJid]
  if (direct){
    const active = (direct.expiresAt||0) > Date.now()
    return { active, expiresAt: direct.expiresAt || null, key: direct.key || null }
  }

  const candidates = [userJid, ...aliases].map(jidDigits).filter(Boolean)
  for (const [jid, rec] of Object.entries(store.users || {})){
    if (candidates.some(c => sameNumber(c, jidDigits(jid)))){
      const active = (rec.expiresAt||0) > Date.now()
      return { active, expiresAt: rec.expiresAt || null, key: rec.key || null }
    }
  }
  return { active:false, expiresAt:null, key:null }
}
async function getGroupSponsorLicenseStatus(chatId){
  if (!String(chatId||'').endsWith('@g.us')) return { active:false }
  try {
    const meta = await sock.groupMetadata(chatId)
    const admins = (meta.participants || []).filter(p => p.admin).map(p => p.id)
    for (const adminJid of admins){
      const st = await getBotLicenseStatus(adminJid)
      if (st.active) return { active:true, adminJid, expiresAt: st.expiresAt }
    }
    return { active:false }
  } catch {
    return { active:false }
  }
}
async function createBotAccessKey(ownerJid, targetJid, months=1){
  const store = await ensureBotLicenseStore()
  const m = Math.max(1, Number(months)||1)
  const key = generateAccessKey()
  const now = Date.now()
  const current = store.users[targetJid]
  const base = (current?.expiresAt || 0) > now ? current.expiresAt : now
  const expiresAt = base + m * 30 * 24 * 60 * 60 * 1000

  store.keys[key] = {
    targetJid,
    months: m,
    createdAt: now,
    createdBy: ownerJid,
    used: true,
    usedBy: targetJid,
    usedAt: now,
    autoActivated: true
  }

  store.users[targetJid] = {
    key,
    activatedAt: now,
    expiresAt,
    autoActivated: true
  }

  await db_mod.write()
  return { key, months: m, expiresAt, autoActivated: true }
}
async function activateBotAccessKey(userJid, keyRaw, aliases=[]){
  const key = String(keyRaw||'').trim().toUpperCase()
  const store = await ensureBotLicenseStore()
  const rec = store.keys[key]
  if (!rec) return { ok:false, reason:'Chave inválida.' }
  if (rec.used) return { ok:false, reason:'Essa chave já foi utilizada.' }
  if (rec.targetJid){
    const targetDigits = jidDigits(rec.targetJid)
    const candidates = [userJid, ...aliases].map(jidDigits).filter(Boolean)
    const belongsToUser = candidates.some(c => sameNumber(c, targetDigits))
    if (!belongsToUser) return { ok:false, reason:'Essa chave não pertence ao seu número.' }
  }
  const expiresAt = Date.now() + (rec.months||1) * 30 * 24 * 60 * 60 * 1000
  const storeKey = rec.targetJid || userJid
  rec.used = true
  rec.usedBy = userJid
  rec.usedAt = Date.now()
  store.users[storeKey] = { key, activatedAt: Date.now(), expiresAt }
  await db_mod.write()
  return { ok:true, expiresAt }
}
async function revokeBotLicense(targetJid){
  const store = await ensureBotLicenseStore()
  const rec = store.users[targetJid]
  if (!rec) return { ok:false, reason:'Esse número não possui licença registrada.' }

  if (rec.key && store.keys[rec.key]){
    store.keys[rec.key].revoked = true
    store.keys[rec.key].revokedAt = Date.now()
  }

  delete store.users[targetJid]
  await db_mod.write()
  return { ok:true }
}
async function getBotLicenseDashboard(){
  const store = await ensureBotLicenseStore()
  const now = Date.now()
  const keys = Object.values(store.keys || {})
  const users = Object.entries(store.users || {})

  const totalKeys = keys.length
  const totalNumbersReleased = users.length
  const activeEntries = users.filter(([, rec]) => (rec?.expiresAt || 0) > now)
  const expiredEntries = users.filter(([, rec]) => (rec?.expiresAt || 0) <= now)

  const details = users
    .map(([jid, rec]) => ({
      number: jidDigits(jid),
      expiresAt: rec?.expiresAt || 0,
      active: (rec?.expiresAt || 0) > now
    }))
    .sort((a, b) => b.expiresAt - a.expiresAt)

  return {
    totalKeys,
    totalNumbersReleased,
    activeCount: activeEntries.length,
    expiredCount: expiredEntries.length,
    details
  }
}

function normalizeClanId(text){ return text.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') }
async function getClanRecord(clanId){ await db_mod.read(); db_mod.data.clans ||= {}; return db_mod.data.clans[clanId] }
async function saveClans(){ await db_mod.write() }
async function playAudioIfExists(chatId, filename){
  try {
    const candidates = [
      path.join('./assets/voice', filename),
      path.join('./assets', filename)
    ];
    const filePath = candidates.find(p => fs.existsSync(p));
    if (!filePath) return
    const audio = fs.readFileSync(filePath);
    await sock.sendMessage(chatId, { audio, mimetype:'audio/mpeg' })
  } catch {}
}
async function sendReaction(chatId, msg){ try { if (msg?.key) await sock.sendMessage(chatId, { react:{ text:'❌', key: msg.key } }) } catch {} }
function getBotJid(){ return sock.user?.id || sock.authState?.creds?.me?.id || sock.authState?.creds?.me?.jid || '' }
function isBotMentioned(msg){
  const botJid = getBotJid()
  const mentions = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
  if (mentions.includes(botJid)) return true
  const text = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || ''
  if (/@/.test(text)) return true
  return false
}
async function sendReactionImage(chatId, msg, texts){ try {
    const images = [
      'reaction1.jpeg','reaction2.jpeg','reaction3.jpeg','reaction4.jpeg','reaction5.jpeg','reaction6.jpeg',
      'reaction1.jpg','reaction2.jpg','reaction3.jpg','reaction4.jpg','reaction5.jpg','reaction6.jpg',
      'reaction1.png','reaction2.png','reaction3.png','reaction4.png','reaction5.png','reaction6.png'
    ]
    const imgFile = path.join('./assets', pick(images))
    if (!fs.existsSync(imgFile)) return await sock.sendMessage(chatId, { text: pick(texts) }, { quoted: msg })
    const buffer = fs.readFileSync(imgFile)
    await sock.sendMessage(chatId, { image: buffer, caption: pick(texts) }, { quoted: msg })
  } catch {} }
async function sendReactionImageCaption(chatId, msg, caption, mentions=[]){
  try {
    const images = [
      'reaction1.jpeg','reaction2.jpeg','reaction3.jpeg','reaction4.jpeg','reaction5.jpeg','reaction6.jpeg',
      'reaction1.jpg','reaction2.jpg','reaction3.jpg','reaction4.jpg','reaction5.jpg','reaction6.jpg',
      'reaction1.png','reaction2.png','reaction3.png','reaction4.png','reaction5.png','reaction6.png'
    ]
    const existing = images.filter(name => fs.existsSync(path.join('./assets', name)))
    if (!existing.length){
      await sock.sendMessage(chatId, { text: caption, mentions }, { quoted: msg })
      return
    }
    const chosen = pick(existing)
    const buffer = fs.readFileSync(path.join('./assets', chosen))
    await sock.sendMessage(chatId, { image: buffer, caption, mentions }, { quoted: msg })
  } catch {
    await sock.sendMessage(chatId, { text: caption, mentions }, { quoted: msg })
  }
}
async function sendBlockedReactionImage(chatId, msg){
  const texts = [
    '😏 Achou que ia usar o mais forte de graça? Sonha não.',
    '😼 Sem licença, sem domínio. Tenta de novo com acesso ativo.',
    '🫠 Você até tentou... mas sem licença eu só observo e julgo.'
  ]
  try {
    const priorityImages = [
      'reaction4.jpeg','reaction5.jpeg','reaction6.jpeg',
      'reaction4.jpg','reaction5.jpg','reaction6.jpg',
      'reaction4.png','reaction5.png','reaction6.png'
    ]
    const found = priorityImages.find(name => fs.existsSync(path.join('./assets', name)))
    if (!found) return await sendReactionImage(chatId, msg, texts)
    const buffer = fs.readFileSync(path.join('./assets', found))
    await sock.sendMessage(chatId, { image: buffer, caption: pick(texts) }, { quoted: msg })
  } catch {
    await sock.sendMessage(chatId, { text: pick(texts) }, { quoted: msg })
  }
}
async function sendDebocheWarning(chatId, msg, mode='invalid'){
  const insults = {
    xinga: {
      texts: [
        '🤨 Me xingando? Coragem, hein.',
        '😏 Seu nível de respeito está negativo.',
        '🫠 Assim você só passa vergonha.'
      ],
      block: `🛑 ㅤ   ▬▬▬ㅤ
SATORU GOJO — SEM PACIÊNCIA
ㅤ 👁️👁️ㅤ  "Xingar não te deixa mais forte." ㅤ .

┌──────────────────────┐
ㅤ  Quer atenção? Aprende a falar.
ㅤ  Se continuar nesse nível,
ㅤ  vou ignorar sem pena. 🍬✨
└──────────────────────┘

⚠️ ㅤ AVISO:

ㅤ ╰ Respeita o bot pra receber resposta.
ㅤ ╰ Tenta de novo sem ofensa.

◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
    },
    invalid: {
      texts: [
        '😒 Comando torto de novo?',
        '🌀 Errou o comando feio.',
        '😏 Vai no .menu antes de inventar moda.'
      ],
      block: `🛑 ㅤ   ▬▬▬ㅤ
SATORU GOJO — COMANDO INVÁLIDO
ㅤ 👁️👁️ㅤ  "Nem isso você conseguiu acertar?" ㅤ .

┌──────────────────────┐
ㅤ  O comando está errado.
ㅤ  Respira, abre o menu e
ㅤ  tenta escrever direito. 🍬✨
└──────────────────────┘

📘 ㅤ COMO CORRIGIR:

ㅤ ╰ Use: .menu
ㅤ ╰ Veja o comando exato
ㅤ ╰ Tente novamente

◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
    }
  }
  const payload = insults[mode] || insults.invalid
  await sendReactionImage(chatId, msg, payload.texts)
  await sock.sendMessage(chatId, { text: payload.block }, { quoted: msg })
}
async function maybeUpdateLastActive(userId){
  const u = await getUser(userId)
  u.lastActive = Date.now()
  u.level = lvlForXP(u.xp || 0)
  const married = normalizeMarriedList(u.marriedTo).map(toNumberJid)
  u.marriedTo = married.length ? [...new Set(married)] : null
  setMaritalStatusLabel(u)
  await saveDB()
  return u
}
// ===== Downloader config (edit in download.config.json) =====

import fsPromises from 'fs/promises'

async function loadDownloaderConfig(){
  try{ return JSON.parse(await fsPromises.readFile(DOWNLOAD_CONFIG_FILE,'utf8')) }
  catch{ return { pinterest:{endpoint:'',token:''}, ai:{provider:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',token:'',model:'gemini-2.0-flash',systemPrompt:''} } }
}

async function httpGetBuffer(url, headers={}){ const res=await fetch(url,{headers}); if(!res.ok) throw new Error('HTTP '+res.status); const ab=await res.arrayBuffer(); return Buffer.from(new Uint8Array(ab)) }

async function httpGetText(url, headers={}){ const res=await fetch(url,{headers}); if(!res.ok) throw new Error('HTTP '+res.status); return await res.text() }

function buildPinterestRssUrl(input){

  const raw = String(input||'').trim()

  if (!raw) return null

  if (/^https?:\/\/[^\s]+\.rss$/i.test(raw)) return raw

  const m = raw.match(/^https?:\/\/(?:www\.)?pinterest\.com\/([^\/?#]+)\/([^\/?#]+)\/?/i)

  if (!m) return null

  const user = m[1]

  const board = m[2]

  return `https://www.pinterest.com/${user}/${board}.rss`

}

function extractPinterestImageUrlsFromRss(xml){

  const txt = String(xml||'')

  const urls = []

  const push = (u)=>{ if (!u) return; if (/^https?:\/\//i.test(u) && !urls.includes(u)) urls.push(u) }

  const enclosure = [...txt.matchAll(/<enclosure[^>]*url="([^"]+)"[^>]*>/gi)]

  for (const m of enclosure) push(m[1])

  const media = [...txt.matchAll(/<media:content[^>]*url="([^"]+)"[^>]*>/gi)]

  for (const m of media) push(m[1])

  const pinimg = [...txt.matchAll(/https?:\/\/i\.pinimg\.com\/[^\s"'<>]+/gi)]

  for (const m of pinimg) push(m[0])

  return urls

}

async function fetchPinterestRssImages(input, limit=3){

  const rssUrl = buildPinterestRssUrl(input)

  if (!rssUrl) throw new Error('Link do Pinterest inválido para RSS. Use um board: https://www.pinterest.com/USUARIO/TABULEIRO/')

  const xml = await httpGetText(rssUrl)

  const urls = extractPinterestImageUrlsFromRss(xml).slice(0, limit)

  if (!urls.length) throw new Error('Nenhuma imagem encontrada no RSS desse board.')

  return { rssUrl, urls }

}

async function fetchJsonWithTimeout(url, options={}, timeoutMs=30000){

  const ctrl = new AbortController()

  const timer = setTimeout(()=>ctrl.abort(), timeoutMs)

  try {

    const res = await fetch(url, { ...options, signal: ctrl.signal })

    const text = await res.text()

    let data = null

    try { data = text ? JSON.parse(text) : null } catch { data = null }

    return { ok: res.ok, status: res.status, data, raw: text }

  } finally {

    clearTimeout(timer)

  }

}

async function askAI(prompt, userName='Usuário'){
  const cfg = await loadDownloaderConfig()
  const provider = (process.env.AI_PROVIDER || cfg.ai?.provider || '').toLowerCase()
  const endpoint = process.env.GEMINI_API_ENDPOINT || process.env.AI_API_ENDPOINT || cfg.ai?.endpoint || ''
  const model = process.env.GEMINI_MODEL || process.env.AI_MODEL || cfg.ai?.model || 'gemini-2.0-flash'
  const systemPrompt = cfg.ai?.systemPrompt || 'Responda em português do Brasil, de forma objetiva e útil.'

  const geminiToken = process.env.GEMINI_API_KEY || cfg.ai?.token || ''
  const genericToken = process.env.AI_API_KEY || cfg.ai?.token || ''
  const isGemini = provider === 'gemini' || /generativelanguage\.googleapis\.com/.test(endpoint) || String(geminiToken).startsWith('AIza')
  const token = isGemini ? geminiToken : genericToken

  if (!token){
    return { ok:false, error: isGemini
      ? 'Configure GEMINI_API_KEY (env) ou ai.token em download.config.json.'
      : 'Configure AI_API_KEY (env) ou ai.token em download.config.json.' }
  }

  if (isGemini){
    if (!String(token).startsWith('AIza')){
      return { ok:false, error:'A chave Gemini parece inválida. Use uma chave do Google AI Studio (formato começa com AIza).' }
    }
    const base = (endpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
    const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(token)}`
    const mergedPrompt = `${systemPrompt}\n\n${userName}: ${prompt}`
    const payload = {
      contents: [{ role:'user', parts:[{ text: mergedPrompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
    }

    const res = await fetchJsonWithTimeout(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    }, 45000)

    if (!res.ok){
      const detail = res.data?.error?.message || ''
      return { ok:false, error:`IA Gemini offline (${res.status}). ${detail}`.trim() }
    }

    const parts = res.data?.candidates?.[0]?.content?.parts || []
    const text = parts.map(p => p?.text || '').join('\n').trim()
    if (!text) return { ok:false, error:'A IA Gemini não retornou conteúdo.' }
    return { ok:true, text: text.slice(0, 3500) }
  }

  const payload = {
    model,
    messages: [
      { role:'system', content: systemPrompt },
      { role:'user', content: `${userName}: ${prompt}` }
    ],
    temperature: 0.7
  }

  const res = await fetchJsonWithTimeout(endpoint, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  }, 45000)

  if (!res.ok){
    return { ok:false, error:`IA offline (${res.status}). Verifique endpoint/token/model/provider.` }
  }

  const out = res.data?.choices?.[0]?.message?.content || res.data?.response || res.data?.text || ''
  const text = String(out || '').trim()
  if (!text) return { ok:false, error:'A IA não retornou conteúdo.' }
  return { ok:true, text: text.slice(0, 3500) }
}

// ===== Anti-flood =====
const lastCmdAt = new Map(), cmdWindow = new Map(), floodLockUntil = new Map(), lastStickerAt = new Map()
const marriageProposals = new Map()
const COOLDOWN_MS=1500, WINDOW_MS=30000, WINDOW_MAX=10, FLOOD_LOCK_MS=30000
function canRunCommand(userId){
  const now=Date.now(), lock=floodLockUntil.get(userId)||0
  if (now<lock) return {ok:false, reason:`⌛ Anti-flood: aguarde ${Math.ceil((lock-now)/1000)}s.`}
  const last=lastCmdAt.get(userId)||0; if (now-last<COOLDOWN_MS) return {ok:false, reason:'⚠️ Aguarde 1.5s entre comandos.'}
  const arr=(cmdWindow.get(userId)||[]).filter(t=>now-t<WINDOW_MS); arr.push(now); cmdWindow.set(userId,arr)
  if (arr.length>WINDOW_MAX){ floodLockUntil.set(userId, now+FLOOD_LOCK_MS); cmdWindow.set(userId, []); return {ok:false, reason:'🚫 Flood detectado. Bloqueado por 30s.'} }
  lastCmdAt.set(userId, now); return {ok:true}
}
function canSendSticker(userId){ const now=Date.now(), last=lastStickerAt.get(userId)||0; if(now-last<1000) return false; lastStickerAt.set(userId, now); return true }

function normalizeMarriedList(value){
  if (Array.isArray(value)) return value.filter(Boolean)
  if (!value) return []
  return [value]
}

function setMaritalStatusLabel(user){
  user.casado = normalizeMarriedList(user.marriedTo).length ? 'Casado(a)' : 'Solteiro(a)'
}

function progressBar(value, max=100, size=10){
  const safeMax = max > 0 ? max : 100
  const ratio = Math.max(0, Math.min(1, value / safeMax))
  const fill = Math.round(ratio * size)
  return `[${'▰'.repeat(fill)}${'▱'.repeat(size - fill)}]`
}

function renderGojoRankCard({ title, quote, introLines, topLines, statusLines, footer }){
  const intro = (introLines || []).join('\n')
  const top = (topLines || []).join('\n') || 'ㅤ ╰  Sem dados suficientes.'
  const status = (statusLines || []).join('\n')
  return `🏆 ㅤ   ▬▬▬ㅤ
${title}
ㅤ 👁️👁️ㅤ  "${quote}"  ㅤ .

┌──────────────────────┐
${intro}
└──────────────────────┘

🥇 ㅤ TOP 5:

${top}

📊 ㅤ STATUS:

${status}

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
${footer}
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
}

// ===== UI =====

function menuCategoryText(cat){
  const key = cat.toLowerCase()
  if (key === 'rpg'){
    return `⚔️ ㅤ   ▬▬▬ㅤ
GOJO — MENU RPG
ㅤ 👁️👁️ㅤ  "Tente não morrer. Seria um desperdício."  ㅤ .

┌──────────────────────┐
ㅤ  O mundo lá fora é perigoso, mas
ㅤ  comigo no comando, você tem
ㅤ  uma chance. Escolha sua ação e
ㅤ  mostre que não é um inútil. 🤞✨
└──────────────────────┘

⚒️ ㅤ TRABALHO E ECONOMIA:

ㅤ ╰ .profissao / .profissoes ㅤ ╰ .salario
ㅤ ╰ .work ㅤㅤㅤ ╰ .vender
ㅤ ╰ .pix @user <quant>
ㅤ ╰ .classe <numero> ㅤ ㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤ

🛒 ㅤ LOJA RPG:

ㅤ ╰ .loja
ㅤ ╰ .buy <id>

🏹 ㅤ COLETA E EXPLORAÇÃO:

ㅤ ╰ .minerar ㅤ ╰ .cacar
ㅤ ╰ .explorar ㅤ ╰ .masmorra
ㅤ ╰ .plantar ㅤ ╰ .plantarmenu

🛡️ ㅤ PERSONAGEM:

ㅤ ╰ .perfil
ㅤ ╰ .equipar ㅤ ╰ .inventario

🎎 ㅤ CLÃS E GUERRA:

ㅤ ╰ .clan criar <nome>
ㅤ ╰ .clan entrar <nome>
ㅤ ╰ .clan sair
ㅤ ╰ .clan info [nome]
ㅤ ╰ .clan membros [nome]
ㅤ ╰ .guerra desafiar/aceitar <clã>

💍 ㅤ SOCIAL E FAMÍLIA:

ㅤ ╰ .casar @user ㅤ ╰ .trair
ㅤ ╰ .adotar

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🌌 VAZIO INFINITO: NÍVEL MÁXIMO
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
  }
  if (key === 'premio' || key === 'premium'){
    return `� ㅤ   ⫐⫐ㅤ
GOJO — MENU PREMIUM
ㅤ 👑ㅤ  "Você tem bom gosto. Isso é raro." ㅤ .

┌──────────────────────┐
ㅤ  Bem-vindo ao topo. Você acaba
ㅤ  de entrar no meu círculo restrito.
ㅤ  Aqui, as regras quem dita é você
ㅤ  (com a minha permissão, claro).
ㅤ  Aproveite os privilégios. 🤞✨
└──────────────────────┘

✨ ㅤ GERENCIAMENTO DE PLANO:

ㅤ ╰ .plano — Status atual (somente admin)
ㅤ ╰ .plano ativar — Upgrade de Elite ⚡ (somente admin)

🖼️ ㅤ BOAS-VINDAS & SAÍDA:

ㅤ ╰ .setwelcome — Intro Personalizada (somente admin)
ㅤ ╰ .setbye — Saída com Estilo (somente admin)

⚙️ ㅤ CUSTOMIZAÇÃO (PC):      

ㅤ ╰ .pcadd — Criar comando (somente admin)
ㅤ ╰ .pclist — Ver comandos (somente admin)
ㅤ ╰ .pcrmv — Deletar gatilho (somente admin)

🚫 ㅤ CONTROLE DE GRAU ESPECIAL:

ㅤ ╰ .ban <numero> — Expulsao imediata (somente admin)
ㅤ ╰ .muta @user — Silencio absoluto (somente admin) 🔇
ㅤ ╰ .desmut @user — Devolver a voz (somente admin) 🗣️

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🟣 STATUS: ACESSO ILIMITADO
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
  }
  if (key === 'brincadeiras'){
    return `🎡 ㅤ   ▬▬▬ㅤ
GOJO — BRINCADEIRAS
ㅤ 🍬ㅤ  "Vamos ver quem aqui e patetico." ㅤ .

┌──────────────────────┐
ㅤ  Hora de diversao! Vou jogar um
ㅤ  pouco com voces antes de voltar
ㅤ  ao trabalho serio. Tente nao
ㅤ  levar pro coracao... ou leve,
ㅤ  eu nao me importo. ✌️✨
└──────────────────────┘

💖 ㅤ ROMANCE & SHIP:

ㅤ ╰ .ship @user1 @user2 ㅤ ╰ .love
ㅤ ╰ .kiss @user1 @user2 💋

📊 ㅤ RANKS & STATUS:

ㅤ ╰ .rank ㅤ ╰ .rankxp
ㅤ ╰ .rankcoins ㅤ ╰ .rankbanco
ㅤ ╰ .rankpoder ㅤ ╰ .rankativos
ㅤ ╰ .rankghost ㅤ ╰ .inativos
ㅤ ╰ .rankprof ㅤ ╰ .rankpau
ㅤ ╰ .rankgostosos

💞 ㅤ INTERAÇÕES SOCIAIS:

ㅤ ╰ .beijo @user ㅤ ╰ .abraco @user
ㅤ ╰ .carinho @user ㅤ ╰ .cantada @user
ㅤ ╰ .poesia ㅤ ╰ .musica

🎲 ㅤ SORTE & JOGOS:

ㅤ ╰ .dado 🎲 ㅤ ╰ .moeda 🪙
ㅤ ╰ .adivinha 🔢 ╰ .sorteio ⚖️
ㅤ ╰ .bola8 🔮 ㅤ ╰ .quem ❓
ㅤ ╰ .forca ㅤ ╰ .letra <letra>

🎭 ㅤ ZUEIRA & REAÇÃO:

ㅤ ╰ .mimimi <texto> 😭
ㅤ ╰ .verdade <assunto> 🗣️

👊 ㅤ INTERAÇÃO VIOLENTA:

ㅤ ╰ .chutar 👟 ㅤ ╰ .matar ⚰️
ㅤ ╰ .tapa 🖐️ ㅤㅤ ╰ .murro 🥊
ㅤ ╰ .xplodir 💥

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🔵 DIVERSAO INFINITA: ATIVADA
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
  }
  if (key === 'dono' || key === 'owner'){
    return `🛡️ ㅤ   ▬▬▬ㅤ
GOJO — MENU DO DONO
ㅤ 👑ㅤ  "Aqui o controle é absoluto." ㅤ .

┌──────────────────────┐
ㅤ  Painel exclusivo do dono do bot.
ㅤ  Gerencie chaves, licenças e status
ㅤ  de usuários liberados.
└──────────────────────┘

🔑 ㅤ LICENÇAS:

ㅤ ╰ .gerarchave <numero> [meses]
ㅤ ╰ .revogarlicenca <numero>
ㅤ ╰ .licencas

📊 ㅤ RELATÓRIOS:

ㅤ ╰ .licencas — totais + números

💬 ㅤ COMUNICAÇÃO:

ㅤ ╰ .planobot — texto comercial do plano

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🔒 ACESSO: SOMENTE DONO
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
  }
  if (key === 'ajuda'){
    return `🆘 ㅤ   ▬▬▬ㅤ
GOJO — GUIA DE COMANDOS
ㅤ 👁️👁️ㅤ  "Vou explicar só uma vez, então foca." ㅤ .

┌──────────────────────┐
ㅤ  Preste atenção, aluno. Aqui está
ㅤ  o manual de como usar o meu
ㅤ  poder sem se quebrar inteiro.
ㅤ  Se não entender, lê de novo. 🍬✨
└──────────────────────┘

📖 ㅤ MENUS PRINCIPAIS:

ㅤ ╰ .menu ─ Painel Geral
ㅤ ╰ .menu rpg ─ Mundo e Economia
ㅤ ╰ .menu premio ─ Funções VIP
ㅤ ╰ .menu brincadeiras ─ Zueira
ㅤ ╰ .menu dono ─ Painel do dono
ㅤ ╰ .menudono ─ Atalho do painel do dono

⚙️ ㅤ FERRAMENTAS:

ㅤ ╰ .audio ─ Baixa música do YT 🎶
╰ .video ─ Baixa vídeo (YT/TT/Pin) 🎥
ㅤ ╰ .sticker ─ Faz figurinha de imagem 🖼️
╰ .ia <pergunta> ─ IA para respostas rápidas 🤖

💎 ㅤ LICENÇA DO BOT:

ㅤ ╰ .planobot ─ Plano mensal (R$15)
╰ .licenca ─ Ver sua licença
╰ .ativar <chave> ─ Ativar acesso
╰ .licencas ─ Painel de licenças (dono)
╰ .revogarlicenca <numero> ─ Revogar licença (dono)

👤 ㅤ IDENTIDADE:

ㅤ ╰ .perfil ─ Seus dados e posses
╰ .setname ─ Nome nas figurinhas 🏷️
╰ .setstatus ─ Sua frase no perfil 💬

⚒️ ㅤ GRANA E PODER:

ㅤ ╰ .work ─ Trabalhar por coins 💸
╰ .loja / .buy ─ Ver e comprar itens 🛍️
╰ .enviar ─ Mandar grana pra alguém 💸
╰ .rank / .rankcoins / .rankxp ─ Ranks do grupo 🏆

🎡 ㅤ BRINCADEIRAS:

ㅤ ╰ .beijo / .abraco / .carinho / .cantada 💞
╰ .poesia / .musica ─ Aleatórios ✨
╰ .forca / .letra ─ Jogo da forca 😵‍💫
╰ .rankpoder / .rankativos / .rankghost 📊

🚫 ㅤ CONTROLE (ADMIN/VIP):

ㅤ ╰ .ban ─ Chuta o inútil do grupo 🚫
╰ .muta/desmut ─ Cala a boca de alguém 🔇
╰ .pcadd/rmv ─ Cria/Deleta comandos ⚙️
╰ .plano ─ Ativa o Premium no grupo 💎
╰ .setwelcome/bye ─ Mensagens VIP 🖼️

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
📧 SUPORTE: satoru.suport24hs@gmail.com
📱 LICENÇA: ${BOT_LICENSE_CONTACT || 'não configurado'}${BOT_LICENSE_CONTACT_LINK ? ` (${BOT_LICENSE_CONTACT_LINK})` : ''}
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤` }
  if (key === 'variado' || key === 'variedades'){
    return `🎭 ㅤ   ▬▬▬ㅤ
GOJO — VARIADO
ㅤ 🍬ㅤ  "Diversão sem limites, como eu." ㅤ .

┌──────────────────────┐
ㅤ  Aqui você encontra ferramentas
ㅤ  úteis e brincadeiras rápidas.
ㅤ  Use com moderação... ou não. 🍬✨
└──────────────────────┘

🖼️ ㅤ FIGURINHAS & EDIÇÃO:

ㅤ ╰ .sticker ─ Cria figurinha de imagem 🖼️

🎵 ㅤ DOWNLOADS:

ㅤ ╰ .audio <link> ─ Baixa música do YT 🎶
ㅤ ╰ .video <link> ─ Baixa vídeo (YT/Pin) 🎥


🤖 ㅤ IA:

ㅤ ╰ .ia <pergunta> ─ Pergunte para a IA
ㅤ ╰ .ai <pergunta> ─ Atalho do comando

🎲 ㅤ JOGOS RÁPIDOS:

ㅤ ╰ .dado ─ Joga um dado de 6 lados 🎲
ㅤ ╰ .moeda ─ Cara ou coroa 🪙
ㅤ ╰ .bola8 <pergunta> ─ Consulta a bola de cristal 🔮
ㅤ ╰ .adivinha <numero> ─ Tenta adivinhar o número secreto 🔢
ㅤ ╰ .sorteio <op1|op2|...> ─ Escolhe uma opção aleatória ⚖️

🎭 ㅤ DIVERSÃO:

ㅤ ╰ .mimimi <texto> ─ Transforma em choradeira 😭
ㅤ ╰ .verdade <assunto> ─ Revela uma verdade 🗣️
ㅤ ╰ .quem @user1 @user2 ─ Escolhe alguém aleatório ❓
ㅤ ╰ .todos <mensagem> ─ Marca todo mundo do grupo 📣
ㅤ ╰ .marcar <mensagem> ─ Convocação com marcação geral 📢

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🔵 VARIADO INFINITO: ATIVADO
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤` }
  return `Categoria não encontrada. Use .menu ou .menu ajuda.`
}

async function menuPremiumWithCustomCommands(chatId, isGroup){
  const base = menuCategoryText('premium')
  if (!isGroup) return base

  const list = await listGroupCustom(chatId)
  const lines = list.length
    ? list.slice(0, 20).map(c => `ㅤ ╰ .${c.trigger}`).join('\n')
    : 'ㅤ ╰ Nenhum comando personalizado criado ainda.'

  return `${base}

🧩 ㅤ COMANDOS PERSONALIZADOS DO GRUPO:

${lines}`
}

async function sendMenu(chatId, quoted){
  const menuPath = fs.existsSync('./assets/menu.jpg')
    ? './assets/menu.jpg'
    : (fs.existsSync('./assets/menu.png') ? './assets/menu.png' : null)
  const img = menuPath ? fs.readFileSync(menuPath) : null
  const caption = `🌌 ⫐⫐  SATORU GOJO ⫐⫐ 🌌
ㅤ ㅤ  "Relaxa, eu sou o mais forte."  ㅤ .

┌──────────────────────┐
ㅤ  Não precisa ficar tão tenso...
ㅤ  Afinal, você está diante de mim.
ㅤ  Escolha logo o que quer, tenho
ㅤ  uma reserva em uma doceria em
ㅤ  5 minutos. 🍬✨
└──────────────────────┘

🔵 .menu rpg
⚪ .menu premium
🔵 .menu brincadeiras
⚪ .menu ajuda
🔵 .menu variado
⚪ .menu dono


▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🤞 EXPANSÃO DE DOMÍNIO: VAZIO INFINITO
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢`
  if (img) await sock.sendMessage(chatId, { image: img, caption }, { quoted })
  else await sock.sendMessage(chatId, { text: caption }, { quoted })
}

function getMenuImagePath(cat){
  const key = (cat || '').toLowerCase()
  const map = {
    rpg: './assets/menu rpg.jpg',
    premium: './assets/menu premium.jpeg',
    premio: './assets/menu premium.jpeg',
    brincadeiras: './assets/menubrinca.jpeg',
    ajuda: './assets/menu ajuda.jpeg',
    variado: './assets/menu variado.jpeg',
    variedades: './assets/menu variado.jpeg',
    dono: './assets/menu dono.jpeg',
    owner: './assets/menu dono.jpeg'
  }
  const selected = map[key] || './assets/menu.png'
  if (fs.existsSync(selected)) return selected
  return fs.existsSync('./assets/menu.png') ? './assets/menu.png' : null
}

async function sendMenuCategory(chatId, quoted, cat, caption){
  const menuPath = getMenuImagePath(cat)
  const img = menuPath ? fs.readFileSync(menuPath) : null
  if (img) await sock.sendMessage(chatId, { image: img, caption }, { quoted })
  else await sock.sendMessage(chatId, { text: caption }, { quoted })
}
async function extractAudioFromVideoMessage(msg, chatId){
  const stream = await downloadMediaBuffer(msg, 'buffer')
  const uid = `${Date.now()}_${Math.floor(Math.random()*1e6)}`
  const inPath = `./tmp_in_${uid}.mp4`
  const outPath = `./tmp_out_${uid}.mp3`
  try {
    fs.writeFileSync(inPath, stream)
    await new Promise((res,rej)=>{ ffmpeg(inPath).noVideo().audioCodec('libmp3lame').save(outPath).on('end',res).on('error',rej) })
    const audio = fs.readFileSync(outPath)
    await sock.sendMessage(chatId, { audio, mimetype:'audio/mpeg' })
  } finally {
    for (const p of [inPath, outPath]) if (fs.existsSync(p)) fs.unlinkSync(p)
  }
}
const YT_REQUEST_OPTIONS = {
  requestOptions: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
      'Referer': 'https://www.youtube.com/'
    }
  }
}

function downloadErrorText(err, source){
  const msg = String(err?.message || err || '')
  const low = msg.toLowerCase()
  if (low.includes('410')) return `Erro 410 no ${source}. O link pode estar indisponível/expirado ou bloqueado temporariamente.`
  if (low.includes('403')) return `Erro 403 no ${source}. Tente novamente em alguns minutos ou use outro link.`
  if (low.includes('429')) return `Muitas requisições no ${source}. Aguarde um pouco e tente novamente.`
  return `Erro no ${source}: ${msg}`
}
async function audioFromYouTube(url, chatId){
  if (!ytdl.validateURL(url)){ await sock.sendMessage(chatId, { text:'Link inválido do YouTube.' }); return }
  const uid = `${Date.now()}_${Math.floor(Math.random()*1e6)}`
  const outPath = `./yt_audio_${uid}.mp3`
  try {
    await new Promise((res,rej)=>{
      const stream = ytdl(url, { quality:'highestaudio', filter:'audioonly', highWaterMark: 1 << 25, ...YT_REQUEST_OPTIONS })
      ffmpeg(stream).audioCodec('libmp3lame').save(outPath).on('end',res).on('error',rej)
    })
    const audio = fs.readFileSync(outPath)
    await sock.sendMessage(chatId, { audio, mimetype:'audio/mpeg', ptt:false })
  } catch (err) {
    await sock.sendMessage(chatId, { text: downloadErrorText(err, 'download de áudio do YouTube') })
  } finally {
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath)
  }
}
async function audioFromGeneric(link, chatId){
  const cfg = await loadDownloaderConfig()
  let endpoint='', token=''
  try{
    const res = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json', ...(token?{'Authorization':`Bearer ${token}`}:{}) }, body: JSON.stringify({ url: link, noWatermark:true }) })
    if (res.status === 410) throw new Error('410')
    if (!res.ok) throw new Error('Downloader falhou: '+res.status)
    const data = await res.json()
    const audioUrl = data.audio_no_wm || data.audio || data.url_audio
    if (!audioUrl) throw new Error('Resposta sem áudio')
    const buff = await httpGetBuffer(audioUrl)
    await sock.sendMessage(chatId, { audio: buff, mimetype:'audio/mpeg' })
  } catch(err){ await sock.sendMessage(chatId, { text: downloadErrorText(err, 'download de áudio') }) }
}
async function videoFromYouTube(url, chatId){
  if (!ytdl.validateURL(url)){ await sock.sendMessage(chatId, { text:'Link de YouTube inválido.' }); return }
  const uid = `${Date.now()}_${Math.floor(Math.random()*1e6)}`
  try {
    const info = await ytdl.getInfo(url, YT_REQUEST_OPTIONS)
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'highest',
      filter: 'audioandvideo'
    })
    const container = format.container || 'mp4'
    const outPath = `./yt_video_${uid}.${container}`
    await new Promise((resolve, reject)=>{
      const file = fs.createWriteStream(outPath)
      const stream = ytdl.downloadFromInfo(info, { format, highWaterMark: 1 << 25, ...YT_REQUEST_OPTIONS })
      stream.on('error', reject)
      file.on('error', reject)
      file.on('finish', resolve)
      stream.pipe(file)
    })
    const vid = fs.readFileSync(outPath)
    const mimetype = container === 'webm' ? 'video/webm' : 'video/mp4'
    await sock.sendMessage(chatId, { video: vid, mimetype, caption:'🎬 Vídeo baixado com sucesso!' })
  } catch (err) {
    await sock.sendMessage(chatId, { text: downloadErrorText(err, 'download de vídeo do YouTube') })
  } finally {
    const possible = [`./yt_video_${uid}.mp4`, `./yt_video_${uid}.webm`, `./yt_video_${uid}.mkv`]
    for (const filePath of possible){
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
  }
}
async function videoFromGeneric(link, chatId){
  const cfg = await loadDownloaderConfig()
  let endpoint='', token=''
  if (/pinterest\.com/.test(link)){ endpoint = cfg.pinterest.endpoint; token = cfg.pinterest.token }

  // Pinterest: fallback gratuito via RSS de board quando API não estiver configurada.
  if (/pinterest\.com/.test(link) && !endpoint){
    try {
      const { rssUrl, urls } = await fetchPinterestRssImages(link, 3)
      for (const [i, u] of urls.entries()){
        const img = await httpGetBuffer(u)
        await sock.sendMessage(chatId, {
          image: img,
          caption: `📌 Pinterest RSS ${i+1}/${urls.length}\nFonte: ${rssUrl}`
        })
      }
      return
    } catch (err){
      await sock.sendMessage(chatId, { text:'Pinterest RSS falhou: ' + err.message })
      return
    }
  }

  if (!endpoint){ await sock.sendMessage(chatId, { text:'Configure sua API em download.config.json para Pinterest (sem marca d’água).' }); return }
  try{
    const res = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json', ...(token?{'Authorization':`Bearer ${token}`}:{}) }, body: JSON.stringify({ url: link, noWatermark:true }) })
    if (res.status === 410) throw new Error('410')
    if (!res.ok) throw new Error('Downloader falhou: '+res.status)
    const data = await res.json()
    const url = data.url_no_wm || data.nowm || data.video_no_watermark || data.url || data.video
    if (!url) throw new Error('Resposta sem link de vídeo')
    const buff = await httpGetBuffer(url)
    await sock.sendMessage(chatId, { video: buff, caption:'🎬 Vídeo baixado (sem marca d’água, quando a API permitir).' })
  } catch(err){ await sock.sendMessage(chatId, { text: downloadErrorText(err, 'download de vídeo') }) }
}

// ===== Main =====
sock.ev.on('messages.upsert', async ({ messages, type })=>{
  if (type!=='notify') return
  const msg = messages[0]
  if (!msg?.message) return
  const chatId = msg.key.remoteJid
  const sender = resolveSenderJid(msg)
  const isGroup = chatId.endsWith('@g.us')
  const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
  await maybeUpdateLastActive(sender)

  const groupSettings = isGroup ? await getGroupSettings(chatId) : null
  if (isGroup && groupSettings?.mutedUsers?.includes(sender)){
    try { await sock.sendMessage(chatId, { delete: msg.key }) } catch {}
    return
  }

  const ownerContext = isOwnerContext(sender, chatId, msg)
  const license = await getBotLicenseStatus(sender, [chatId, sock?.user?.id])
  let groupSponsored = false
  if (isGroup && !license.active && !ownerContext){
    const sponsor = await getGroupSponsorLicenseStatus(chatId)
    groupSponsored = sponsor.active
  }
  const accessGranted = ownerContext || license.active || groupSponsored

  // Stickers
  const directImage = getDirectImageMessage(msg)
  if (directImage){
    if (!accessGranted){
      await sendBlockedReactionImage(chatId, msg)
      await sock.sendMessage(chatId, { text:`🛑 ㅤ   ▬▬▬ㅤ
SATORU GOJO — BLOQUEADO
ㅤ 👁️👁️ㅤ  "Voce nao tem acesso a mim... ainda." ㅤ .

┌──────────────────────┐
ㅤ  Para usar figurinha no privado,
ㅤ  sua licença precisa estar ativa.
ㅤ  No grupo, o acesso depende de um
ㅤ  admin com licença ativa.
└──────────────────────┘

⚙️ ㅤ REGRAS DE USO:

ㅤ ╰ Privado: licença própria ativa.
ㅤ ╰ Grupo: 1 admin ativo libera.

◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    if (!canSendSticker(sender)) return

    const imageMsg = {
      key: msg.key,
      message: { imageMessage: directImage }
    }
    let buf
    try {
      buf = await downloadMediaBuffer(imageMsg, 'buffer')
    } catch (err) {
      await sock.sendMessage(chatId, { text:`Falha ao ler a imagem para figurinha: ${err.message}` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }

    const profile = await getUser(sender)
    const author = profile.name || msg.pushName || 'Usuário'
    try {
      const sticker = await makeSticker(buf, author, `${author}_sticker`)
      await sock.sendMessage(chatId, { sticker }, { quoted: msg })
    } catch (err) {
      await sock.sendMessage(chatId, { text:`Falha ao converter em figurinha: ${err.message}` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    return
  }

  // Exec custom group commands (before parsing built-ins)
  if (isGroup && (text.startsWith('.') || text.startsWith('!'))){
    const trigger = text.slice(1).trim().split(/\s+/)[0].toLowerCase()
    const g = await getGroupCustom(chatId)
    const found = g.commands[trigger]
    if (found){ await sock.sendMessage(chatId, { text: found.msg }, { quoted: msg }); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return }
  }

  const lowerText = text.toLowerCase()
  const insultWords = ['pqp','fdp','fodase','vai se fuder','vai se foder','burro','idiota','otario','otário','merda']
  const hasInsult = insultWords.some(w=> lowerText.includes(w))
  if (hasInsult && (isBotMentioned(msg) || !isGroup)){
    await sendDebocheWarning(chatId, msg, 'xinga')
    await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
    return
  }
  if (/uchiha|uchhiha|sharingan/.test(lowerText)){
    await sendReactionImage(chatId, msg, [
      '🔥 Uchhiha? Tá falando do clã errado com o Gojo.',
      '👀 Uchiha vem, mas aqui só tem domínio verdadeiro.',
      '⚡ Se for falar de Uchiha, escolhe palavra com respeito.'
    ])
    return
  }

  const parts = parseCommandText(text)
  if (!parts) return

  // Anti-flood
  const chk = canRunCommand(sender)
  if (!chk.ok){ await sock.sendMessage(chatId, { text: chk.reason }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }

  const rawCmd = (parts[0]||'').toLowerCase()
  const cmdAliases = {
    peril: 'perfil',
    claase: 'classe',
    clase: 'classe'
  }
  const cmd = cmdAliases[rawCmd] || rawCmd
  const arg = parts.slice(1)

  if (cmd==='debugdono'){
    const senderDigits = jidDigits(sender)
    const chatDigits = jidDigits(chatId)
    const connectedDigits = jidDigits(sock?.user?.id || '')
    const lines = [
      'DEBUG DONO',
      `sender: ${sender}`,
      `senderDigits: ${senderDigits}`,
      `chatId: ${chatId}`,
      `chatDigits: ${chatDigits}`,
      `sock.user.id: ${sock?.user?.id || 'n/a'}`,
      `connectedDigits: ${connectedDigits}`,
      `BOT_OWNER_NUMBER: ${BOT_OWNER_NUMBER}`,
      `ACTIVE_OWNER_NUMBER: ${ACTIVE_OWNER_NUMBER || 'n/a'}`,
      `ownerContext: ${ownerContext ? 'SIM' : 'NAO'}`
    ]
    await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: msg })
    return
  }

  if (cmd==='planobot' || cmd==='licenca' || cmd==='gerarchave' || cmd==='ativar' || cmd==='revogarlicenca' || cmd==='licencas'){
    if (cmd==='planobot'){
      await sock.sendMessage(chatId, { text:`💎 PLANO DO BOT\nValor: R$${BOT_PLAN_MONTHLY_PRICE}/mês\n\nContato para obter licença:\n${BOT_LICENSE_CONTACT || 'não configurado'}${BOT_LICENSE_CONTACT_LINK ? `\n${BOT_LICENSE_CONTACT_LINK}` : ''}\n\nApós pagamento, o dono gera uma chave e você ativa com:\n.ativar <chave>\n\nComandos úteis:\n• .licenca\n• .ativar <chave>` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    if (cmd==='licenca'){
      const st = await getBotLicenseStatus(sender, [chatId, sock?.user?.id])
      const grp = isGroup ? await getGroupSponsorLicenseStatus(chatId) : { active:false }
      if (!st.active){
        if (grp.active){
          await sendReactionImage(chatId, msg, [
            '😎 Relaxa, o grupo já está liberado por um admin com licença ativa.',
            '✨ Aqui tá liberado no grupo. Aproveita e usa com estilo.',
            '🧿 O acesso está aberto neste grupo graças à licença de um admin.'
          ])
          await sock.sendMessage(chatId, { text:`✅ ㅤ   ▬▬▬ㅤ
SATORU GOJO — ACESSO LIBERADO
ㅤ 👁️👁️ㅤ  "Neste grupo você tem passagem livre." ㅤ .

┌──────────────────────┐
ㅤ  Sua licença pessoal está inativa,
ㅤ  mas este grupo está liberado por
ㅤ  um admin com acesso ativo.
└──────────────────────┘

💎 ㅤ STATUS DO GRUPO:

ㅤ ╰ Licença: Ativa ✅
ㅤ ╰ Válida até: ${fmtDate(grp.expiresAt)}

◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤` }, { quoted: msg })
          await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
          return
        }
        await sock.sendMessage(chatId, { text:`❌ Sua licença está inativa.\nUse .planobot para ver o plano mensal de R$${BOT_PLAN_MONTHLY_PRICE}.` }, { quoted: msg })
        await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
        return
      }
      await sendReactionImage(chatId, msg, [
        '😌 Boa. Você está autorizado(a) a usar o mais forte.',
        '✨ Licença ativa. Agora sim, respeito detectado.',
        '🧿 Acesso confirmado. Pode mandar os comandos.'
      ])
      await sock.sendMessage(chatId, { text:`✅ ㅤ   ▬▬▬ㅤ
SATORU GOJO — ACESSO ATIVO
ㅤ 👁️👁️ㅤ  "Agora sim, você tem moral comigo." ㅤ .

┌──────────────────────┐
ㅤ  Sua licença está ativa.
ㅤ  Pode usar os comandos sem
ㅤ  bloqueio no seu privado.
└──────────────────────┘

💎 ㅤ STATUS DA SUA LICENÇA:

ㅤ ╰ Situação: Ativa ✅
ㅤ ╰ Válida até: ${fmtDate(st.expiresAt)}

🆓 ㅤ COMANDOS LIBERADOS:

ㅤ ╰ Todos os comandos do bot

◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    if (cmd==='gerarchave'){
      if (!ownerContext){
        await sock.sendMessage(chatId, { text:'Somente o dono do bot pode gerar chaves.' }, { quoted: msg })
        await playAudioIfExists(chatId, '(4) Tentativa de Execução de Comandos Vips.mp3')
        return
      }
      const parsed = parseLicenseIssueArgs(arg)
      if (!parsed.number || parsed.number.length < 12){
        await sock.sendMessage(chatId, { text:'Use: .gerarchave <numero_com_ddd> [meses]' }, { quoted: msg })
        await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
        return
      }
      const targetJid = toNumberJid(parsed.number)
      const created = await createBotAccessKey(sender, targetJid, parsed.months)
      await sock.sendMessage(chatId, { text:`✅ Licença criada e ativada para ${parsed.number}\n🔑 Chave: ${created.key}\n📅 Válida até: ${fmtDate(created.expiresAt)}\n\nObs: não precisa usar .ativar, já ficou ativa automaticamente.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    if (cmd==='revogarlicenca'){
      if (!ownerContext){
        await sock.sendMessage(chatId, { text:'Somente o dono do bot pode revogar licenças.' }, { quoted: msg })
        await playAudioIfExists(chatId, '(4) Tentativa de Execução de Comandos Vips.mp3')
        return
      }
      const raw = normalizeTargetNumber(arg[0]||'')
      if (!raw){
        await sock.sendMessage(chatId, { text:'Use: .revogarlicenca <numero_com_ddd>' }, { quoted: msg })
        await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
        return
      }
      const targetJid = toNumberJid(raw)
      const out = await revokeBotLicense(targetJid)
      if (!out.ok){
        await sock.sendMessage(chatId, { text:`❌ ${out.reason}` }, { quoted: msg })
        await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
        return
      }
      await sock.sendMessage(chatId, { text:`✅ Licença revogada para ${raw}.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    if (cmd==='licencas'){
      if (!ownerContext){
        await sock.sendMessage(chatId, { text:'Somente o dono do bot pode ver o painel de licenças.' }, { quoted: msg })
        await playAudioIfExists(chatId, '(4) Tentativa de Execução de Comandos Vips.mp3')
        return
      }
      const dash = await getBotLicenseDashboard()
      const list = dash.details.length
        ? dash.details.slice(0, 50).map((x, i) => `${i+1}. ${x.number} - ${x.active ? 'ATIVA' : 'EXPIRADA'} - ${x.expiresAt ? fmtDate(x.expiresAt) : 'sem data'}`).join('\n')
        : 'Nenhum número liberado ainda.'
      await sock.sendMessage(chatId, { text:`📊 PAINEL DE LICENÇAS\n\n• Chaves geradas: ${dash.totalKeys}\n• Números liberados: ${dash.totalNumbersReleased}\n• Licenças ativas: ${dash.activeCount}\n• Licenças expiradas: ${dash.expiredCount}\n\n📱 NÚMEROS LIBERADOS:\n${list}` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    if (cmd==='ativar'){
      const key = (arg[0]||'').trim()
      if (!key){
        await sock.sendMessage(chatId, { text:'Use: .ativar <chave>' }, { quoted: msg })
        await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
        return
      }
      const result = await activateBotAccessKey(sender, key, [chatId, sock?.user?.id])
      if (!result.ok){
        await sock.sendMessage(chatId, { text:`❌ ${result.reason}` }, { quoted: msg })
        await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
        return
      }
      await sock.sendMessage(chatId, { text:`✅ Licença ativada com sucesso!\nVálida até ${fmtDate(result.expiresAt)}.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }
  }

  const freeCommands = new Set(['menu','ajuda','planobot','licenca','ativar','menudono','perfil','debugdono','classe'])
  if (!ownerContext && !license.active && !groupSponsored && !freeCommands.has(cmd)){
    await sendBlockedReactionImage(chatId, msg)
    await sock.sendMessage(chatId, { text:`🛑 ㅤ   ▬▬▬ㅤ
SATORU GOJO — BLOQUEADO
ㅤ 👁️👁️ㅤ  "Voce nao tem acesso a mim... ainda." ㅤ .

┌──────────────────────┐
ㅤ  Achou que o poder do mais forte
ㅤ  era de graca? Sua licenca nao
ㅤ  esta ativa. Se quiser minha ajuda,
ㅤ  vai ter que abrir a carteira. 🍬✨
└──────────────────────┘

💎 ㅤ PLANO DE ACESSO:

ㅤ ╰ Valor: R$ 15,00 / mês
ㅤ ╰ Status: Inativo ❌

💳 ㅤ CONTATO PARA LICENÇA:

ㅤ 
ㅤ ╰ Link: https://wa.me/5581986010094

⚙️ ㅤ REGRAS DE USO:

ㅤ ╰ Em Grupos: 1 admin ativo libera todos.
ㅤ ╰ No Privado: A licenca deve ser sua.

🆓 ㅤ COMANDOS LIVRES:

ㅤ .menu | .ajuda | .planobot
ㅤ .licenca | .ativar

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🔒 SISTEMA: RESTRITO POR GRAU
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤` }, { quoted: msg })
    await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
    return
  }

  // Menu / Ajuda
  if (cmd==='menu'){
    const catInput = arg[0] || ''
    const catNorm = catInput.toLowerCase()
    const cat = ['adme','admin','adm'].includes(catNorm) ? 'dono' : catInput
    if (cat){
      if (['dono','owner'].includes(cat.toLowerCase()) && !ownerContext){
        await sock.sendMessage(chatId, { text:'Apenas o dono do bot pode ver esse menu.' }, { quoted: msg })
        await playAudioIfExists(chatId, '(4) Tentativa de Execução de Comandos Vips.mp3')
        return
      }
      const isPremiumMenu = ['premio','premium'].includes(cat.toLowerCase())
      const text = isPremiumMenu
        ? await menuPremiumWithCustomCommands(chatId, isGroup)
        : menuCategoryText(cat)
      await sendMenuCategory(chatId, msg, isPremiumMenu ? 'premium' : cat, text)
    } else {
      await sendMenu(chatId, msg)
    }
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='menudono'){
    if (!ownerContext){
      await sock.sendMessage(chatId, { text:'Apenas o dono do bot pode ver esse menu.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(4) Tentativa de Execução de Comandos Vips.mp3')
      return
    }
    await sendMenuCategory(chatId, msg, 'dono', menuCategoryText('dono'))
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='ajuda'){
    const cat = arg[0] || 'ajuda'
    if (['dono','owner'].includes(cat.toLowerCase()) && !ownerContext){
      await sock.sendMessage(chatId, { text:'Apenas o dono do bot pode ver esse menu.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(4) Tentativa de Execução de Comandos Vips.mp3')
      return
    }
    const text = menuCategoryText(cat)
    await sendMenuCategory(chatId, msg, cat, text)
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  // Perfil & status
  if (cmd==='perfil'){
    const u = await getUser(sender)
    const numero = jidToNumber(sender)
    const marriedPartners = normalizeMarriedList(u.marriedTo).map(toNumberJid)
    u.level = lvlForXP(u.xp || 0)
    u.marriedTo = marriedPartners.length ? [...new Set(marriedPartners)] : null
    setMaritalStatusLabel(u)
    await saveDB()
    const nome = u.name || msg.pushName || 'Usuário'
    const level = u.level || 1, xp = u.xp || 0, coins=u.coins||0, bank=u.bank||0
    const items=(u.items||[]).length
    const status = u.status || '—'
    const created = u.createdAt ? fmtDate(u.createdAt) : '—'
    const age = u.createdAt ? timeSince(u.createdAt) : '—'
    const titulo = u.titulo || 'Novato'
    const casado = u.casado || 'Solteiro(a)'
    const conjugesText = marriedPartners.length
      ? marriedPartners.map(jid => `@${jidToNumber(jid)}`).join(', ')
      : 'Nenhum'
    const prof = getProfession(u)
    await db_mod.read(); db_mod.data.clans ||= {}
    const clan = u.clan ? db_mod.data.clans[u.clan]?.name || u.clan : 'Sem Clã'
    const filhos = u.children && u.children.length > 0 ? `${u.children.length} filho(s): ${u.children.join(', ')}` : 'Nenhum'
    const poder = calcPower(u)
    const defesa = calcDefense(u)
    const classText = CLASSES.find(c => c.id === u.classe)?.name || 'Nenhuma'
    const betrayed = u.betrayalTitle ? `🎭 ${u.betrayalTitle}` : 'Nenhum'

    const caption = `🌌 ㅤ   ▬▬▬ㅤ
PERFIL DE FEITICEIRO
ㅤ 👁️👁️ㅤ  "Voce tem potencial... eu acho." ㅤ .

┌──────────────────────┐
ㅤ 🏆 TITULO: ${titulo}
ㅤ 🎭 ${betrayed}
ㅤ 💬 ${status}
└──────────────────────┘

👤 IDENTIDADE:

ㅤ ╰  Nome: ${nome}
ㅤ ╰  Numero: @${numero}
ㅤ ╰  Nivel: ${level} ✨ ${xp} XP

⚔️ ATRIBUTOS:

ㅤ ╰  Classe: ${classText}
ㅤ ╰  Força: ${poder} 💪
ㅤ ╰  Defesa: ${defesa} 🛡️

💍 SOCIAL & CLAN:

ㅤ ╰  Estado: ${casado} 💍
ㅤ ╰  Cônjuge(s): ${conjugesText}
ㅤ ╰  Clã: ${clan} 🛡️
ㅤ ╰  Filhos: ${filhos} 👶

💰 ECONOMIA:

ㅤ ╰  Coins: ${coins} 🪙
ㅤ ╰  Banco: ${bank} 🏦
ㅤ ╰  Profissao: ${prof?.name || 'Nenhuma'} 💼

🎒 INVENTARIO:

ㅤ ╰  Itens: ${items}

⚡ ESTATISTICAS:

ㅤ ╰  Vitórias: ${u.wins||0} ⚡
ㅤ ╰  Derrotas: ${u.losses||0} ❌
ㅤ ╰  Kills: ${u.kills||0} 💀
ㅤ ╰  Bosses: ${u.bossesDefeated||0} 🐉

🗓️ REGISTRO:

ㅤ ╰  ${created} (${age})

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
"Continue tentando... um dia talvez voce
chegue no meu nivel." — Satoru 🤭
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`

    try {
      const purl = await sock.profilePictureUrl(sender,'image')
      const mentions = [sender, ...marriedPartners]
      if (purl){
        const img = await fetchBuffer(purl)
        await sock.sendMessage(chatId, { image: img, caption, mentions }, { quoted: msg })
      } else {
        await sock.sendMessage(chatId, { text: caption, mentions }, { quoted: msg })
      }
    } catch {
      await sock.sendMessage(chatId, { text: caption, mentions:[sender, ...marriedPartners] }, { quoted: msg })
    }
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='setstatus'){
    const texto = arg.join(' ').trim()
    if (!texto){ await sock.sendMessage(chatId, { text:'Use: .setstatus <sua frase estilosa>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const u = await getUser(sender); u.status = texto.slice(0,120); await saveDB()
    await sock.sendMessage(chatId, { text:`Status atualizado: “${u.status}”. Agora sim, com cara de jogador caro.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  // Setname
  if (cmd==='setname'){
    const name = arg.join(' ').trim()
    if (!name){ await sock.sendMessage(chatId, { text:'Use: .setname <nome>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    await setUser(sender, { name })
    await sock.sendMessage(chatId, { text:`Beleza, vou usar “${name}” nas suas figurinhas.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  // Economy & store
  if (cmd==='work'){
    const u = await getUser(sender); const now=Date.now(); u.cooldowns ||= {}
    if ((u.cooldowns.work||0) > now){
      const sec=Math.ceil((u.cooldowns.work-now)/1000)
      await sock.sendMessage(chatId, { text:`Calma, respira. Falta ${sec}s para trabalhar de novo.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    const base=50+Math.floor(Math.random()*51)
    const boost=(u.items||[]).reduce((s,it)=>s + ((it.boost||0) + (it.workBoost||0)),0)
    const gain=Math.floor(base*(1+Math.min(boost,1)))
    u.coins=(u.coins||0)+gain; u.xp=(u.xp||0)+10; u.cooldowns.work=now+60*60*1000; await saveDB()
    await sock.sendMessage(chatId, { text:`Trampo feito (${u.job||'sem profissão'}). Você ganhou ${gain} coins. (Boost ${Math.round(Math.min(boost,1)*100)}%). XP +10. Nível ${lvlForXP(u.xp)}.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='aposta'){
    const raw = arg[0] || ''
    const value = parseInt(raw, 10)
    if (!raw || Number.isNaN(value) || value <= 0){
      await sock.sendMessage(chatId, { text:'Use: .aposta <valor>' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    const u = await getUser(sender)
    if ((u.coins||0) < value){
      await sock.sendMessage(chatId, { text:'Saldo insuficiente para apostar esse valor.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    const winChance = Math.min(0.45 + calcLuck(u), 0.8)
    const win = Math.random() < winChance
    if (win){
      u.coins = (u.coins||0) + value
      u.wins = (u.wins||0) + 1
      await saveDB()
      await sock.sendMessage(chatId, { text:`🎰 Você venceu a aposta e ganhou ${value} coins!` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    } else {
      u.coins = (u.coins||0) - value
      u.losses = (u.losses||0) + 1
      await saveDB()
      await sock.sendMessage(chatId, { text:`💸 Você perdeu a aposta e perdeu ${value} coins.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
    }
    return
  }

  if (cmd==='roubar' || cmd==='steal'){
    const num=(arg[0]||'').replace(/[^0-9]/g,'')
    if (!num){ await sock.sendMessage(chatId, { text:'Use: .roubar <numero_com_ddd>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const attacker=await getUser(sender), victim=await getUser(toNumberJid(num))
    if ((victim.coins||0)<50){ await sock.sendMessage(chatId, { text:'Alvo com pouco dinheiro.' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const success=Math.random() < Math.min(0.4 + calcPrecision(attacker), 0.85)
    if (success){
      const stolen=Math.min(victim.coins, Math.floor(Math.random()*Math.floor(victim.coins*0.3)))
      victim.coins-=stolen; attacker.coins=(attacker.coins||0)+stolen; await saveDB()
      await sock.sendMessage(chatId, { text:`Roubo bem-sucedido! Pegou ${stolen} coins.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    } else {
      const penalty=Math.min(attacker.coins||0, Math.max(5, 20 - Math.floor(calcEscape(attacker)*10))); attacker.coins=(attacker.coins||0)-penalty; await saveDB()
      await sock.sendMessage(chatId, { text:`Falhou! Multa de ${penalty} coins.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
    }
    return
  }

  if (cmd==='minerar'){
    const u = await getUser(sender)
    const now = Date.now(); u.cooldowns ||= {}
    if ((u.cooldowns.minerar||0) > now){ await sock.sendMessage(chatId, { text:`Já minerou recentemente. Tente de novo em ${Math.ceil((u.cooldowns.minerar-now)/1000)}s.` }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const boost = (u.items||[]).reduce((s,it)=>s + (it.mineBoost||0),0)
    const foundBase = Math.floor(30 + Math.random()*70 + calcPower(u)/2)
    const found = Math.floor(foundBase * (1 + Math.min(boost,1)))
    u.coins = (u.coins||0) + found
    const mined = Math.floor(Math.random()*3 + 1)
    u.materials.minerio = (u.materials.minerio||0) + mined
    u.xp = (u.xp||0) + 12
    u.cooldowns.minerar = now + 45*1000
    await saveDB()
    await sock.sendMessage(chatId, { text:`⛏️ Você minerou e ganhou ${found} coins + materiais. Minério +${mined}.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='cacar'){
    const u = await getUser(sender)
    const now = Date.now(); u.cooldowns ||= {}
    if ((u.cooldowns.cacar||0) > now){ await sock.sendMessage(chatId, { text:`Caça em cooldown. Tente novamente em ${Math.ceil((u.cooldowns.cacar-now)/1000)}s.` }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const boost = (u.items||[]).reduce((s,it)=>s + (it.huntBoost||0),0)
    const lootBase = Math.floor(20 + Math.random()*60 + calcPower(u)/2)
    const loot = Math.floor(lootBase * (1 + Math.min(boost,1)))
    u.coins = (u.coins||0) + loot
    const meat = Math.floor(Math.random()*2 + 1)
    u.materials.carne = (u.materials.carne||0) + meat
    u.xp = (u.xp||0) + 14
    u.cooldowns.cacar = now + 60*1000
    await saveDB()
    await sock.sendMessage(chatId, { text:`🏹 Você saiu para caçar e ganhou ${loot} coins + carne. Carne +${meat}.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='plantar' && !arg[0]){
    const u = await getUser(sender)
    const now = Date.now(); u.cooldowns ||= {}
    if ((u.cooldowns.plantar||0) > now){ await sock.sendMessage(chatId, { text:`Sua plantação precisa de tempo. Tente de novo em ${Math.ceil((u.cooldowns.plantar-now)/1000)}s.` }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const boost = (u.items||[]).reduce((s,it)=>s + (it.plantBoost||0),0)
    const gainBase = Math.floor(25 + Math.random()*55)
    const gain = Math.floor(gainBase * (1 + Math.min(boost,1)))
    u.coins = (u.coins||0) + gain
    const herbs = Math.floor(Math.random()*3 + 1)
    u.materials.erva = (u.materials.erva||0) + herbs
    u.xp = (u.xp||0) + 10
    u.cooldowns.plantar = now + 90*1000
    await saveDB()
    await sock.sendMessage(chatId, { text:`🌿 Você plantou e colheu ervas. Ganhou ${gain} coins + ervas. Ervas +${herbs}.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='explorar'){
    const u = await getUser(sender); const now = Date.now(); u.cooldowns ||= {}
    if ((u.cooldowns.explorar||0) > now){ await sock.sendMessage(chatId, { text:`Exploração em cooldown. Tente novamente em ${Math.ceil((u.cooldowns.explorar-now)/1000)}s.` }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const power = calcPower(u), defense = calcDefense(u)
    const boost = (u.items||[]).reduce((s,it)=>s + ((it.exploreBoost||0) + (it.boost||0)),0)
  const isBoss = Math.random() < 0.12
  const foundHiddenDungeon = !isBoss && Math.random() < 0.16
    let textRes = ''
    if (isBoss){
      const bossPower = 45, bossDefense = 25
      if (power + 10 + Math.floor(calcPrecision(u)*10) > bossPower){
              const reward = 150 + Math.floor(Math.random()*120)
        u.coins = (u.coins||0)+reward
        u.xp = (u.xp||0)+30
        u.bossesDefeated = (u.bossesDefeated||0)+1
        textRes = `🛡️ Você enfrentou um boss secreto e venceu! +${reward} coins, +30 XP.`
      } else {
        const loss = Math.min(u.coins||0, 80)
        u.coins = (u.coins||0)-loss
        textRes = `💀 Você encontrou um boss secreto e escapou por pouco. Perdeu ${loss} coins.`
      }
  } else if (foundHiddenDungeon){
    const monsters = 1 + Math.floor(Math.random()*3)
    const dungeonPower = 22 + monsters * 10 + Math.floor(Math.random()*12)
    const dungeonScore = power + defense + Math.floor(Math.random()*20)
    if (dungeonScore >= dungeonPower){
      const rewardCoins = 90 + Math.floor(Math.random()*110)
      const rewardXp = 20 + monsters * 6
      const rewardMaterials = 1 + Math.floor(Math.random()*2)
      u.coins = (u.coins||0) + rewardCoins
      u.xp = (u.xp||0) + rewardXp
      u.materials.pedra = (u.materials.pedra||0) + rewardMaterials
      u.bossesDefeated = (u.bossesDefeated||0) + 1
      textRes = `🕳️ Você encontrou uma masmorra escondida com ${monsters} monstro(s) e venceu! +${rewardCoins} coins, +${rewardXp} XP, materiais +${rewardMaterials}.`
    } else {
      const loss = Math.min(u.coins||0, 30 + monsters * 15)
      u.coins = (u.coins||0) - loss
      u.xp = (u.xp||0) + 8
      textRes = `💥 Você achou uma masmorra escondida com ${monsters} monstro(s), mas perdeu a luta e fugiu. Perdeu ${loss} coins e ganhou +8 XP por sobreviver.`
    }
    } else {
      const rewardBase = 40 + Math.floor(Math.random()*80 + power/2)
      const reward = Math.floor(rewardBase * (1 + Math.min(boost,1)))
      u.coins = (u.coins||0)+reward
      u.materials.pedra = (u.materials.pedra||0) + Math.floor(Math.random()*3+1)
      u.xp = (u.xp||0)+18
    textRes = `🧭 Exploração completa! Ganhou ${reward} coins, +18 XP e materiais.`
    }
    u.explores = (u.explores||0)+1
    u.cooldowns.explorar = now + 120*1000
    await saveDB()
    await sock.sendMessage(chatId, { text: textRes }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='masmorra'){
    const u = await getUser(sender); const now = Date.now(); u.cooldowns ||= {}
    if ((u.cooldowns.masmorra||0) > now){ await sock.sendMessage(chatId, { text:`Você já entrou na masmorra recentemente. Tente em ${Math.ceil((u.cooldowns.masmorra-now)/1000)}s.` }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const difficulty = 18 + Math.floor(Math.random()*20)
    const score = calcPower(u) + Math.floor(Math.random()*20) + Math.round(calcResistance(u)*10)
    let result=''
    if (score > difficulty){
      const reward = 80 + Math.floor(Math.random()*140)
      u.coins = (u.coins||0) + reward
      u.materials.erva = (u.materials.erva||0) + 1
      u.xp = (u.xp||0)+22
      result = `🏹 Você venceu a masmorra! Ganhou ${reward} coins e ervas.`
    } else {
      const loss = Math.min(u.coins||0, 60)
      u.coins = (u.coins||0) - loss
      result = `⚔️ Você perdeu na masmorra e fugiu ferido. Perdeu ${loss} coins.`
    }
    u.cooldowns.masmorra = now + 180*1000
    await saveDB()
    await sock.sendMessage(chatId, { text: result }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='profissao' || cmd==='profissoes' || cmd==='job'){
    const q = arg.join(' ').trim().toLowerCase()
    if (!q){
      await sock.sendMessage(chatId, { text:`💼 ㅤ   ▬▬▬ㅤ
GOJO — ESCOLHA SUA CARREIRA
ㅤ 👁️👁️ㅤ  "Trabalhe enquanto eu como doces."  ㅤ .

┌──────────────────────┐
ㅤ  Afinal, alguem tem que pagar as
ㅤ  contas, certo? Escolha uma das
ㅤ  profissoes abaixo para começar
ㅤ  a faturar seus coins. 💸✨
└──────────────────────┘

▰▰  CARREIRAS DISPONÍVEIS:

1️⃣  ╰  Programador(a) 💻
ㅤ   Ganhos altos, mas o estresse é infinito.
ㅤ   Salário: 320 coins.

2️⃣  ╰  Cozinheiro(a) 🧁
ㅤ   Faça doces bons o suficiente pra mim.
ㅤ   Salário: 240 coins.

3️⃣  ╰  Segurança Particular 🛡️
ㅤ   Tente ser 1% do que eu sou protegendo.
ㅤ   Salário: 280 coins.

4️⃣  ╰  Investigador(a) 🔍
ㅤ   Procure problemas onde ninguém mais vê.
ㅤ   Salário: 260 coins.

5️⃣  ╰  Engenheiro(a) 🏗️
ㅤ   Construa coisas que eu não vá destruir.
ㅤ   Salário: 300 coins.

6️⃣  ╰  Caçador(a) de Recompensa ⚔️
ㅤ   Para quem gosta de perigo e grana fácil.
ㅤ   Salário: 290 coins.

7️⃣  ╰  Empresário(a) 💎
ㅤ   Comande os outros enquanto lucra alto.
ㅤ   Salário: 330 coins.

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🔵 Use .profissao <nome> ou .profissoes <nome> para escolher.
🔵 Sua profissão é permanente até você trocar de novo.
🔵 Voltando? Use .work uma vez por hora para receber coins.
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    const prof = findProfession(q)
    if (!prof){
      await sock.sendMessage(chatId, { text:'Profissão não encontrada. Use .profissao ou .profissoes para ver as opções.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }

    const u = await getUser(sender)
    u.job = prof.id
    await saveDB()
    await sock.sendMessage(chatId, { text:`✅ Você agora é ${prof.name}! Salário: ${prof.salary} coins. Bônus: +${prof.powerBoost} ATK, +${prof.defenseBoost} DEF.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='classe'){
    const q = arg.join(' ').trim()
    if (!q){
      await sock.sendMessage(chatId, { text:`🪐 ㅤ   ▬▬▬ㅤ
GOJO — CLASSES & ATRIBUTOS
ㅤ 👁️👁️ㅤ  "Aqui estao os numeros. Nao erre a conta."  ㅤ .

┌──────────────────────┐
ㅤ  Cada classe te da uma vantagem
ㅤ  real em combate. Escolha o que
ㅤ  mais combina com voce e tente
ㅤ  nao ser derrotado no primeiro
ㅤ  round. 🍬✨
└──────────────────────┘

⚔️ ㅤ CLASSES E BONUS %:

1️⃣ ╰ GUERREIRO(A) ⚔️

ㅤ  Bônus: +20% em Força
ㅤ  (Esmague seus inimigos com poder bruto.)

2️⃣ ╰ GUARDIÃO(A) 🛡️

ㅤ  Bônus: +25% em Defesa
ㅤ  (Nada atravessa sua guarda absoluta.)

3️⃣ ╰ LADRÃO(A) 👣

ㅤ  Bônus: +20% em Agilidade
ㅤ  (Seja mais rápido que os olhos deles.)

4️⃣ ╰ ARQUEIRO(A) 🏹

ㅤ  Bônus: +15% em Precisão
ㅤ  (Acerte o alvo antes dele te ver.)

5️⃣ ╰ APOSTADOR(A) 🃏

ㅤ  Bônus: +30% em Sorte
ㅤ  (O caos está ao seu lado. Jogue os dados.)

6️⃣ ╰ LUTADOR(A) 🥊

ㅤ  Bônus: +15% em Resistência
ㅤ  (Aguente o castigo e continue de pé.)

7️⃣ ╰ NINJA 💨

ㅤ  Bônus: +20% em Velocidade de Escape
ㅤ  (Fuja do perigo como se fosse fumaça.)

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🔵 STATUS: Use .classe <numero> para ativar o bônus!
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }
    const numeric = q.match(/\d+/)?.[0]
    const normalized = normalizeJobName(q)
    const sel =
      (numeric ? CLASSES[parseInt(numeric, 10) - 1] : null) ||
      findClass(q) ||
      CLASSES.find(c => normalizeJobName(c.name) === normalized || normalizeJobName(c.id) === normalized)
    if (!sel){
      await sock.sendMessage(chatId, { text:`Classe inválida. Use .classe ou .classe 1 a 7.

1. Guerreiro(a)
2. Guardião(a)
3. Ladrão(a)
4. Arqueiro(a)
5. Apostador(a)
6. Lutador(a)
7. Ninja` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    const u = await getUser(sender)
    u.classe = sel.id
    await saveDB()
    await sock.sendMessage(chatId, { text:`✅ Classe ativada: ${sel.name}! Bônus: ${sel.bonus}. ${sel.description}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='salario' || cmd==='payday'){
    const u = await getUser(sender)
    const prof = getProfession(u)
    if (!prof){ await sock.sendMessage(chatId, { text:'Você ainda não escolheu uma profissão. Use .profissao <nome> ou .profissoes <nome> para escolher uma.' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const now = Date.now(); const next = (u.lastSalaryAt||0) + 60*60*1000
    if (now < next){ await sock.sendMessage(chatId, { text:`⏳ Salário disponível em ${Math.ceil((next-now)/60000)} minutos.` }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const salaryBoost = (u.items||[]).reduce((s,it)=>s + (it.salarioBoost||0),0)
    const salary = Math.floor(prof.salary * (1 + Math.min(salaryBoost,1)))
    u.coins = (u.coins||0) + salary
    u.xp = (u.xp||0) + 12
    u.lastSalaryAt = now
    await saveDB()
    await sock.sendMessage(chatId, { text:`💼 Salário recebido: ${salary} coins. Você também ganhou +12 XP.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='equipar'){
    const itemName = arg.join(' ').toLowerCase()
    if (!itemName){ await sock.sendMessage(chatId, { text:'Use: .equipar <nome_do_item>' }, { quoted: msg }); return }
    const u = await getUser(sender)
    const item = (u.items||[]).find(i => i.name.toLowerCase() === itemName)
    if (!item){ await sock.sendMessage(chatId, { text:'Item não encontrado no seu inventário.' }, { quoted: msg }); return }
    u.equipped = item.name
    await saveDB()
    await sock.sendMessage(chatId, { text:`✅ Você equipou: ${item.name}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='clan'){
    const sub = arg[0]?.toLowerCase()
    const clanName = arg.slice(1).join(' ').trim()
    const u = await getUser(sender)
    await db_mod.read(); db_mod.data.clans ||= {}

    if (!sub){
      const current = u.clan ? `Seu clã: ${db_mod.data.clans[u.clan]?.name || u.clan}` : 'Você ainda não está em um clã.'
      await sock.sendMessage(chatId, { text:`🛡️ COMANDOS DE CLÃ
${current}
Use .clan criar <nome> | entrar <nome> | sair | info [nome] | membros [nome]` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    if (sub==='criar' || sub==='create'){
      if (!clanName){ await sock.sendMessage(chatId, { text:'Use: .clan criar <nome>' }, { quoted: msg }); return }
      if (u.clan){ await sock.sendMessage(chatId, { text:'Você já pertence a um clã. Use .clan sair antes.' }, { quoted: msg }); return }
      const clanId = normalizeClanId(clanName)
      if (!clanId){ await sock.sendMessage(chatId, { text:'Nome de clã inválido.' }, { quoted: msg }); return }
      if (db_mod.data.clans[clanId]){ await sock.sendMessage(chatId, { text:'Esse clã já existe. Escolha outro nome.' }, { quoted: msg }); return }
      db_mod.data.clans[clanId] = { id: clanId, name: clanName, owner: sender, members:[sender], createdAt: Date.now(), warChallengeTo:null, wins:0, losses:0 }
      u.clan = clanId
      await saveDB(); await saveClans()
      await sock.sendMessage(chatId, { text:`🏰 Clã criado: ${clanName}. Você agora é o líder.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    if (sub==='entrar' || sub==='join'){
      if (!clanName){ await sock.sendMessage(chatId, { text:'Use: .clan entrar <nome>' }, { quoted: msg }); return }
      if (u.clan){ await sock.sendMessage(chatId, { text:'Você já pertence a um clã. Use .clan sair antes.' }, { quoted: msg }); return }
      const clanId = normalizeClanId(clanName)
      const clan = db_mod.data.clans[clanId]
      if (!clan){ await sock.sendMessage(chatId, { text:'Clã não encontrado.' }, { quoted: msg }); return }
      clan.members.push(sender)
      u.clan = clanId
      await saveDB(); await saveClans()
      await sock.sendMessage(chatId, { text:`✅ Você entrou no clã ${clan.name}.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    if (sub==='sair' || sub==='leave'){
      if (!u.clan){ await sock.sendMessage(chatId, { text:'Você não pertence a nenhum clã.' }, { quoted: msg }); return }
      const clan = db_mod.data.clans[u.clan]
      if (!clan){ u.clan = null; await saveDB(); await sock.sendMessage(chatId, { text:'Seu clã não existe mais. Você saiu.' }, { quoted: msg }); return }
      clan.members = clan.members.filter(id=>id !== sender)
      if (clan.owner === sender){
        if (clan.members.length){ clan.owner = clan.members[0] }
        else { delete db_mod.data.clans[clan.id] }
      }
      u.clan = null
      await saveDB(); await saveClans()
      await sock.sendMessage(chatId, { text:'Você saiu do clã.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    if (sub==='info' || sub==='detalhes'){
      const clanId = clanName ? normalizeClanId(clanName) : u.clan
      const clan = db_mod.data.clans[clanId]
      if (!clan){ await sock.sendMessage(chatId, { text:'Clã não encontrado.' }, { quoted: msg }); return }
      await sock.sendMessage(chatId, { text:`🏰 CLÃ ${clan.name}
Líder: ${clan.owner}
Membros: ${clan.members.length}
Vitórias: ${clan.wins}
Derrotas: ${clan.losses}
Desafio em aberto: ${clan.warChallengeTo ? db_mod.data.clans[clan.warChallengeTo]?.name || clan.warChallengeTo : 'Nenhum'}` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    if (sub==='membros' || sub==='members'){
      const clanId = clanName ? normalizeClanId(clanName) : u.clan
      const clan = db_mod.data.clans[clanId]
      if (!clan){ await sock.sendMessage(chatId, { text:'Clã não encontrado.' }, { quoted: msg }); return }
      const names = clan.members.map((id,i)=>`${i+1}. ${id}`).join('\n') || 'Nenhum membro.'
      await sock.sendMessage(chatId, { text:`👥 MEMBROS DO CLÃ ${clan.name}
${names}` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    await sock.sendMessage(chatId, { text:'Uso do clã: .clan criar|entrar|sair|info|membros' }, { quoted: msg })
    return
  }

  if (cmd==='guerra'){
    const action = arg[0]?.toLowerCase()
    const targetName = arg.slice(1).join(' ').trim()
    const u = await getUser(sender)
    await db_mod.read(); db_mod.data.clans ||= {}

    if (!action){
      await sock.sendMessage(chatId, { text:'Use: .guerra desafiar <clã> ou .guerra aceitar <clã>' }, { quoted: msg })
      return
    }
    if (!u.clan){ await sock.sendMessage(chatId, { text:'Você precisa fazer parte de um clã para usar guerra.' }, { quoted: msg }); return }
    const myClan = db_mod.data.clans[u.clan]
    if (!myClan){ u.clan = null; await saveDB(); await sock.sendMessage(chatId, { text:'Seu clã não existe mais. Você foi removido.' }, { quoted: msg }); return }
    if (action==='desafiar' || action==='challenge'){
      if (!targetName){ await sock.sendMessage(chatId, { text:'Use: .guerra desafiar <clã>' }, { quoted: msg }); return }
      const targetClanId = normalizeClanId(targetName)
      if (targetClanId === myClan.id){ await sock.sendMessage(chatId, { text:'Você não pode desafiar seu próprio clã.' }, { quoted: msg }); return }
      const targetClan = db_mod.data.clans[targetClanId]
      if (!targetClan){ await sock.sendMessage(chatId, { text:'Clã alvo não existe.' }, { quoted: msg }); return }
      myClan.warChallengeTo = targetClanId
      await saveClans()
      await sock.sendMessage(chatId, { text:`⚔️ Seu clã ${myClan.name} desafiou ${targetClan.name} para a guerra! Aguarde aceitação.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }
    if (action==='aceitar' || action==='accept'){
      if (!targetName){ await sock.sendMessage(chatId, { text:'Use: .guerra aceitar <clã>' }, { quoted: msg }); return }
      const challengerClanId = normalizeClanId(targetName)
      const challengerClan = db_mod.data.clans[challengerClanId]
      if (!challengerClan){ await sock.sendMessage(chatId, { text:'Clã desafiador não existe.' }, { quoted: msg }); return }
      if (challengerClan.warChallengeTo !== myClan.id){ await sock.sendMessage(chatId, { text:'Não há desafio aberto desse clã contra o seu.' }, { quoted: msg }); return }
      const myPower = (myClan.members||[]).reduce((sum,id)=>{ const m = db_mod.data.users[id]; return sum + (m ? calcPower(m) : 0) }, 0)
      const enemyPower = (challengerClan.members||[]).reduce((sum,id)=>{ const m = db_mod.data.users[id]; return sum + (m ? calcPower(m) : 0) }, 0)
      const winner = myPower >= enemyPower ? myClan : challengerClan
      const loser = winner === myClan ? challengerClan : myClan
      winner.wins = (winner.wins||0) + 1
      loser.losses = (loser.losses||0) + 1
      challengerClan.warChallengeTo = null
      myClan.warChallengeTo = null
      await saveClans()
      await sock.sendMessage(chatId, { text:`🏆 Guerra concluída! ${winner.name} venceu com ${winner === myClan ? 'seu clã' : 'o clã inimigo'}.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }
    await sock.sendMessage(chatId, { text:'Uso: .guerra desafiar <clã> ou .guerra aceitar <clã>' }, { quoted: msg })
    return
  }

  if (cmd==='plantarmenu' || cmd==='plantarselect'){
    const list = PLANTS.map(p => `• ${p.id} — ${p.name} (custa ${p.cost} coins, vende por ${p.sellPrice})`).join('\n')
    await sock.sendMessage(chatId, { text:`🌱 MENU DE PLANTAS\n\n${list}\n\nUse: .plantar <id_daPlanta> ou .plantarmenu` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='plantar' && arg[0]){
    const plantId = arg[0].toLowerCase()
    const plant = PLANTS.find(p => p.id === plantId)
    if (!plant){ await sock.sendMessage(chatId, { text:'Planta não encontrada. Use .plantarmenu' }, { quoted: msg }); return }
    const u = await getUser(sender)
    if ((u.coins||0) < plant.cost){ await sock.sendMessage(chatId, { text:`Você precisa de ${plant.cost} coins para plantar ${plant.name}.` }, { quoted: msg }); return }
    u.coins -= plant.cost
    u.plants = u.plants || {}
    u.plants[plantId] = (u.plants[plantId]||0) + 1
    await saveDB()
    await sock.sendMessage(chatId, { text:`🌱 Você plantou ${plant.name}! Crescerá em ${Math.ceil(plant.time/60000)} minutos.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='vender'){
    const item = arg[0]?.toLowerCase() || ''
    const plant = PLANTS.find(p => p.id === item)
    if (!plant){ await sock.sendMessage(chatId, { text:'Use: .vender <tomate|cenoura|melancia|abobora>' }, { quoted: msg }); return }
    const u = await getUser(sender)
    const qty = u.plants?.[plant.id] || 0
    if (qty <= 0){ await sock.sendMessage(chatId, { text:`Você não tem ${plant.name} para vender.` }, { quoted: msg }); return }
    const amount = qty * plant.sellPrice
    u.coins = (u.coins||0) + amount
    u.plants[plant.id] = 0
    await saveDB()
    await sock.sendMessage(chatId, { text:`💰 Vendeu ${qty} ${plant.name} por ${amount} coins!` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='casar'){
    if (!isGroup){ await sock.sendMessage(chatId, { text:'Use esse comando em grupo.' }, { quoted: msg }); return }
    const targetNumbers = [...new Set(arg
      .filter(x => x.includes('@'))
      .map(x => x.replace(/[^0-9]/g,''))
      .filter(Boolean))]
    if (!targetNumbers.length || targetNumbers.length > 2){
      await sock.sendMessage(chatId, { text:'Use: .casar @user ou .casar @user1 @user2 (casamento a 3).' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }

    const participants = [sender, ...targetNumbers.map(toNumberJid)]
    const uniqueParticipants = [...new Set(participants)]
    if (uniqueParticipants.length !== participants.length){
      await sock.sendMessage(chatId, { text:'Você não pode repetir pessoas na proposta de casamento.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }

    for (const jid of uniqueParticipants){
      const u = await getUser(jid)
      if (normalizeMarriedList(u.marriedTo).length){
        await sock.sendMessage(chatId, { text:`@${jidToNumber(jid)} já está em um casamento.`, mentions:[jid] }, { quoted: msg })
        await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
        return
      }
    }

    const activeProposal = marriageProposals.get(chatId)
    if (activeProposal){
      await sock.sendMessage(chatId, { text:'Já existe um pedido de casamento pendente neste grupo. Responda com .sim ou .nao.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }

    const targets = uniqueParticipants.slice(1)
    const proposal = {
      proposer: sender,
      participants: uniqueParticipants,
      targets,
      accepted: new Set([sender]),
      createdAt: Date.now()
    }
    marriageProposals.set(chatId, proposal)

    const user1 = jidToNumber(sender)
    const mentions = uniqueParticipants
    const proposalTargetsLine = targets.map(jid => `@${jidToNumber(jid)}`).join(', ')
    const inviteLine = targets.length === 1
      ? `ㅤ  @${jidToNumber(targets[0])}, o @${user1}`
      : `ㅤ  ${proposalTargetsLine}, o @${user1}`

    const proposalText = `💍 ㅤ   ▬▬▬ㅤ
CONTRATO DE VÍNCULO
ㅤ 👁️👁️ㅤ  "E aí? Vai aceitar ou vai fugir?"  ㅤ .

┌──────────────────────┐
${inviteLine}
ㅤ  quer selar um destino com
ㅤ  voce. O que me diz? Nao me
ㅤ  faça perder tempo esperando. 🍬
└──────────────────────┘

💞 ㅤ A PROPOSTA:
ㅤ ╰  Proponente: @${user1}
ㅤ ╰  Destinatário(s): ${proposalTargetsLine}

⚖️ ㅤ SUA DECISÃO:
ㅤ ╰  Para aceitar use: .sim ✅
ㅤ ╰  Para recusar use: .nao ❌

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
"Escolha logo. Se demorar muito, eu decido por vocês... e voce nao vai gostar."
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢`
    await sock.sendMessage(chatId, { text: proposalText, mentions }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='sim' || cmd==='nao'){
    const proposal = marriageProposals.get(chatId)
    if (!proposal){
      await sock.sendMessage(chatId, { text:'Não há pedido de casamento pendente neste grupo.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    if (!proposal.participants.includes(sender)){
      await sock.sendMessage(chatId, { text:'Somente pessoas envolvidas no pedido podem responder.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }

    if (cmd==='nao'){
      marriageProposals.delete(chatId)
      await sock.sendMessage(chatId, { text:`❌ Pedido de casamento recusado por @${jidToNumber(sender)}.`, mentions:[sender] }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }

    if (proposal.accepted.has(sender)){
      await sock.sendMessage(chatId, { text:'Você já confirmou com .sim.' }, { quoted: msg })
      return
    }

    proposal.accepted.add(sender)
    const pending = proposal.participants.filter(jid => !proposal.accepted.has(jid))
    if (pending.length){
      await sock.sendMessage(chatId, {
        text:`✅ @${jidToNumber(sender)} confirmou.
Aguardando: ${pending.map(jid => `@${jidToNumber(jid)}`).join(', ')}`,
        mentions:[sender, ...pending]
      }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }

    for (const jid of proposal.participants){
      const u = await getUser(jid)
      const current = normalizeMarriedList(u.marriedTo)
      const partners = proposal.participants.filter(x => x !== jid)
      u.marriedTo = [...new Set([...current, ...partners])]
      setMaritalStatusLabel(u)
    }
    await saveDB()
    marriageProposals.delete(chatId)

    await sock.sendMessage(chatId, {
      text:`💞 Casamento confirmado com consenso de todos!\nParticipantes: ${proposal.participants.map(jid => `@${jidToNumber(jid)}`).join(', ')}`,
      mentions: proposal.participants
    }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='divorciar'){
    const u = await getUser(sender)
    const partners = normalizeMarriedList(u.marriedTo)
    if (!partners.length){ await sock.sendMessage(chatId, { text:'Você não está casado.' }, { quoted: msg }); return }
    u.marriedTo = null
    setMaritalStatusLabel(u)
    for (const jid of partners){
      const partner = await getUser(jid)
      const list = normalizeMarriedList(partner.marriedTo).filter(x => x !== sender)
      partner.marriedTo = list.length ? list : null
      setMaritalStatusLabel(partner)
    }
    await saveDB()
    await sock.sendMessage(chatId, { text:'💔 Divórcio oficializado. Tudo terminado com dignidade.' }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='trair'){
    const u = await getUser(sender)
    const leftParts = []
    const partners = normalizeMarriedList(u.marriedTo)
    if (partners.length){
      leftParts.push('casamento')
      u.marriedTo = null
      setMaritalStatusLabel(u)
      for (const jid of partners){
        const partner = await getUser(jid)
        const list = normalizeMarriedList(partner.marriedTo).filter(x => x !== sender)
        partner.marriedTo = list.length ? list : null
        setMaritalStatusLabel(partner)
      }
      u.betrayalTitle = 'Corno(a)'
    }
    await db_mod.read(); db_mod.data.clans ||= {}
    if (u.clan){
      const clan = db_mod.data.clans[u.clan]
      if (clan){
        clan.members = clan.members.filter(id=>id !== sender)
        if (clan.owner === sender){
          if (clan.members.length){ clan.owner = clan.members[0] }
          else { delete db_mod.data.clans[clan.id] }
        }
      }
      u.clan = null
      leftParts.push('clã')
      u.betrayalTitle = u.betrayalTitle ? `${u.betrayalTitle} do clã` : 'Traidor(a) do clã'
      await saveClans()
    }
    if (!leftParts.length){ await sock.sendMessage(chatId, { text:'Você precisa estar casado ou em um clã para trair.' }, { quoted: msg }); return }
    await saveDB()
    await sock.sendMessage(chatId, { text:`💔 Você traiu seu ${leftParts.join(' e ')}. Seu título agora é: ${u.betrayalTitle}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='adotar'){
    const u = await getUser(sender)
    if (!normalizeMarriedList(u.marriedTo).length){ await sock.sendMessage(chatId, { text:'Você precisa estar casado para adotar!' }, { quoted: msg }); return }
    if ((u.coins||0) < 500){ await sock.sendMessage(chatId, { text:'Você precisa de 500 coins para adotar.' }, { quoted: msg }); return }
    u.coins -= 500
    const childName = `Filho${u.children?.length || 0 + 1}`
    u.children = u.children || []
    u.children.push(childName)
    await saveDB()
    await sock.sendMessage(chatId, { text:`👶 Parabéns! Você adotou ${childName}!` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='pix' || cmd==='enviar'){
    const target = arg[0] || ''
    const amount = parseInt(arg[1]||'0', 10)
    if (!target || !amount){ await sock.sendMessage(chatId, { text:'Use: .pix @user <quantidade>' }, { quoted: msg }); return }
    const u = await getUser(sender)
    if ((u.coins||0) < amount){ await sock.sendMessage(chatId, { text:'Saldo insuficiente.' }, { quoted: msg }); return }
    const receiver = await getUser(target)
    u.coins -= amount
    receiver.coins = (receiver.coins || 0) + amount
    await saveDB()
    await sock.sendMessage(chatId, { text:`✅ Você enviou ${amount} coins para ${target}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (['rank','rankxp','rankcoins','rankricos','rankbanco','rankbank','rankpoder','rankativos','rankghost','rankinativo','inativos','topinativos','rankprof','rankprofissao','rankpau','rankgostosos'].includes(cmd)){
    if (!isGroup){
      await sock.sendMessage(chatId, { text:'Use esse comando em grupo.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }

    const meta = await sock.groupMetadata(chatId)
    const members = [...new Set(meta.participants.map(p => p.id))]
    const stats = []
    for (const id of members){
      const u = await getUser(id)
      stats.push({
        id,
        xp: u.xp || 0,
        level: u.level || lvlForXP(u.xp || 0),
        coins: u.coins || 0,
        bank: u.bank || 0,
        power: calcPower(u),
        lastActive: u.lastActive || 0,
        job: u.job || null
      })
    }

    const senderStat = stats.find(x => x.id === sender) || { xp:0, level:1, coins:0, bank:0, power:0, lastActive:0 }
    const senderPosBy = (arr) => Math.max(1, arr.findIndex(x => x.id === sender) + 1)
    const topLinesFrom = (arr, fn) => arr.slice(0, 5).map((x, i) => `ㅤ ╰ ${i+1}. @${jidToNumber(x.id)} — ${fn(x)}`)

    let title = 'RANKING — GOJO'
    let quote = 'Tentem não me decepcionar.'
    let topLines = []
    let statusLines = []
    let mentions = []

    if (cmd==='rank' || cmd==='rankxp'){
      const base = cmd==='rank'
        ? [...stats].sort(() => Math.random() - 0.5).slice(0, Math.min(5, stats.length)).sort((a,b)=>b.xp-a.xp)
        : [...stats].sort((a,b)=>b.xp-a.xp)
      title = cmd==='rank' ? 'RANKING DE PODER — GOJO' : 'RANKING DE XP — GOJO'
      quote = cmd==='rank' ? 'Quem são os menos inúteis hoje?' : 'Experiência não mente.'
      topLines = topLinesFrom(base, x => `${x.xp} XP`)
      const ref = [...stats].sort((a,b)=>b.xp-a.xp)
      statusLines = [
        `ㅤ ╰ Sua posição: ${senderPosBy(ref)}º`,
        `ㅤ ╰ Seu nível: ${senderStat.level}`,
        `ㅤ ╰ Progresso: ${progressBar((senderStat.xp % 100), 100)} ${(senderStat.xp % 100)}%`
      ]
      mentions = base.slice(0,5).map(x => x.id)
    } else if (cmd==='rankcoins' || cmd==='rankricos'){
      const sorted = [...stats].sort((a,b)=>b.coins-a.coins)
      title = 'RANKING DE COINS — GOJO'
      quote = 'Dinheiro não compra classe... mas ajuda.'
      topLines = topLinesFrom(sorted, x => `${x.coins} coins`)
      statusLines = [
        `ㅤ ╰ Sua posição: ${senderPosBy(sorted)}º`,
        `ㅤ ╰ Sua carteira: ${senderStat.coins} coins`,
        `ㅤ ╰ Meta de luxo: ${progressBar(Math.min(senderStat.coins, 10000), 10000)} ${Math.min(100, Math.floor((senderStat.coins/10000)*100))}%`
      ]
      mentions = sorted.slice(0,5).map(x => x.id)
    } else if (cmd==='rankbanco' || cmd==='rankbank'){
      const sorted = [...stats].sort((a,b)=>b.bank-a.bank)
      title = 'RANKING DE BANCO — GOJO'
      quote = 'Guardar também é poder.'
      topLines = topLinesFrom(sorted, x => `${x.bank} bank`)
      statusLines = [
        `ㅤ ╰ Sua posição: ${senderPosBy(sorted)}º`,
        `ㅤ ╰ Seu saldo banco: ${senderStat.bank}`,
        `ㅤ ╰ Reserva: ${progressBar(Math.min(senderStat.bank, 20000), 20000)} ${Math.min(100, Math.floor((senderStat.bank/20000)*100))}%`
      ]
      mentions = sorted.slice(0,5).map(x => x.id)
    } else if (cmd==='rankpoder'){
      const sorted = [...stats].sort((a,b)=>b.power-a.power)
      title = 'RANKING DE PODER BRUTO — GOJO'
      quote = 'Agora sim algo divertido.'
      topLines = topLinesFrom(sorted, x => `${x.power} de força`)
      statusLines = [
        `ㅤ ╰ Sua posição: ${senderPosBy(sorted)}º`,
        `ㅤ ╰ Seu poder: ${senderStat.power}`,
        `ㅤ ╰ Escala de ameaça: ${progressBar(Math.min(senderStat.power, 500), 500)} ${Math.min(100, Math.floor((senderStat.power/500)*100))}%`
      ]
      mentions = sorted.slice(0,5).map(x => x.id)
    } else if (cmd==='rankativos'){
      const sorted = [...stats].sort((a,b)=>b.lastActive-a.lastActive)
      title = 'RANKING DOS MAIS ATIVOS — GOJO'
      quote = 'Pelo menos alguém está acordado.'
      topLines = topLinesFrom(sorted, x => x.lastActive ? `ativo há ${timeSince(x.lastActive)}` : 'sem atividade')
      statusLines = [
        `ㅤ ╰ Sua posição: ${senderPosBy(sorted)}º`,
        `ㅤ ╰ Última atividade: ${senderStat.lastActive ? timeSince(senderStat.lastActive) : 'sem registro'}`,
        `ㅤ ╰ Frequência: ${progressBar(Math.min(Date.now()-senderStat.lastActive, 24*60*60*1000), 24*60*60*1000)} recente`
      ]
      mentions = sorted.slice(0,5).map(x => x.id)
    } else if (cmd==='rankghost' || cmd==='rankinativo' || cmd==='inativos' || cmd==='topinativos'){
      const sorted = [...stats].sort((a,b)=>(a.lastActive||0)-(b.lastActive||0))
      title = 'RANKING DOS INATIVOS — GOJO'
      quote = 'Esses aqui só aparecem no velório.'
      topLines = topLinesFrom(sorted, x => x.lastActive ? `${timeSince(x.lastActive)} sem dar sinal` : 'nunca apareceu')
      statusLines = [
        `ㅤ ╰ Sua posição: ${senderPosBy(sorted)}º`,
        `ㅤ ╰ Seu sumiço: ${senderStat.lastActive ? timeSince(senderStat.lastActive) : 'nunca ativo'}`,
        `ㅤ ╰ Risco de ghost: ${progressBar(Math.min((Date.now()-senderStat.lastActive), 7*24*60*60*1000), 7*24*60*60*1000)} alto`
      ]
      mentions = sorted.slice(0,5).map(x => x.id)
    } else if (cmd==='rankprof' || cmd==='rankprofissao'){
      const byJob = {}
      for (const item of stats){
        if (!item.job) continue
        byJob[item.job] ||= { job:item.job, count:0, totalCoins:0 }
        byJob[item.job].count += 1
        byJob[item.job].totalCoins += item.coins
      }
      const sorted = Object.values(byJob).sort((a,b)=>b.totalCoins-a.totalCoins)
      title = 'RANKING DE PROFISSÕES — GOJO'
      quote = 'Quero ver quem trabalha de verdade.'
      topLines = sorted.slice(0,5).map((x,i)=>`ㅤ ╰ ${i+1}. ${x.job} — ${x.totalCoins} coins (${x.count} membros)`)
      statusLines = [
        `ㅤ ╰ Profissões no grupo: ${sorted.length}`,
        `ㅤ ╰ Seu job: ${senderStat.job || 'Nenhum'}`,
        `ㅤ ╰ Economia geral: ${stats.reduce((s,x)=>s+x.coins,0)} coins`
      ]
      mentions = []
    } else if (cmd==='rankpau' || cmd==='rankgostosos'){
      const targetNum = (arg[0] || '').replace(/[^0-9]/g, '')
      const targetJid = targetNum ? toNumberJid(targetNum) : null
      const pool = [...stats]
      const selected = []
      if (targetJid){
        const targetStat = pool.find(x => x.id === targetJid)
        if (targetStat) selected.push(targetStat)
      }
      while (selected.length < 5 && pool.length){
        const pickOne = pool.splice(Math.floor(Math.random()*pool.length), 1)[0]
        if (!selected.find(x => x.id === pickOne.id)) selected.push(pickOne)
      }
      const scored = selected.map(x => ({ ...x, score: Math.floor(Math.random()*101) })).sort((a,b)=>b.score-a.score)
      title = cmd==='rankpau' ? 'RANKPAU DO INFINITO — GOJO' : 'RANKGOSTOSOS DO INFINITO — GOJO'
      quote = 'Relatório 100% científico. Confia.'
      topLines = scored.map((x,i)=>`ㅤ ╰ ${i+1}. @${jidToNumber(x.id)} — ${x.score}%`)
      statusLines = [
        `ㅤ ╰ Sua posição: ${Math.max(1, scored.findIndex(x=>x.id===sender)+1)}º`,
        `ㅤ ╰ Sua nota: ${scored.find(x=>x.id===sender)?.score ?? Math.floor(Math.random()*101)}%`,
        `ㅤ ╰ Ego no talo: ${progressBar(99,100)} 99%`
      ]
      mentions = scored.map(x => x.id)
    }

    const rankText = renderGojoRankCard({
      title,
      quote,
      introLines: [
        'ㅤ  Aqui vai o relatório do momento,',
        'ㅤ  com dados frios e julgamento quente.',
        'ㅤ  Se ficou embaixo, treina mais.',
        'ㅤ  Se ficou em cima, não se ache. 🍬✨'
      ],
      topLines,
      statusLines,
      footer: '“Continue subindo... talvez um dia você chegue perto de mim.” — Satoru 🤞'
    })

    await sock.sendMessage(chatId, { text: rankText, mentions }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='ship' || cmd==='love' || cmd==='casal' || cmd==='kiss'){
    const targetAraw = arg[0] || ''
    const targetBraw = arg[1] || ''
    const n1 = targetAraw.replace(/[^0-9]/g,'')
    const n2 = targetBraw.replace(/[^0-9]/g,'')
    if (!n1 || !n2){ await sock.sendMessage(chatId, { text:'Use: .ship @user1 @user2' }, { quoted: msg }); return }

    const j1 = toNumberJid(n1)
    const j2 = toNumberJid(n2)
    const score = Math.floor(Math.random()*101)
    const filled = Math.max(0, Math.min(10, Math.floor(score / 10)))
    const bar = `[${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}]`
    const heart = score >= 80 ? '💖' : (score >= 50 ? '💘' : '💔')
    let verdictA = ''
    let verdictB = ''
    if (score >= 85){
      verdictA = 'Compatibilidade absurda. Ate eu aprovei.'
      verdictB = 'Se estragar isso, vai ser talento.'
    } else if (score >= 60){
      verdictA = 'Tem potencial, mas nao vacila.'
      verdictB = 'Com esforço, talvez vire algo lendário.'
    } else if (score >= 30){
      verdictA = 'Instável. Vai precisar de terapia e sorte.'
      verdictB = 'Ainda da pra salvar... talvez.'
    } else {
      verdictA = 'Nem com uma Expansão de Domínio.'
      verdictB = 'isso aqui tem jeito. Desistam.'
    }

    const shipText = `💞 ㅤ   ▬▬▬ㅤ
ANÁLISE DOS SIX EYES
ㅤ 👁️👁️ㅤ  "Deixa eu ver se isso vinga..."  ㅤ .

┌──────────────────────┐
ㅤ  Minha visão não engana. Analisei
ㅤ  a energia de vocês e o resultado
ㅤ  é... bem, vocês vão precisar de
ㅤ  um milagre. Ou de mim. 🍬✨
└──────────────────────┘

🔥 ㅤ O CASAL:

ㅤ ╰  @${jidToNumber(j1)} + @${jidToNumber(j2)}

📊 ㅤ COMPATIBILIDADE:

${bar} ${score}% ${heart}

⚖️ ㅤ VEREDITO:

ㅤ ╰  ${verdictA}
ㅤ ╰  ${verdictB}

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
“Sorte a de vocês que eu sou lindo o
bastante por todo esse grupo.” — Satoru 🤭
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
    await sock.sendMessage(chatId, { text: shipText, mentions:[j1, j2] }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='beijo' || cmd==='abraco' || cmd==='abraço' || cmd==='carinho'){
    const targetRaw = arg[0] || ''
    const num = targetRaw.replace(/[^0-9]/g,'')
    if (!num){
      await sock.sendMessage(chatId, { text:`Use: .${cmd} @user` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    const target = toNumberJid(num)
    const actor = `@${jidToNumber(sender)}`
    const dest = `@${jidToNumber(target)}`
    const map = {
      beijo: [`💋 ${actor} mandou um beijo poderoso para ${dest}.`, `💋 ${actor} beijou ${dest} e o grupo inteiro viu.`],
      abraco: [`🤗 ${actor} deu um abraço apertado em ${dest}.`, `🤗 ${actor} abraçou ${dest} com energia positiva.`],
      'abraço': [`🤗 ${actor} deu um abraço apertado em ${dest}.`, `🤗 ${actor} abraçou ${dest} com energia positiva.`],
      carinho: [`🫶 ${actor} encheu ${dest} de carinho.`, `🫶 ${actor} fez carinho em ${dest} e ficou fofo demais.`]
    }
    await sock.sendMessage(chatId, { text: pick(map[cmd] || map.carinho), mentions:[sender, target] }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='cantada'){
    const targetRaw = arg[0] || ''
    const num = targetRaw.replace(/[^0-9]/g,'')
    if (!num){
      await sock.sendMessage(chatId, { text:'Use: .cantada @user' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    const target = toNumberJid(num)
    const cantadas = [
      'Você não é domínio, mas expandiu meu coração.',
      'Se beleza fosse energia amaldiçoada, você seria infinito.',
      'Com você até cooldown passa rápido.',
      'Nem o Gojo resiste quando você aparece no chat.',
      'Você bugou meu sistema e eu nem quero patch.'
    ]
    const cantada = pick(cantadas)
    const caption = `😏 ㅤ   ▬▬▬ㅤ
EXPANSÃO DE DOMÍNIO: SEDUÇÃO
ㅤ 👁️👁️ㅤ  "Cuidado para não se apaixonar."  ㅤ .

┌──────────────────────┐
ㅤ  Eu sei, eu sei... é difícil
ㅤ  resistir a esse brilho todo.
ㅤ  Vou te dar uma palinha de como
ㅤ  se faz, vê se aprende. 🍬✨
└──────────────────────┘

🏹 ㅤ A CANTADA:

ㅤ ╰  “${cantada}”

🎯 ㅤ ALVO:

ㅤ ╰  @${jidToNumber(target)}

📈 ㅤ CHANCE DE SUCESSO:

[▰▰▰▰▰▰▰▰▰▱] 99.9%

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
“Funcionou, né? Eu já sabia. Sou
simplesmente o mais forte.” — Satoru 🤞
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
    await sendReactionImageCaption(chatId, msg, caption, [target])
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='poesia'){
    const poesias = [
      'No caos do chat, teu nome é calmaria; no barulho do mundo, tua voz é poesia.',
      'Entre estrelas e domínio, eu vi teu brilho primeiro.',
      'Se a noite cair, teu sorriso acende o caminho.',
      'No infinito do Gojo, ainda cabe você.'
    ]
    await sock.sendMessage(chatId, { text:`📜 Poesia aleatória:\n\n${pick(poesias)}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='musica' || cmd==='música'){
    const musicas = [
      '🎵 Satoru Vibes — Infinite Mood',
      '🎵 Jujutsu Beat — Domain Drop',
      '🎵 Lo-fi Feiticeiro — Night Shift',
      '🎵 Energia Amaldiçoada FM — Vol. 1',
      '🎵 Tokyo Neon — Hollow Purple Mix'
    ]
    await sock.sendMessage(chatId, { text:`🎶 Música aleatória pra você:\n${pick(musicas)}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (['chutar','matar','tapa','murro','xplodir'].includes(cmd)){
    const target = arg[0]||''
    const message = arg.slice(1).join(' ').trim()
    if (!target || !target.startsWith('@')){
      await sock.sendMessage(chatId, { text:`Use: .${cmd} @user <mensagem>` }, { quoted: msg }); return
    }
    const verbs = {
      chutar: 'chutou',
      matar: 'matou',
      tapa: 'deu um tapa em',
      murro: 'deu um murro em',
      xplodir: 'explodiu'
    }
    const action = verbs[cmd] || cmd
    const replyText = `💥 Você ${action} ${target}!${message ? `\n📝 Mensagem: ${message}` : ''}`
    await sock.sendMessage(chatId, { text: replyText }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='muta' || cmd==='desmut'){
    if (!isGroup){ await sock.sendMessage(chatId, { text:'Somente em grupo.' }, { quoted: msg }); return }
    const meta = await sock.groupMetadata(chatId)
    const admins = meta.participants.filter(p=>p.admin).map(p=>p.id)
    if (!admins.includes(sender)){ await sock.sendMessage(chatId, { text:'Apenas administradores podem usar este comando.' }, { quoted: msg }); return }
    const targetRaw = (arg[0]||'').replace(/[^0-9]/g,'')
    if (!targetRaw){ await sock.sendMessage(chatId, { text:`Use: .${cmd} @user` }, { quoted: msg }); return }
    const target = toNumberJid(targetRaw)
    const muted = new Set(groupSettings?.mutedUsers || [])
    if (cmd==='muta') muted.add(target)
    else muted.delete(target)
    await updateGroupSettings(chatId, { mutedUsers: Array.from(muted) })
    await sock.sendMessage(chatId, { text: cmd==='muta' ? `🔇 @${targetRaw} foi mutado neste bot.` : `🗣️ @${targetRaw} foi desmutado neste bot.`, mentions:[target] }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='ban'){
    if (!isGroup){ await sock.sendMessage(chatId, { text:'Somente em grupo.' }, { quoted: msg }); return }
    const meta = await sock.groupMetadata(chatId)
    const admins = meta.participants.filter(p=>p.admin).map(p=>p.id)
    if (!admins.includes(sender)){ await sock.sendMessage(chatId, { text:'Apenas administradores podem banir.' }, { quoted: msg }); return }
    const num = arg[0] && arg[0].replace(/[^0-9]/g,'')
    if (!num){ await sock.sendMessage(chatId, { text:'Use: .ban <numero_com_ddd>' }, { quoted: msg }); return }
    await sock.groupParticipantsUpdate(chatId, [toNumberJid(num)], 'remove')
    await sock.sendMessage(chatId, { text:`Usuário ${num} removido do grupo.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='plano'){
    if (!isGroup){ await sock.sendMessage(chatId, { text:'Esse recurso é para grupos.' }, { quoted: msg }); return }
    const meta = await sock.groupMetadata(chatId)
    const admins = meta.participants.filter(p=>p.admin).map(p=>p.id)
    if (!admins.includes(sender)){
      await sock.sendMessage(chatId, { text:'Apenas administradores podem usar .plano.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(4) Tentativa de Execução de Comandos Vips.mp3')
      return
    }
    const u = await getUser(sender); const settings = await getGroupSettings(chatId)
    if (arg[0]==='ativar'){
      if ((u.coins||0) < settings.planPrice){ await sock.sendMessage(chatId, { text:`Custo do plano: ${settings.planPrice} coins. Você precisa de mais ${settings.planPrice-(u.coins||0)}.` }, { quoted: msg }); return }
      u.coins -= settings.planPrice; settings.premium = true; await saveDB()
      await sock.sendMessage(chatId, { text:`Plano premium ativado para este grupo! Comandos avançados liberados.` }, { quoted: msg })
      return
    }
    const status = settings.premium ? 'Ativo' : 'Inativo'
    await sock.sendMessage(chatId, { text:`Plano de grupo: ${status}\nPreço: ${settings.planPrice} coins\nUse .plano ativar para ativar se você for admin e tiver coins.` }, { quoted: msg })
    return
  }
  if (cmd==='setwelcome' || cmd==='setbye'){
    if (!isGroup){ await sock.sendMessage(chatId, { text:'Use apenas em grupos.' }, { quoted: msg }); return }
    const meta = await sock.groupMetadata(chatId)
    const admins = meta.participants.filter(p=>p.admin).map(p=>p.id)
    if (!admins.includes(sender)){ await sock.sendMessage(chatId, { text:'Somente admin pode configurar.' }, { quoted: msg }); return }
    if (!groupSettings.premium){ await sock.sendMessage(chatId, { text:'Esse recurso exige plano premium. Ative com .plano ativar.' }, { quoted: msg }); return }
    const type = cmd==='setwelcome' ? 'welcome' : 'bye'
    const textValue = arg.join(' ').trim() || ''
    let imageBase64 = null
    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
    if (quoted?.imageMessage){
      const buff = await downloadMediaBuffer({ key:{ ...msg.key, id: msg.message.extendedTextMessage.contextInfo.stanzaId }, message: { imageMessage: quoted.imageMessage } }, 'buffer')
      imageBase64 = buff.toString('base64')
    }
    const data = {}
    data[`${type}Message`] = textValue || (type==='welcome' ? 'Bem-vindo ao grupo!' : 'Saiu do grupo. Até logo!')
    data[`${type}Image`] = imageBase64 || groupSettings[`${type}Image`]
    await updateGroupSettings(chatId, data)
    await sock.sendMessage(chatId, { text:`Mensagem de ${type} configurada.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='rankgay'){ await sock.sendMessage(chatId, { text:'Não vou criar comandos que avaliem alguém pela orientação sexual. Use `.rank`, `.rankbanco`, `.rankprof` ou as brincadeiras `.rankpau` / `.rankgostosos`.' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }

  if (cmd==='dado'){
    const n = Math.floor(Math.random() * 6) + 1
    await sock.sendMessage(chatId, { text:`🎲 Dado: ${n}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='moeda'){
    const lado = Math.random() < 0.5 ? 'Cara' : 'Coroa'
    await sock.sendMessage(chatId, { text:`🪙 Moeda: ${lado}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='bola8'){
    const pergunta = arg.join(' ').trim()
    if (!pergunta){ await sock.sendMessage(chatId, { text:'Use: .bola8 <pergunta>' }, { quoted: msg }); return }
    const respostas = [
      'Sim, com certeza.',
      'Provavelmente sim.',
      'Talvez.',
      'Melhor nao contar com isso.',
      'Nao.',
      'As energias estao confusas. Tente de novo.'
    ]
    await sock.sendMessage(chatId, { text:`🔮 ${pick(respostas)}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='adivinha'){
    const guess = parseInt(arg[0] || '', 10)
    if (Number.isNaN(guess) || guess < 1 || guess > 10){
      await sock.sendMessage(chatId, { text:'Use: .adivinha <numero de 1 a 10>' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    const secret = Math.floor(Math.random() * 10) + 1
    if (guess === secret){
      const u = await getUser(sender)
      u.coins = (u.coins||0) + 120
      u.xp = (u.xp||0) + 8
      await saveDB()
      await sock.sendMessage(chatId, { text:`🎯 Acertou! O número era ${secret}. +120 coins e +8 XP.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    } else {
      await sock.sendMessage(chatId, { text:`❌ Errou! O número era ${secret}.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
    }
    return
  }
  if (cmd==='sorteio'){
    const options = arg.join(' ').split('|').map(x => x.trim()).filter(Boolean)
    if (options.length < 2){
      await sock.sendMessage(chatId, { text:'Use: .sorteio <op1|op2|op3>' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    await sock.sendMessage(chatId, { text:`⚖️ Sorteado: ${pick(options)}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='quem'){
    if (!isGroup){ await sock.sendMessage(chatId, { text:'Use em grupo para escolher alguem.' }, { quoted: msg }); return }
    const meta = await sock.groupMetadata(chatId)
    const members = meta.participants.map(p => p.id)
    const chosen = pick(members)
    await sock.sendMessage(chatId, { text:`❓ Hoje o escolhido foi: @${jidToNumber(chosen)}`, mentions:[chosen] }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='todos' || cmd==='marcartodos' || cmd==='tagall' || cmd==='marcar'){
    if (!isGroup){
      await sock.sendMessage(chatId, { text:'Use esse comando em grupo.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    const meta = await sock.groupMetadata(chatId)
    const admins = meta.participants.filter(p => p.admin).map(p => p.id)
    if (!admins.includes(sender)){
      await sock.sendMessage(chatId, { text:'Apenas administradores podem marcar todos.' }, { quoted: msg })
      await playAudioIfExists(chatId, '(4) Tentativa de Execução de Comandos Vips.mp3')
      return
    }
    const mentions = meta.participants.map(p => p.id)
    const mensagem = arg.join(' ').trim() || 'Sem mensagem informada.'
    const lista_de_membros = mentions.map(jid => `@${jidToNumber(jid)}`).join('\n')
    const convocacao = `📢 ㅤ   ▬▬▬ㅤ
CONVOCAÇÃO DO INFINITO
ㅤ 👁️  "Acordem! Eu tenho um aviso." ㅤ .

┌──────────────────────┐
ㅤ  Prestem atenção aqui, bando de
ㅤ  inúteis. Eu não vou repetir. O
ㅤ  aviso está logo abaixo, então
ㅤ  leiam e voltem a fazer nada. 🍬✨
└──────────────────────┘

📣 ㅤ AVISO DO DIA:

${mensagem}

👥 ㅤ LISTA DE ALVOS:

${lista_de_membros}

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🔵 STATUS: Todos os membros marcados.
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
    await sock.sendMessage(chatId, { text: convocacao, mentions }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='mimimi'){
    const phrase = arg.join(' ').trim()
    if (!phrase){ await sock.sendMessage(chatId, { text:'Use: .mimimi <texto>' }, { quoted: msg }); return }
    const out = phrase.split(/\s+/).map(w => `${w}...`).join(' ') + ' 😭'
    await sock.sendMessage(chatId, { text: out }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='reagir' || cmd==='reacao' || cmd==='react'){
    if (!isGroup){ await sock.sendMessage(chatId, { text:'Use esse comando em grupo.' }, { quoted: msg }); return }
    const ctx = msg.message?.extendedTextMessage?.contextInfo
    if (!ctx?.stanzaId){
      await sock.sendMessage(chatId, { text:'Use: responda uma mensagem com .reagir <emoji>\nEx.: .reagir 😂' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    const emoji = (arg[0] || '👍').trim().slice(0, 2)
    const targetKey = {
      remoteJid: chatId,
      id: ctx.stanzaId,
      participant: ctx.participant,
      fromMe: false
    }
    await sock.sendMessage(chatId, { react: { text: emoji, key: targetKey } })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='verdade'){
    const subject = arg.join(' ').trim() || 'isso'
    const truths = [
      `A verdade sobre ${subject}: sempre da mais trabalho do que parece.`,
      `A verdade sobre ${subject}: ninguem admite, mas todo mundo pensa nisso.`,
      `A verdade sobre ${subject}: voce ja sabia a resposta, so faltava coragem.`,
      `A verdade sobre ${subject}: hoje nao perdoa distraido.`
    ]
    await sock.sendMessage(chatId, { text:`🗣️ ${pick(truths)}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  // Games
  if (cmd==='rps'){ await handleRps(text.slice(1), sock, chatId, msg); return }
  if (cmd==='forca'){ await handleForca(text.slice(1), sock, chatId, msg); return }
  if (cmd==='letra'){
    const letter = (arg[0] || '').trim()
    await handleForca(`forca g ${letter}`, sock, chatId, msg)
    return
  }

  // Store
  if (cmd==='loja'){
    const storeGuide = `🛒 ㅤ   ▬▬▬ㅤ
GUIA DE ITENS — GOJO
ㅤ 👁️👁️ㅤ  "Lê com atenção pra não comprar lixo." ㅤ .

🟢 GRAU 4 (BÁSICOS)

Colete de Couro ($700): Proteção leve para o torso. (+5% Defesa)

Luvas de Trabalho ($450): Protege as mãos. (+5% de bônus no .work)

Poção de HP Pequena ($550): Curativo rápido. (Recupera 20% da vida)

Curativo Rápido ($450): Estanca sangramentos simples em batalhas.

Corda de Nylon ($620): Facilita a descida em masmorras ou cavernas.

Vassoura de Palha ($350): Aumenta ganhos em trabalhos braçais. (+2%)

🔵 GRAU 3 (COMUNS)
7. Armadura de Ferro ($3.200): Resistência sólida contra golpes. (+10% Defesa)
8. Escudo de Bronze ($2.500): Chance de bloquear ataques físicos. (+8%)
9. Picareta de Ferro ($3.800): Melhora a extração de minérios. (+10% no .minerar)
10. Machado de Aço ($3.800): Corta madeira com mais facilidade. (+10% no trabalho)
11. Rede de Caça ($2.900): Aumenta a chance de capturar animais. (+15% no .cacar)
12. Antídoto Geral ($1.800): Remove qualquer efeito de veneno do corpo.

🟡 GRAU 2 (RAROS)
13. Manto de Fluxo ($8.000): Tecido leve que ajuda a desviar. (+10% Agilidade)
14. Enxada de Prata ($6.800): Melhora o rendimento da horta. (+15% no .plantar)
15. Suco de Mochi ($6.200): O lanche favorito do Gojo. (Recupera 50% de Energia)
16. Kit Investigação ($9.500): Aumenta sucesso em buscas. (+20% em .explorar)
17. Vara de Pesca Pro ($7.600): Fisga peixes raros com mais facilidade. (+20%)
18. Bota de Mercenário ($11.500): Melhora a velocidade de fuga. (+15% Escape)

🔴 GRAU 1 (ELITE)
19. Cota de Malha Real ($22.000): Proteção de cavaleiro. (+15% Defesa total)
20. Armadura de Placas ($31.000): Quase impenetrável. (+25% Defesa total)
21. Maleta Executiva ($36.000): Aumenta o prestígio e o salário. (+20% no .salario)
22. Notebook Gamer ($27.000): Aumenta a eficiência em código. (+20% no trabalho)
23. Picareta de Diamante ($49.000): Extrai joias lendárias. (+35% no .minerar)
24. Poção de HP Grande ($17.500): Regeneração total. (Cura 100% da vida)

🟣 GRAU ESPECIAL (LENDÁRIOS)
25. Manto do Vazio ($135.000): Difícil de ser tocado. (+20% de Esquiva real)
26. Escudo de Obsidiana ($165.000): Proteção extrema. (Torna você imune a fogo)
27. Traje de Sombra ($225.000): Fica invisível por 3 turnos (Escapa de lutas)
28. Amuleto de Vida ($360.000): Uma segunda chance. (Renasce 1x se morrer)
29. Frasco Adrenalina ($99.000): Impulso de poder. (Dobra o seu Dano por 3 rodadas)
30. Elixir de Satoru ($899.999): Poder absoluto. (Todos os Status no Máximo por 1h)

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🔵 INFO: Use .buy <id> para adquirir.
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
    await sock.sendMessage(chatId, { text: storeGuide }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='buy'){
  const first = (arg[0]||'').toLowerCase()
  const legacyCategories = ['util','decor','casa','armas','armaduras','materiais','itens']
  const id = legacyCategories.includes(first) ? parseInt(arg[1]||'0',10) : parseInt(arg[0]||'0',10)
  const items = (await import('./config.js')).STORE.itens || []
  const sel = items.find(i=>i.id===id)
  if (!sel){ await sock.sendMessage(chatId, { text:'Use: .buy <id>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const u=await getUser(sender)
    if ((u.coins||0) < sel.price){ await sock.sendMessage(chatId, { text:'Moedas insuficientes.' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
  u.coins -= sel.price; u.items=u.items||[]; u.items.push({ cat: 'itens', name: sel.name, boost: sel.boost||0, power: sel.power||0, defense: sel.defense||0 }); await saveDB()
    await sock.sendMessage(chatId, { text:`Comprou ${sel.name} por ${sel.price}.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='inventario'){
    const u=await getUser(sender)
    const inv=(u.items||[]).map((x,i)=>`${i+1}. ${x.cat}:${x.name}${x.power?` (ATK ${x.power})`:''}${x.defense?` (DEF ${x.defense})`:''}`).join('\n') || 'Vazio.'
    const materials = formatMaterials(u.materials)
    await sock.sendMessage(chatId, { text:`🎒 Inventário\n${inv}\n\n🪨 Materiais\n${materials}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  // Audio/Video
  if (cmd==='sticker'){
    const ctx = msg.message?.extendedTextMessage?.contextInfo || {}
    const quotedImage = getQuotedImageMessage(msg)
    if (!quotedImage){
      await sock.sendMessage(chatId, { text:'Use: responda uma imagem com .sticker' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    if (!accessGranted){
      await sendBlockedReactionImage(chatId, msg)
      await sock.sendMessage(chatId, { text:`🛑 ㅤ   ▬▬▬ㅤ
SATORU GOJO — BLOQUEADO
ㅤ 👁️👁️ㅤ  "Voce nao tem acesso a mim... ainda." ㅤ .

┌──────────────────────┐
ㅤ  Sua licença está inativa.
ㅤ  Ative sua licença para gerar
ㅤ  figurinha a partir de imagens.
└──────────────────────┘

◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
      const quotedMsg = {
      key: { ...msg.key, id: ctx.stanzaId || msg.key.id, participant: sender, remoteJid: chatId },
        message: { imageMessage: quotedImage }
      }
      let buf
      try {
        buf = await downloadMediaBuffer(quotedMsg, 'buffer')
      } catch (err) {
        await sock.sendMessage(chatId, { text:`Falha ao ler a imagem da resposta: ${err.message}` }, { quoted: msg })
        await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
        return
      }
      const profile = await getUser(sender)
      const author = profile.name || msg.pushName || 'Usuário'
      try {
        const sticker = await makeSticker(buf, author, `${author}_sticker`)
        await sock.sendMessage(chatId, { sticker }, { quoted: msg })
      } catch (err) {
        await sock.sendMessage(chatId, { text:`Falha ao converter a imagem em figurinha: ${err.message}` }, { quoted: msg })
        await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
        return
      }
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='audio'){
    const link=arg[0]||''
    if (link){ if (/youtube\.com|youtu\.be/.test(link)) await audioFromYouTube(link, chatId); else await audioFromGeneric(link, chatId); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return }
    const ctx=msg.message?.extendedTextMessage?.contextInfo; const quoted=ctx?.quotedMessage?.videoMessage
    if (quoted){ const q={ key:{...msg.key, id: ctx.stanzaId}, message:{ videoMessage: quoted } }; await extractAudioFromVideoMessage(q, chatId); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return }
    await sock.sendMessage(chatId, { text:'Use: .audio <link> ou responda um VÍDEO com .audio' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return
  }
  if (cmd==='video' || cmd==='vidio'){
    const link=arg[0]||''
    if (!link){ await sock.sendMessage(chatId, { text:'Use: .video <link YouTube/Pinterest>\nPinterest grátis: envie o link de board para usar RSS.' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    if (/youtube\.com|youtu\.be/.test(link)) await videoFromYouTube(link, chatId); else await videoFromGeneric(link, chatId)
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return
  }
  if (cmd==='ia' || cmd==='ai'){
    const pergunta = arg.join(' ').trim()
    if (!pergunta){
      await sock.sendMessage(chatId, { text:'Use: .ia <sua pergunta>\nEx.: .ia me explica async/await com exemplo simples' }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    const result = await askAI(pergunta, msg.pushName || 'Usuário')
    if (!result.ok){
      await sock.sendMessage(chatId, { text:`🤖 ${result.error}` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    await sock.sendMessage(chatId, { text:`🤖 ${result.text}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  // Admin-o
  if (['pcadd','pclist','pcrmv'].includes(cmd)){
    if (!isGroup){ await sock.sendMessage(chatId, { text:'Somente em grupo.' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    if (!groupSettings?.premium){ await sock.sendMessage(chatId, { text:'Esse recurso exige plano premium. Ative com .plano ativar.' }, { quoted: msg }); return }
    const meta = await sock.groupMetadata(chatId)
    const admins = meta.participants.filter(p=>p.admin).map(p=>p.id)
    const isAdmin = admins.includes(sender)
    if (!isAdmin){ await sock.sendMessage(chatId, { text:'Apenas administradores podem usar este comando.' }, { quoted: msg }); await playAudioIfExists(chatId, '(4) Tentativa de Execução de Comandos Vips.mp3'); return }

    if (cmd==='pcadd'){
      const raw = arg.join(' ').split('|')
      if (raw.length<2){ await sock.sendMessage(chatId, { text:'Use: .pcadd <gatilho> | <mensagem>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
      const trigger = raw[0].trim().toLowerCase().replace(/^\./,''); const message = raw.slice(1).join('|').trim()
      if (!trigger||!message){ await sock.sendMessage(chatId, { text:'Use: .pcadd <gatilho> | <mensagem>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
      const r = await addGroupCustom(chatId, sender, trigger, message)
      if (!r.ok){ await sock.sendMessage(chatId, { text:`Falhou: ${r.reason}` }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3') }
      else { await sock.sendMessage(chatId, { text:`Comando .${trigger} criado.` }, { quoted: msg }); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3') }
      return
    }
    if (cmd==='pclist'){
      const list = await listGroupCustom(chatId)
      const body = list.length ? list.map((c,i)=>`${i+1}. .${c.trigger}`).join('\n') : 'Nenhum.'
      await sock.sendMessage(chatId, { text:`🧩 Comandos personalizados do grupo:\n${body}` }, { quoted: msg }); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }
    if (cmd==='pcrmv'){
      const trigger=(arg[0]||'').toLowerCase().replace(/^\./,'')
      if (!trigger){ await sock.sendMessage(chatId, { text:'Use: .pcrmv <gatilho>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
      const meta2 = await sock.groupMetadata(chatId)
      const admins2 = meta2.participants.filter(p=>p.admin).map(p=>p.id)
      const isGroupAdmin = admins2.includes(sender)
      const r = await removeGroupCustom(chatId, sender, trigger, isGroupAdmin)
      if (!r.ok){ await sock.sendMessage(chatId, { text:`Falhou: ${r.reason}` }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3') }
      else { await sock.sendMessage(chatId, { text:`Comando .${trigger} removido.` }, { quoted: msg }); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3') }
      return
    }
  }

  
await sendDebocheWarning(chatId, msg, 'invalid')
  await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
})










