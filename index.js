import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    Events,
    PermissionsBitField,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

// ================= SAFE FOLDER =================
if (!fs.existsSync('./transcripts')) {
    fs.mkdirSync('./transcripts');
}

// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= IDS =================
const WELCOME_CHANNEL = '1520535431827951656';
const CATEGORY_PLUS = '1522741887637651566';
const CATEGORY_PLUSPLUS = '1522741953568178397';
const LOG_CHANNEL = '1522742039912124470';
const STAFF_ROLE = '1522712684775080056';

// ================= STATE =================
const pendingBuilds = new Map();
const claimedTickets = new Map();

// ================= READY =================
client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// ================= WELCOME =================
client.on(Events.GuildMemberAdd, async (member) => {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor('#000000')
        .setDescription(
            `<:Clarity:1522719037610790923> Welcome ${member} to **${member.guild.name}**!`
        )
        .setImage(
            'https://cdn.discordapp.com/attachments/1518352163603091577/1522728390652723300/Bannder.jpg'
        );

    channel.send({ embeds: [embed] });
});

// ================= BUILD =================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    if (message.content.startsWith('!build')) {
        const channel =
            message.mentions.channels.first() ||
            message.guild.channels.cache.get(message.content.split(' ')[1]);

        if (!channel) return message.reply('Use: `!build #channel`');

        pendingBuilds.set(message.author.id, channel.id);
        return message.reply('Send embed content or type cancel.');
    }

    if (!pendingBuilds.has(message.author.id)) return;

    if (message.content.toLowerCase() === 'cancel') {
        pendingBuilds.delete(message.author.id);
        return message.reply('Cancelled.');
    }

    const channelId = pendingBuilds.get(message.author.id);
    pendingBuilds.delete(message.author.id);

    const lines = message.content.split('\n');

    let title = null;
    if (lines[0].startsWith('# ')) {
        title = lines.shift().slice(2);
    }

    const embed = new EmbedBuilder().setColor('#0a0a0a');

    if (title) embed.setTitle(title);
    embed.setDescription(lines.join('\n'));

    const target = message.guild.channels.cache.get(channelId);
    if (target) target.send({ embeds: [embed] });

    message.reply('Embed sent.');
});

// ================= PANEL =================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    if (message.content === '!panel') {

        const embed = new EmbedBuilder()
            .setColor('#0a0a0a')
            .setTitle('Clarity+ & Clarity++ <:Clarity:1522719037610790923>')
            .setDescription(
`> Unlock exclusive TikTok methods, editing resources, and premium community perks.

────────────────────────────────────────

## <:U_:1522720864720916510> Clarity+

€2.50 / 1 Boost
- Lifetime access
- 5+ methods
- edit help
- updates

────────────────────────────────────────

## <:U_:1522720864720916510> Clarity++

€5 / 2 Boosts
- premium methods
- early access
- VIP content`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('buy_plus')
                .setLabel('Clarity+')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId('buy_plusplus')
                .setLabel('Clarity++')
                .setStyle(ButtonStyle.Secondary)
        );

        message.channel.send({ embeds: [embed], components: [row] });
    }
});

// ================= TICKETS =================
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const guild = interaction.guild;
    const member = interaction.member;

    let category, title, price;

    if (interaction.customId === 'buy_plus') {
        category = CATEGORY_PLUS;
        title = 'Clarity+';
        price = '€2.50 / 1 Boost';
    }

    if (interaction.customId === 'buy_plusplus') {
        category = CATEGORY_PLUSPLUS;
        title = 'Clarity++';
        price = '€5 / 2 Boosts';
    }

    // ================= CLOSE =================
    if (interaction.customId === 'close') {

        if (!member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ content: 'No permission.', flags: 64 });
        }

        await interaction.reply({ content: 'Closing ticket...', flags: 64 });

        const messages = await interaction.channel.messages.fetch();

        const html = `
        <html>
        <head>
            <style>
                body { background:#0a0a0a; color:white; font-family:Arial; }
                .msg { padding:8px; border-bottom:1px solid #222; }
                .author { color:#00aaff; font-weight:bold; }
            </style>
        </head>
        <body>
            <h2>Transcript ${interaction.channel.name}</h2>
            ${messages.map(m =>
                `<div class="msg"><span class="author">${m.author.tag}</span><br>${m.content || '[embed]'}</div>`
            ).reverse().join('')}
        </body>
        </html>`;

        const filePath = path.join('./transcripts', `${interaction.channel.id}.html`);
        fs.writeFileSync(filePath, html);

        const log = guild.channels.cache.get(LOG_CHANNEL);

        if (log) {
            log.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#0a0a0a')
                        .setTitle('Ticket Closed')
                        .setDescription(
`Channel: ${interaction.channel.name}
Closed by: ${member.user.tag}
Claimed: ${claimedTickets.get(interaction.channel.id) || 'None'}
Time: <t:${Math.floor(Date.now()/1000)}:F>`
                        )
                ],
                files: [filePath]
            });
        }

        return setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    }

    // ================= CLAIM =================
    if (interaction.customId === 'claim') {

        if (!member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ content: 'No permission.', flags: 64 });
        }

        claimedTickets.set(interaction.channel.id, member.user.tag);

        return interaction.reply({ content: `Claimed by ${member}`, flags: 64 });
    }

    // ================= OPEN =================
    if (!category) return;

    const channel = await guild.channels.create({
        name: `${title.toLowerCase()}-${member.user.username}`,
        type: ChannelType.GuildText,
        parent: category,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: STAFF_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
    });

    const embed = new EmbedBuilder()
        .setColor('#0a0a0a')
        .setDescription(
`<:Clarity:1522719037610790923> ${title}

User: ${member}

Price:
\`\`\`${price}\`\`\`

A staff member will help you soon.

<@&1522712684775080056>`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('close')
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId('claim')
            .setLabel('Claim')
            .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({
        content: `<@&1522712684775080056>`,
        embeds: [embed],
        components: [row]
    });

    return interaction.reply({
        content: `Ticket created: ${channel}`,
        flags: 64
    });
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.end('Bot online');
}).listen(PORT);

client.login(process.env.TOKEN);
