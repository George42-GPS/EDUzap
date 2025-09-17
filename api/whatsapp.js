// Vercel Serverless Function — Webhook WhatsApp (Twilio)

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

function parseForm(body) {
  const pairs = body.split('&'); const out = {};
  for (const p of pairs) { const [k, v] = p.split('='); if (!k) continue;
    out[decodeURIComponent(k)] = decodeURIComponent((v||'').replace(/\+/g,' ')); }
  return out;
}

async function askOpenAI(userText) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{ 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json' },
    body: JSON.stringify({
      model:'gpt-4o-mini', temperature:0.2,
      messages:[
        { role:'system', content:'Você é o EDUzap, tutor no WhatsApp para alunos de 10–18 anos. Responda curto, claro e gentil. Sempre inclua: (1) explicação simples, (2) 1 exercício prático, (3) 1 missão offline rápida. Evite assuntos fora de educação básica.' },
        { role:'user', content: userText || 'Oi EDUzap!' }
      ]
    })
  });
  const data = await resp.json();
  return (data.choices?.[0]?.message?.content || 'Oi! Vamos estudar?');
}

export default async function handler(req, res) {
  try {
    const raw = typeof req.body==='string' ? req.body : (req.body
      ? Object.keys(req.body).map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(req.body[k])}`).join('&')
      : (await new Promise(r=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>r(d||'')); })));
    const form = parseForm(raw);
    const incoming = form.Body || form.Message || 'Oi EDUzap!';

    const hStr = new Date().toLocaleString('pt-BR',{ timeZone:'America/Sao_Paulo', hour:'2-digit', hour12:false });
    const hour = parseInt(hStr,10);
    const withinHours = (hour>=7 && hour<8) || (hour>=17 && hour<19);
    const blocked = ['futebol','jogo','aposta','namoro','celebridade','fofoca'];
    const isBlocked = blocked.some(k => incoming.toLowerCase().includes(k));

    let reply;
    if (!withinHours) {
      reply = '⏰ Nosso horário é 07–08h e 17–19h (Brasília). Missão offline: leia 1 página em voz alta hoje 📖. Até já!';
    } else if (isBlocked) {
      reply = 'Aqui falamos só de estudos 😊 Quer praticar Frações em Matemática ou Interpretação de Texto em Português?';
    } else {
      reply = await askOpenAI(incoming);
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${
      reply.replace(/&/g,'&amp;').replace(/</g,'&lt;')
    }</Message></Response>`;
    res.setHeader('Content-Type','text/xml');
    return res.status(200).send(twiml);
  } catch {
    const fallback = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Ops! Tive um problema agora. Tente de novo em 1 minuto, por favor.</Message></Response>`;
    res.setHeader('Content-Type','text/xml');
    return res.status(200).send(fallback);
  }
}
