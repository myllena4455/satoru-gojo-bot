import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

const DB_FILE = process.env.DB_FILE || 'db.json'
const adapter = new JSONFile(DB_FILE)
const db = new Low(adapter, { users:{}, games:{}, scores:{}, custom:{}, groups:{}, clans:{}, system:{} })

async function safeWrite(retries = 5){
  let lastErr = null
  for (let i = 0; i < retries; i++){
    try {
      await db.write()
      return
    } catch (err){
      lastErr = err
      if (err?.code !== 'EPERM' && err?.code !== 'EBUSY') throw err
      const delay = 80 * (i + 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw lastErr
}

export async function initDB(){
  await db.read()
  db.data ||= { users:{}, games:{}, scores:{}, custom:{}, groups:{}, clans:{}, system:{} }
  db.data.system ||= {}
  await safeWrite()
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
  await safeWrite()
  return user
}

export async function setUser(id, obj){
  await db.read()
  db.data.users ||= {}
  db.data.users[id] = Object.assign(await getUser(id), obj)
  await safeWrite()
  return db.data.users[id]
}

export async function saveDB(){ await safeWrite() }

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
  await safeWrite()
  return db.data.groups[groupId]
}

export async function updateGroupSettings(groupId, data){
  await db.read()
  const g = await getGroupSettings(groupId)
  Object.assign(g, data)
  await safeWrite()
  return g
}

export async function getGroupCustom(groupId){
  await db.read()
  db.data.custom ||= {}
  db.data.custom[groupId] ||= { commands:{} }
  await safeWrite()
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
  await safeWrite()
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
  await safeWrite()
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
  const arr = Object.entries(db.data.users||{}).map(([id,u])=>({id, v: u[field]||0}))
  arr.sort((a,b)=>b.v-a.v)
  return arr.slice(0,limit)
}

export default db
