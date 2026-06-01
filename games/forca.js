import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

const DB_FILE = process.env.DB_FILE || 'db.json'
const adapter = new JSONFile(DB_FILE)
const db = new Low(adapter, {})

const MAX_LIVES = 10
const WORDS = [
  { word:'banana', hint:'Fruta amarela comum no Brasil.' },
  { word:'programacao', hint:'Arte de escrever codigo.' },
  { word:'javascript', hint:'Linguagem muito usada na web.' },
  { word:'amazonia', hint:'Maior floresta tropical do mundo.' },
  { word:'livro', hint:'Objeto com paginas para leitura.' },
  { word:'computador', hint:'Maquina usada para executar programas.' },
  { word:'feiticeiro', hint:'Quem domina tecnicas amaldiçoadas.' },
  { word:'infinito', hint:'Algo sem limite aparente.' }
]

function maskWord(word, guessed){
  return word
    .split('')
    .map(ch => (/[a-z0-9]/i.test(ch) ? (guessed.includes(ch) ? ch : '_') : ch))
    .join(' ')
}

function livesBar(lives){
  const fill = Math.max(0, Math.min(10, lives))
  return `[${'▰'.repeat(fill)}${'▱'.repeat(10 - fill)}]`
}

function boardText(game){
  const palavra_escondida = maskWord(game.word, game.letters)
  const letras_erradas = game.wrongLetters.length ? game.wrongLetters.join(', ') : 'Nenhuma ainda'
  const vidas = game.lives
  const dica_da_palavra = game.hint || 'Sem dica.'

  return `😵‍💫 ㅤ   ▬▬▬ㅤ
TREINAMENTO: FORCA DO INFINITO
ㅤ 👁️👁️ㅤ  "Tente nao perder a cabeça... literalmente." ㅤ .

┌──────────────────────┐
ㅤ  Uma palavra, poucas chances e
ㅤ  muita burrice envolvida? Vamos
ㅤ  ver se voce consegue adivinhar
ㅤ  antes da execucao. 🍬✨
└──────────────────────┘

🔤 ㅤ A PALAVRA:

ㅤ ╰  ${palavra_escondida}

🚫 ㅤ LETRAS ERRADAS:

ㅤ ╰  ${letras_erradas}

🩸 ㅤ VIDAS RESTANTES:

${livesBar(vidas)} ( ${vidas} / 10 )

💡 ㅤ DICA:

ㅤ ╰  " ${dica_da_palavra} "

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🔵 INFO: Use .letra <letra> para chutar!
“Se voce morrer aqui, eu nem vou no
seu enterro, que mico.” — Satoru 🤞
◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤`
}

function winText(game){
  return `🏁 ㅤ   ▬▬▬ㅤ
FORCA DO INFINITO — VITÓRIA
ㅤ 👁️👁️ㅤ  "Milagre aconteceu." ㅤ .

✅ Palavra revelada: ${game.word}
🎉 Você venceu antes da execução.

▰▰▰▰▰▰▰▰▰▰
Use .forca para iniciar outra rodada.`
}

function loseText(game){
  return `☠️ ㅤ   ▬▬▬ㅤ
FORCA DO INFINITO — DERROTA
ㅤ 👁️👁️ㅤ  "Eu avisei que era facil..." ㅤ .

❌ Você perdeu todas as vidas.
🔤 Palavra correta: ${game.word}

▰▰▰▰▰▰▰▰▰▰
Use .forca para tentar de novo.`
}

export async function handleForca(cmd, sock, chatId, quoted){
  await db.read()
  db.data ||= { users:{}, games:{} }
  const parts = cmd.trim().split(/\s+/).filter(Boolean)
  const game = db.data.games[chatId] || null
  const action = (parts[1] || '').toLowerCase()

  if (!action || action==='start' || action==='novo'){
    const selected = WORDS[Math.floor(Math.random() * WORDS.length)]
    db.data.games[chatId] = {
      word: selected.word.toLowerCase(),
      hint: selected.hint,
      lives: MAX_LIVES,
      letters: [],
      wrongLetters: []
    }
    await db.write()
    await sock.sendMessage(chatId, { text: boardText(db.data.games[chatId]) }, { quoted })
    return
  }

  if (action==='g' || action==='letra'){
    if (!game){
      await sock.sendMessage(chatId, { text:'Nenhum jogo em andamento. Use .forca para iniciar.' }, { quoted })
      return
    }

    const rawLetter = (parts[2] || '').toLowerCase()
    const letter = rawLetter.replace(/[^a-z0-9]/g, '').slice(0, 1)
    if (!letter){
      await sock.sendMessage(chatId, { text:'Use: .letra <letra>' }, { quoted })
      return
    }
    if (game.letters.includes(letter)){
      await sock.sendMessage(chatId, { text:`Letra "${letter}" já foi usada.\n\n${boardText(game)}` }, { quoted })
      return
    }

    game.letters.push(letter)
    if (!game.word.includes(letter)){
      game.lives -= 1
      game.wrongLetters.push(letter)
    }

    const currentMasked = maskWord(game.word, game.letters).replace(/\s+/g, '')
    const solved = currentMasked === game.word

    if (solved){
      await sock.sendMessage(chatId, { text: `${boardText(game)}\n\n${winText(game)}` }, { quoted })
      delete db.data.games[chatId]
    } else if (game.lives <= 0){
      await sock.sendMessage(chatId, { text: `${boardText(game)}\n\n${loseText(game)}` }, { quoted })
      delete db.data.games[chatId]
    } else {
      await sock.sendMessage(chatId, { text: boardText(game) }, { quoted })
    }

    await db.write()
    return
  }

  if (action==='status'){
    if (!game){
      await sock.sendMessage(chatId, { text:'Nenhum jogo em andamento. Use .forca para iniciar.' }, { quoted })
      return
    }
    await sock.sendMessage(chatId, { text: boardText(game) }, { quoted })
    return
  }

  await sock.sendMessage(chatId, { text:'Comandos da forca:\n.forca\n.letra <letra>\n.forca status' }, { quoted })
}
