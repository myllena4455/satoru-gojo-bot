# Satoru Bot (Baileys) — FINAL

## Como rodar
1) `npm install`
2) Substitua a imagem do menu: `assets/menu.jpg` (ou `assets/menu.png`)
3) Coloque seus áudios em `assets/voice/` com estes nomes exatos:
   - `(2) Execução de Comandos.mp3`  → toca quando um comando executa com sucesso
   - `(3) Erro de Execução de Comandos.mp3` → toca quando dá erro/anti-flood/comando desconhecido
   - `(4) Tentativa de Execução de Comandos Vips.mp3` → toca quando usuário sem admin tenta comandos de admin
   - `(5) Você é Fraco.mp3` → toca quando perde no RPS ou rankpau < 20%
4) (Opcional) Edite `download.config.json` para TikTok/Pinterest sem marca d’água e IA.
    - Comando IA: `.ia <pergunta>` (ou `.ai <pergunta>`)
    - Configure em `download.config.json` a seção `ai`:
       - `endpoint`: endpoint compatível com OpenAI Chat Completions
       - `token`: chave da API
       - `model`: ex.: `openai/gpt-4o-mini`
    - Para Gemini (recomendado no setup atual):
       - `provider`: `gemini`
       - `endpoint`: `https://generativelanguage.googleapis.com/v1beta`
       - `token`: chave do Google AI Studio (formato `AIza...`)
       - `model`: ex.: `gemini-2.0-flash`
    - Variáveis de ambiente aceitas:
       - Gemini: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_API_ENDPOINT`
       - Genéricas: `AI_API_KEY`, `AI_MODEL`, `AI_API_ENDPOINT`, `AI_PROVIDER`
   - Pinterest grátis (sem API):
     - Use `.video <link_do_board_pinterest>`
     - O bot tenta fallback por RSS automaticamente: `https://www.pinterest.com/USUARIO/TABULEIRO.rss`
     - Envia até 3 imagens mais recentes do board.
5) `npm start` e escaneie o QR no seu WhatsApp.

## Onde colocar fotos e áudios
- Imagem do menu: `assets/menu.jpg` ou `assets/menu.png`
- Imagens de reação (opcionais): `assets/reaction1.jpg` ... `reaction6.jpg`
- Áudios de evento: `assets/voice/(2) Execução de Comandos.mp3` etc.

## Observações
- Requer Node 18+ (tem `fetch` nativo) e usa `ffmpeg-static` embutido.
- Este bot usa a sessão do seu número via WhatsApp Web (não oficial). Para produção, prefira Cloud API.

## Deploy no DigitalOcean (App Platform / Droplet)
- Build Command: `npm ci`
- Run Command: `npm run start:resiliente`
- Variáveis de ambiente recomendadas:
   - `NODE_ENV=production`
   - `AUTH_DIR=./auth`
   - `DB_FILE=./db.json`
   - `DOWNLOAD_CONFIG_FILE=./download.config.json`
   - `PAIRING_NUMBER=55DDDNUMERO` (opcional, para pareamento sem QR)
   - `GEMINI_API_KEY=...` (se usar IA)

### Importante sobre persistência
- Em App Platform, o filesystem pode ser efêmero entre deploys/restarts.
- Se quiser manter sessão e banco sem perder (`auth` e `db.json`), prefira Droplet com volume, ou serviço com storage persistente.
