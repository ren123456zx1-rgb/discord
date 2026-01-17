const chalk = require("chalk");
const axios = require("axios");
const jimp = require("jimp-compact");
const qrcode = require("qrcode-reader");
const WebSocket = require('ws');
const express = require('express');

process.env.TZ = "Asia/Bangkok";

// ===============================================
// 🌐 Web Server
// ===============================================

const app = express();
const PORT = process.env.PORT || 3000;

let config = { token: '', phone: '', webhook: '' };
let stats = { success: 0, fail: 0, total: 0 };
let running = false;

app.use(express.json());

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TrueWallet Bot</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px}
        .box{background:#fff;padding:30px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.2);max-width:450px;width:100%}
        h1{color:#667eea;text-align:center;margin-bottom:20px;font-size:24px}
        .group{margin-bottom:15px}
        label{display:block;margin-bottom:5px;color:#333;font-size:13px;font-weight:600}
        input{width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:6px;font-size:14px}
        input:focus{outline:none;border-color:#667eea}
        .btn{width:100%;padding:12px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;margin-top:10px}
        .btn:hover{opacity:.9}
        .btn:disabled{background:#ccc;cursor:not-allowed}
        .status{margin-top:15px;padding:12px;border-radius:6px;text-align:center;font-size:13px;display:none}
        .status.ok{background:#d4edda;color:#155724}
        .status.err{background:#f8d7da;color:#721c24}
        .status.run{background:#d1ecf1;color:#0c5460}
        .stats{margin-top:15px;padding:15px;background:#f8f9fa;border-radius:6px;display:none}
        .stats h3{color:#667eea;margin-bottom:10px;font-size:14px}
        .stat{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}
        .opt{color:#999;font-size:11px;font-weight:normal}
        .help{font-size:11px;color:#666;margin-top:3px}
    </style>
</head>
<body>
    <div class="box">
        <h1>🎫 ดักซอง by : dark discors</h1>
        <form id="form">
            <div class="group">
                <label>Discord Token</label>
                <input type="password" id="token" required placeholder="MTxxxxx.xxxxxx.xxxxxxxx">
                <p class="help">User Token (ไม่ใช่ Bot Token)</p>
            </div>
            <div class="group">
                <label>เบอร์รับเงิน</label>
                <input type="tel" id="phone" required placeholder="0812345678" pattern="[0-9]{10}">
                <p class="help">เบอร์ที่ลงทะเบียน TrueWallet</p>
            </div>
            <div class="group">
                <label>Webhook URL <span class="opt">(ไม่บังคับ)</span></label>
                <input type="url" id="webhook" placeholder="https://discord.com/api/webhooks/...">
                <p class="help">ไม่ใส่จะแสดงใน Console แทน</p>
            </div>
            <button type="submit" class="btn" id="btn">เริ่มใช้งาน</button>
        </form>
        <div id="status" class="status"></div>
        <div id="stats" class="stats">
            <h3>📊 สถิติ</h3>
            <div class="stat"><span>✅ สำเร็จ:</span><span id="s">0</span></div>
            <div class="stat"><span>❌ ล้มเหลว:</span><span id="f">0</span></div>
            <div class="stat"><span>💰 รวม:</span><span id="t">0฿</span></div>
        </div>
    </div>
    <script>
        const form=document.getElementById('form');
        const status=document.getElementById('status');
        const stats=document.getElementById('stats');
        const btn=document.getElementById('btn');

        form.addEventListener('submit',async(e)=>{
            e.preventDefault();
            const data={
                token:document.getElementById('token').value,
                phone:document.getElementById('phone').value,
                webhook:document.getElementById('webhook').value
            };
            btn.disabled=true;
            btn.textContent='กำลังเริ่ม...';
            try{
                const r=await fetch('/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
                const res=await r.json();
                if(res.ok){
                    status.className='status run';
                    status.textContent='✅ บอทเริ่มทำงานแล้ว!';
                    status.style.display='block';
                    stats.style.display='block';
                    btn.textContent='กำลังทำงาน';
                    setInterval(update,3000);
                }else{
                    throw new Error(res.err);
                }
            }catch(err){
                status.className='status err';
                status.textContent='❌ '+err.message;
                status.style.display='block';
                btn.disabled=false;
                btn.textContent='เริ่มใช้งาน';
            }
        });

        async function update(){
            try{
                const r=await fetch('/api/stats');
                const d=await r.json();
                document.getElementById('s').textContent=d.success;
                document.getElementById('f').textContent=d.fail;
                document.getElementById('t').textContent=d.total+'฿';
            }catch(e){}
        }
    </script>
</body>
</html>`);
});

app.post('/api/start', async (req, res) => {
    const { token, phone, webhook } = req.body;
    if (!token || !phone) return res.json({ ok: false, err: 'กรอกข้อมูลไม่ครบ' });
    if (!/^[0-9]{10}$/.test(phone)) return res.json({ ok: false, err: 'เบอร์ไม่ถูกต้อง' });

    config = { token, phone, webhook: webhook || '' };

    if (!running) {
        startBot();
        running = true;
    }
    res.json({ ok: true });
});

app.get('/api/stats', (req, res) => res.json(stats));

app.listen(PORT, () => {
    console.log(chalk.green(`✓ Server: http://localhost:${PORT}`));
    console.log(chalk.cyan('📌 เปิดเว็บบราวเซอร์เพื่อเริ่มใช้งาน'));
});

// ===============================================
// 💬 Webhook / Console
// ===============================================

function log(embeds) {
    if (config.webhook) {
        axios.post(config.webhook, { embeds }, { timeout: 2000 }).catch(() => {});
    } else {
        // แสดงใน Console แทน
        const e = embeds[0];
        const color = e.color === 65280 ? chalk.green : e.color === 16711680 ? chalk.red : chalk.blue;
        console.log(color(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
        console.log(color(e.title));
        if (e.fields) {
            e.fields.forEach(f => {
                console.log(chalk.gray(`${f.name}: `) + chalk.white(f.value));
            });
        }
        console.log(color(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`));
    }
}

// ===============================================
// 🖼️ Image
// ===============================================

async function getImg(url) {
    const r = await axios.get(url, { responseType: "arraybuffer", timeout: 5000, maxContentLength: 10485760 });
    return r.data;
}

async function decodeQR(buf) {
    const img = await jimp.read(buf);
    const tries = [img, img.clone().resize(800, jimp.AUTO).greyscale()];

    for (const i of tries) {
        try {
            const qr = new qrcode();
            const res = await Promise.race([
                new Promise((ok, no) => {
                    qr.callback = (e, v) => e ? no(e) : ok(v.result);
                    qr.decode(i.bitmap);
                }),
                new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 3000))
            ]);
            if (res) return res;
        } catch (e) {}
    }
    throw new Error('No QR');
}

// ===============================================
// 💰 Voucher
// ===============================================

class Voucher {
    constructor(phone) {
        this.phone = phone;
        this.url = 'https://truewalletproxy-755211536068837409.rcf2.deploys.app/api';
    }

    getCode(text) {
        if (!text) return null;
        const patterns = [/v=([a-zA-Z0-9]+)/, /vouchers\/([a-zA-Z0-9]+)/, /campaign\/\?v=([a-zA-Z0-9]+)/];
        for (const p of patterns) {
            const m = text.match(p);
            if (m?.[1]) return m[1];
        }
        return null;
    }

    async redeem(code) {
        try {
            const r = await axios.post(this.url, { mobile: this.phone, voucher: code }, {
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'multilab' },
                timeout: 5000,
                validateStatus: () => true
            });
            const d = r.data;
            if (d?.status?.code === 'SUCCESS') {
                return {
                    ok: true,
                    amount: Number(d.data.my_ticket.amount_baht.replace(/,/g, "")),
                    owner: d.data.owner_profile.full_name || 'Unknown'
                };
            }
            return { ok: false, msg: d?.status?.message || d?.status?.code || 'Failed' };
        } catch (e) {
            return { ok: false, msg: e.message };
        }
    }
}

// ===============================================
// 🤖 Discord
// ===============================================

class Client {
    constructor(token) {
        this.token = token;
        this.ws = null;
        this.hb = null;
        this.sid = null;
        this.seq = null;
        this.retry = 0;
    }

    connect(handler) {
        if (this.ws) {
            this.ws.removeAllListeners();
            if (this.ws.readyState === 1) this.ws.close();
        }

        this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

        this.ws.on('open', () => {
            console.log(chalk.green('✓ Connected'));
            this.retry = 0;
        });

        this.ws.on('message', (data) => {
            const { op, d, s, t } = JSON.parse(data);
            if (s) this.seq = s;

            if (op === 10) {
                this.startHB(d.heartbeat_interval);
                this.sid && this.seq ? this.resume() : this.identify();
            } else if (op === 0) {
                if (t === 'READY') {
                    console.log(chalk.green(`✅ ${d.user.username}`));
                    this.sid = d.session_id;
                    log([{
                        title: "🟢 Bot เริ่มทำงาน",
                        color: 65280,
                        fields: [
                            { name: "👤 User", value: d.user.username, inline: true },
                            { name: "📱 Phone", value: config.phone.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2'), inline: true },
                            { name: "📢 แจ้งเตือน", value: config.webhook ? 'Discord Webhook' : 'Console', inline: true }
                        ],
                        timestamp: new Date().toISOString()
                    }]);
                } else if (t === 'MESSAGE_CREATE') {
                    handler(d);
                }
            } else if (op === 9) {
                this.sid = null;
                this.seq = null;
                setTimeout(() => this.identify(), 1000);
            } else if (op === 7) {
                this.ws.close();
            }
        });

        this.ws.on('close', () => {
            clearInterval(this.hb);
            if (this.retry < 10) {
                this.retry++;
                setTimeout(() => this.connect(handler), 2000);
            }
        });

        this.ws.on('error', () => {});
    }

    startHB(interval) {
        if (this.hb) clearInterval(this.hb);
        this.hb = setInterval(() => {
            if (this.ws?.readyState === 1) {
                this.ws.send(JSON.stringify({ op: 1, d: this.seq }));
            }
        }, interval);
    }

    identify() {
        setTimeout(() => {
            this.ws.send(JSON.stringify({
                op: 2,
                d: {
                    token: this.token,
                    capabilities: 16381,
                    properties: { os: 'Linux', browser: 'Chrome', device: '' },
                    presence: { status: 'online', since: 0, activities: [], afk: false }
                }
            }));
        }, Math.random() * 500 + 200);
    }

    resume() {
        this.ws.send(JSON.stringify({
            op: 6,
            d: { token: this.token, session_id: this.sid, seq: this.seq }
        }));
    }
}

// ===============================================
// 🚀 Main
// ===============================================

function startBot() {
    const voucher = new Voucher(config.phone);
    const client = new Client(config.token);
    const done = new Set();

    console.log(chalk.magenta('🔧 Fast Mode'));
    console.log(chalk.yellow(`📱 ${config.phone.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2')}`));
    console.log(chalk.cyan(`📢 แจ้งเตือน: ${config.webhook ? 'Discord Webhook' : 'Console'}`));

    const handle = async (msg) => {
        if (msg.author?.bot) return;

        const process = async (code, img = null, src = '') => {
            if (!code || done.has(code)) return;
            done.add(code);

            const time = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
            const start = Date.now();
            const r = await voucher.redeem(code);
            const speed = ((Date.now() - start) / 1000).toFixed(2);

            if (r.ok) {
                console.log(chalk.green(`✅ ${r.amount}฿ ${src}(${speed}s)`));
                stats.total += r.amount;
                stats.success++;
                log([{
                    title: `✅ สำเร็จ ${src}`,
                    color: 65280,
                    fields: [
                        { name: "💰 จำนวน", value: `${r.amount}฿`, inline: true },
                        { name: "👤 จาก", value: r.owner, inline: true },
                        { name: "⚡ ความเร็ว", value: `${speed}s`, inline: true },
                        { name: "🎫 Code", value: code },
                        { name: "⏰ เวลา", value: time, inline: true },
                        { name: "📊 สถิติ", value: `✅${stats.success} ❌${stats.fail} 💰${stats.total}฿` }
                    ],
                    thumbnail: img ? { url: img } : undefined,
                    timestamp: new Date().toISOString()
                }]);
            } else {
                console.log(chalk.red(`❌ ${r.msg} ${src}(${speed}s)`));
                stats.fail++;
                log([{
                    title: `❌ ล้มเหลว ${src}`,
                    color: 16711680,
                    fields: [
                        { name: "📝 สาเหตุ", value: r.msg },
                        { name: "⚡ ความเร็ว", value: `${speed}s`, inline: true },
                        { name: "🎫 Code", value: code },
                        { name: "📊 สถิติ", value: `✅${stats.success} ❌${stats.fail} 💰${stats.total}฿` }
                    ],
                    thumbnail: img ? { url: img } : undefined,
                    timestamp: new Date().toISOString()
                }]);
            }
        };

        if (msg.content) {
            const code = voucher.getCode(msg.content);
            if (code) process(code);
        }

        const imgs = [];

        if (msg.attachments?.length) {
            for (const a of msg.attachments) {
                if (a.content_type?.startsWith('image/') || a.filename?.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) {
                    imgs.push(getImg(a.url).then(decodeQR).then(qr => {
                        const c = voucher.getCode(qr);
                        if (c) process(c, a.url, 'QR ');
                    }).catch(() => {}));
                }
            }
        }

        if (msg.embeds?.length) {
            for (const e of msg.embeds) {
                const urls = [e.image?.url, e.thumbnail?.url].filter(Boolean);
                for (const u of urls) {
                    imgs.push(getImg(u).then(decodeQR).then(qr => {
                        const c = voucher.getCode(qr);
                        if (c) process(c, u, 'Embed QR ');
                    }).catch(() => {}));
                }
            }
        }

        if (imgs.length) await Promise.allSettled(imgs);
    };

    client.connect(handle);
}

process.on("uncaughtException", () => {});
process.on("unhandledRejection", () => {});
process.on('SIGTERM', () => {
    log([{ title: "🔴 Bot หยุด", color: 16711680, fields: [{ name: "📊 สถิติ", value: `✅${stats.success} ❌${stats.fail} 💰${stats.total}฿` }], timestamp: new Date().toISOString() }]);
    setTimeout(() => process.exit(0), 500);
});
process.on('SIGINT', () => {
    log([{ title: "🔴 Bot หยุด", color: 16711680, fields: [{ name: "📊 สถิติ", value: `✅${stats.success} ❌${stats.fail} 💰${stats.total}฿` }], timestamp: new Date().toISOString() }]);
    setTimeout(() => process.exit(0), 500);
});
