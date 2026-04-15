import { spawn } from 'child_process'

let stopping = false
let restarts = 0
let child = null

function setupSignalHandlers(stop) {
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

function start() {
  child = spawn(process.execPath, ['index.js'], {
    stdio: 'inherit',
    env: process.env
  })

  const stop = () => {
    stopping = true
    if (child) child.kill('SIGINT')
    setTimeout(() => process.exit(0), 1000)
  }

  setupSignalHandlers(stop)

  child.on('exit', (code, signal) => {
    if (stopping) return

    restarts += 1
    
    // Aumenta delay para dar tempo de esperar o QR
    let delay = 5000 // 5 segundos entre tentativas
    if (restarts > 10) delay = 8000
    if (restarts > 20) delay = 10000
    
    setTimeout(start, delay)
  })
}

start()
