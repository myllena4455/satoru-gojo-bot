export default async function tiktokCommand(sock, msg, args) {
    const from = msg.key.remoteJid

    if (!args[0]) {
        await sock.sendMessage(from, { text: '❌ Envie um link do TikTok.' }, { quoted: msg })
        return
    }

    const url = args[0]

    try {
        // API 1 (TikWM)
        const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`)
        const data = await res.json()

        if (data?.data?.play) {
            await sock.sendMessage(from, {
                video: { url: data.data.play },
                caption: '✅ Baixado via API 1'
            }, { quoted: msg })
            return
        }

        throw new Error('API 1 falhou')
    } catch (err1) {
        console.log('Erro API 1:', err1.message)

        try {
            // API 2 (fallback)
            const res2 = await fetch(`https://api.douyin.wtf/api?url=${encodeURIComponent(url)}`)
            const data2 = await res2.json()

            if (data2?.data?.play) {
                await sock.sendMessage(from, {
                    video: { url: data2.data.play },
                    caption: '⚠️ Baixado via API 2'
                }, { quoted: msg })
                return
            }

            throw new Error('API 2 falhou')
        } catch (err2) {
            console.log('Erro API 2:', err2.message)
            await sock.sendMessage(from, { text: '❌ Não consegui baixar esse vídeo. Tente outro link.' }, { quoted: msg })
        }
    }
}
