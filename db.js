import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

const DB_FILE = process.env.DB_FILE || 'db.sqlite'
const LEGACY_JSON_FILE = process.env.DB_LEGACY_FILE || 'db.json'

const DEFAULT_DATA = {
  users: {},
  games: {},
  scores: {},
  custom: {},
  groups: {},
  clans: {},
  system: {}
}

function cloneDefaults(){
  return {
    users: {},
    games: {},
    scores: {},
    custom: {},
    groups: {},
    clans: {},
    system: {}
  }
}

function safeJsonParse(value, fallback){
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function ensureDirForFile(filePath){
  const dir = path.dirname(path.resolve(filePath))
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readLegacyJson(){
  if (!fs.existsSync(LEGACY_JSON_FILE)) return null
  try {
    const raw = fs.readFileSync(LEGACY_JSON_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function mergeDefaults(data){
  return {
    users: data.users && typeof data.users === 'object' ? data.users : {},
    games: data.games && typeof data.games === 'object' ? data.games : {},
    scores: data.scores && typeof data.scores === 'object' ? data.scores : {},
    custom: data.custom && typeof data.custom === 'object' ? data.custom : {},
    groups: data.groups && typeof data.groups === 'object' ? data.groups : {},
    clans: data.clans && typeof data.clans === 'object' ? data.clans : {},
    system: data.system && typeof data.system === 'object' ? data.system : {}
  }
}

ensureDirForFile(DB_FILE)
const sqlite = new Database(DB_FILE)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('synchronous = NORMAL')

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sections (
    name TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
`)

const upsertUserStmt = sqlite.prepare('INSERT INTO users (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
const clearUsersStmt = sqlite.prepare('DELETE FROM users')
const listUsersStmt = sqlite.prepare('SELECT id, data FROM users')
const upsertSectionStmt = sqlite.prepare('INSERT INTO sections (name, data) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data')
const listSectionsStmt = sqlite.prepare('SELECT name, data FROM sections')

let loaded = false

function buildDataFromDatabase(){
  const data = cloneDefaults()
  for (const row of listUsersStmt.all()){
    data.users[row.id] = safeJsonParse(row.data, {})
  }
  for (const row of listSectionsStmt.all()){
    if (row.name in data){
      data[row.name] = safeJsonParse(row.data, data[row.name])
    }
  }
  return mergeDefaults(data)
}

function persistDataToDatabase(data){
  const normalized = mergeDefaults(data || cloneDefaults())
  const tx = sqlite.transaction(() => {
    clearUsersStmt.run()
    for (const [id, user] of Object.entries(normalized.users)){
      upsertUserStmt.run(id, JSON.stringify(user || {}))
    }
    for (const sectionName of ['games', 'scores', 'custom', 'groups', 'clans', 'system']){
      upsertSectionStmt.run(sectionName, JSON.stringify(normalized[sectionName] || {}))
    }
  })
  tx()
}

async function safeWrite(retries = 5){
  let lastErr = null
  for (let i = 0; i < retries; i++){
    try {
      persistDataToDatabase(db.data)
      return
    } catch (err){
      lastErr = err
      const code = err?.code || ''
      if (code !== 'SQLITE_BUSY' && code !== 'SQLITE_LOCKED' && code !== 'EPERM' && code !== 'EBUSY') throw err
      const delay = 80 * (i + 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw lastErr
}

const db = {
  data: cloneDefaults(),
  async read(){
    if (!loaded){
      db.data = buildDataFromDatabase()
      if (!Object.keys(db.data.users).length && !Object.keys(db.data.groups).length && !Object.keys(db.data.custom).length && !Object.keys(db.data.clans).length && !Object.keys(db.data.system).length){
        const legacy = readLegacyJson()
        if (legacy){
          db.data = mergeDefaults(legacy)
          persistDataToDatabase(db.data)
        }
      }
      loaded = true
    }
    return db.data
  },
  async write(){
    persistDataToDatabase(db.data)
  },
  close(){
    sqlite.close()
  }
}

export async function initDB(){
  await db.read()
  await db.write()
}

export async function getUser(id){
  await db.read()
  db.data.users ||= {}
  db.data.users[id] ||= {
    name: null,
    coins: 100,
    job: null,
    items: [],
    equipped: null,
    xp: 0,
    level: 1,
    bank: 0,
    rpsWins: 0,
    forcaWins: 0,
    cooldowns: {},
    status: '',
    createdAt: null,
    lastActive: Date.now(),
    hp: 100,
    maxHp: 100,
    materials: { pedra:0, erva:0, carne:0, minerio:0 },
    plants: { tomate:0, cenoura:0, melancia:0, abobora:0 },
    bossesDefeated: 0,
    explores: 0,
    marriedTo: null,
    children: [],
    kills: 0,
    wins: 0,
    losses: 0,
    clan: null,
    arrested: false,
    pets: []
  }
  const user = db.data.users[id]
  if (!user.createdAt) user.createdAt = Date.now()
  user.lastActive ||= Date.now()
  return user
}

export async function setUser(id, obj){
  await db.read()
  db.data.users ||= {}
  db.data.users[id] = Object.assign(await getUser(id), obj)
  await db.write()
  return db.data.users[id]
}

export async function saveDB(){
  await db.write()
}

export async function getGroupSettings(groupId){
  await db.read()
  db.data.groups ||= {}
  db.data.groups[groupId] ||= {
    premium: false,
    welcomeMessage: '',
    byeMessage: '',
    welcomeImage: null,
    byeImage: null,
    planPrice: 5000,
    mutedUsers: [],
    banLinks: false,
    warnings: {}
  }
  const g = db.data.groups[groupId]
  g.mutedUsers ||= []
  if (typeof g.banLinks !== 'boolean') g.banLinks = false
  g.warnings ||= {}
  return db.data.groups[groupId]
}

export async function updateGroupSettings(groupId, data){
  await db.read()
  const g = await getGroupSettings(groupId)
  Object.assign(g, data)
  await db.write()
  return g
}

export async function getGroupCustom(groupId){
  await db.read()
  db.data.custom ||= {}
  db.data.custom[groupId] ||= { commands:{} }
  return db.data.custom[groupId]
}

export async function addGroupCustom(groupId, creatorId, trigger, message){
  await db.read()
  db.data.custom ||= {}
  db.data.custom[groupId] ||= { commands:{} }
  const g = db.data.custom[groupId]
  const createdByAdmin = Object.values(g.commands).filter(c => c.creator === creatorId).length
  if (createdByAdmin >= 10) return { ok:false, reason:'Limite de 10 comandos por admin neste grupo.' }
  if (g.commands[trigger]) return { ok:false, reason:'Já existe um comando com esse gatilho.' }
  g.commands[trigger] = { msg: message, creator: creatorId, createdAt: Date.now() }
  await db.write()
  return { ok:true }
}

export async function removeGroupCustom(groupId, requesterId, trigger, isRequesterGroupAdmin){
  await db.read()
  db.data.custom ||= {}
  const g = db.data.custom[groupId]
  if (!g || !g.commands[trigger]) return { ok:false, reason:'Gatilho não encontrado.' }
  const owner = g.commands[trigger].creator
  if (owner !== requesterId && !isRequesterGroupAdmin){
    return { ok:false, reason:'Apenas o criador ou um admin do grupo pode remover.' }
  }
  delete g.commands[trigger]
  await db.write()
  return { ok:true }
}

export async function listGroupCustom(groupId){
  await db.read()
  db.data.custom ||= {}
  const g = db.data.custom[groupId] || { commands:{} }
  return Object.entries(g.commands).map(([t,info])=>({ trigger:t, creator: info.creator }))
}

export async function getTopBy(field, limit=5){
  await db.read()
  const arr = Object.entries(db.data.users || {}).map(([id, u]) => ({ id, v: u[field] || 0 }))
  arr.sort((a, b) => b.v - a.v)
  return arr.slice(0, limit)
}

export default db