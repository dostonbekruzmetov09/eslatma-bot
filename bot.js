require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const fs = require('fs');
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);
const DATA_FILE = path.join(__dirname, 'data.json');

// Admin ID
const ADMIN_ID = 6756534512;

// Ma'lumotlarni yuklash funksiyasi
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE);
        return JSON.parse(raw);
    }
    return {};
}

// Ma'lumotlarni saqlash funksiyasi
function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let usersData = loadData();

bot.use(session());

const months = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'
];

// Eslatmalarni tekshirish (har daqiqada)
setInterval(() => {
    const now = new Date();
    Object.keys(usersData).forEach(userId => {
        if (usersData[userId].reminders) {
            usersData[userId].reminders.forEach(async (r) => {
                const rDate = new Date(r.timestamp);
                if (r.status === '⏳ Kutilmoqda' && rDate <= now) {
                    try {
                        const delayMs = now - rDate;
                        const delayMin = Math.floor(delayMs / 60000); 
                        
                        let message = `🔔 DIQQAT, ESLATMA!\n\n📌 Vazifa: ${r.task}\n⏰ Belgilangan vaqt: ${r.date}`;
                        if (delayMin >= 1) {
                            message += `\n\n⚠️ Uzr, texnik sabablarga ko'ra eslatmangiz ${delayMin} daqiqa kechikib yuborildi.`;
                        }
                        
                        await bot.telegram.sendMessage(userId, message);
                        r.status = '✅ Bajarildi';
                        saveData(usersData);
                    } catch (e) {
                        console.error(`Eslatma yuborishda xatolik (${userId}):`, e.message);
                    }
                }
            });
        }
    });
}, 60000); 

bot.command('me', (ctx) => {
    ctx.reply(`Sizning ID-ingiz: ${ctx.from.id}`);
});

bot.start((ctx) => {
    const userId = ctx.from.id;
    if (!usersData[userId]) {
        usersData[userId] = {
            id: userId,
            first_name: ctx.from.first_name,
            username: ctx.from.username,
            reminders: []
        };
        saveData(usersData);
    }

    ctx.session = {}; 
    
    let buttons = [[Markup.button.callback('➕ Yangi eslatma belgilash', 'set_reminder')], [Markup.button.callback('📂 Mening eslatmalarim', 'my_reminders')]];
    if (userId === ADMIN_ID) buttons.push([Markup.button.callback('👑 Admin Panel', 'admin_panel')]);

    ctx.reply('✨ Assalomu alaykum, xush kelibsiz! \n\nMen sizning shaxsiy ⏰ Eslatma botingizman.', Markup.inlineKeyboard(buttons));
});

bot.action('set_reminder', (ctx) => {
    ctx.session.step = 'waiting_for_task';
    const userId = ctx.from.id;
    if (!usersData[userId]) usersData[userId] = { id: userId, first_name: ctx.from.first_name, reminders: [] };
    usersData[userId].current_draft = { step: '📝 Vazifani yozmoqda...' };
    saveData(usersData);
    ctx.reply('📝 Eslatma matnini yozing:');
});

bot.on('text', async (ctx) => {
    const step = ctx.session?.step;
    const userId = ctx.from.id;

    if (step === 'waiting_for_task') {
        ctx.session.task = ctx.message.text;
        ctx.session.step = 'waiting_for_month';
        
        usersData[userId].current_draft = { task: ctx.message.text, step: '🗓 Oyni tanlamoqda...' };
        saveData(usersData);

        const monthButtons = [];
        for (let i = 0; i < months.length; i += 3) {
            monthButtons.push([
                Markup.button.callback(`📅 ${months[i]}`, `month_${i}`),
                Markup.button.callback(`📅 ${months[i+1]}`, `month_${i+1}`),
                Markup.button.callback(`📅 ${months[i+2]}`, `month_${i+2}`)
            ]);
        }
        ctx.reply('🗓 Oyni tanlang:', Markup.inlineKeyboard(monthButtons));
    } else if (step === 'waiting_for_day') {
        const day = parseInt(ctx.message.text);
        if (isNaN(day) || day < 1 || day > 31) return ctx.reply('❌ Noto\'g\'ri sana!');
        
        ctx.session.day = day;
        ctx.session.step = 'waiting_for_time';
        
        usersData[userId].current_draft.day = day;
        usersData[userId].current_draft.step = '🕒 Vaqtni kiritmoqda...';
        saveData(usersData);

        ctx.reply('🕒 Vaqtni kiriting (masalan 13:00):');
    } else if (step === 'waiting_for_time') {
        const timeStr = ctx.message.text;
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(timeStr)) return ctx.reply('⚠️ Noto\'g\'ri format!');

        const [hours, minutes] = timeStr.split(':').map(Number);
        const now = new Date();
        let year = now.getFullYear();
        
        let reminderDate = new Date(year, ctx.session.month, ctx.session.day, hours, minutes);
        
        if (reminderDate <= now) {
            reminderDate.setFullYear(year + 1);
            year = year + 1;
        }

        if (!usersData[userId].reminders) usersData[userId].reminders = [];
        const taskName = ctx.session.task;
        usersData[userId].reminders.push({
            task: taskName,
            date: `${ctx.session.day}-${months[ctx.session.month]} ${year}, ${timeStr}`,
            timestamp: reminderDate.getTime(),
            status: '⏳ Kutilmoqda'
        });
        
        delete usersData[userId].current_draft;
        saveData(usersData);

        ctx.reply(`✅ Eslatma saqlandi!\n📅 Sana: ${ctx.session.day}-${months[ctx.session.month]} ${year}-yil\n🕒 Vaqt: ${timeStr}\n📝 Vazifa: ${taskName}`);
        ctx.session = {}; 
    }
});

bot.action(/^month_(\d+)$/, (ctx) => {
    const userId = ctx.from.id;
    const monthIndex = parseInt(ctx.match[1]);
    ctx.session.month = monthIndex;
    ctx.session.step = 'waiting_for_day';
    
    if (!usersData[userId]) usersData[userId] = { id: userId, first_name: ctx.from.first_name, reminders: [] };
    if (!usersData[userId].current_draft) usersData[userId].current_draft = {};
    
    usersData[userId].current_draft.month = months[monthIndex];
    usersData[userId].current_draft.step = '🔢 Sanani kiritmoqda...';
    saveData(usersData);

    ctx.editMessageText(`✅ ${months[monthIndex]} tanlandi. \n🔢 Sanani yozing:`);
});

bot.action('my_reminders', (ctx) => {
    const userId = ctx.from.id;
    const u = usersData[userId];
    if (!u || !u.reminders || u.reminders.length === 0) {
        return ctx.reply('📂 Sizda hali eslatmalar yo\'q.');
    }
    
    let list = '📂 Sizning eslatmalaringiz:\n\n';
    u.reminders.slice(-10).forEach((r, i) => { 
        list += `${i+1}. [${r.date}] ${r.task} (${r.status})\n`;
    });
    
    ctx.reply(list);
});

bot.action('admin_panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply('👑 Admin Panel:', Markup.inlineKeyboard([[Markup.button.callback('👥 Foydalanuvchilar', 'users_list')], [Markup.button.callback('⬅️ Orqaga', 'back_to_main')]]));
});

bot.action('users_list', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const userButtons = Object.values(usersData).map(u => [Markup.button.callback(u.first_name || `User ${u.id}`, `user_info_${u.id}`)]);
    userButtons.push([Markup.button.callback('⬅️ Orqaga', 'admin_panel')]);
    ctx.reply('👥 Botdan foydalanganlar:', Markup.inlineKeyboard(userButtons));
});

bot.action(/^user_info_(\d+)$/, (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const targetUserId = parseInt(ctx.match[1]);
    const u = usersData[targetUserId];
    
    let info = `👤 Ism: ${u.first_name}\n🆔 ID: ${u.id}\n`;
    
    if (u.current_draft) {
        info += `\n🔄 Hozirgi jarayon (Draft):\n- Holat: ${u.current_draft.step || 'Noma\'lum'}\n`;
        if (u.current_draft.task) info += `- Matn: ${u.current_draft.task}\n`;
        if (u.current_draft.month) info += `- Oy: ${u.current_draft.month}\n`;
    }

    info += `\n📅 Eslatmalar:\n` + (u.reminders || []).map((r, i) => `${i+1}. [${r.date}] ${r.task} (${r.status})`).join('\n');
    
    ctx.reply(info || 'Ma\'lumot yo\'q', Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', 'users_list')]]));
});

bot.action('back_to_main', (ctx) => {
    ctx.session = {};
    let buttons = [[Markup.button.callback('➕ Yangi eslatma belgilash', 'set_reminder')], [Markup.button.callback('📂 Mening eslatmalarim', 'my_reminders')]];
    if (ctx.from.id === ADMIN_ID) buttons.push([Markup.button.callback('👑 Admin Panel', 'admin_panel')]);
    ctx.editMessageText('✨ Asosiy menyu:', Markup.inlineKeyboard(buttons));
});

bot.launch().then(() => console.log('Bot ishga tushdi! ✅'));
