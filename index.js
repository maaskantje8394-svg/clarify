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
        )
        .setTimestamp();

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
        return message.reply('Send embed content now or type cancel.');
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
            .setDescription(
`# Clarity+ & Clarity++ <:Clarity:1522719037610790923>

> Unlock exclusive TikTok methods, editing resources, and premium community perks.

────────────────────────

## Clarity+

€2.50 / 1 Boost
- 5+ methods
- editing help
- updates

────────────────────────

## Clarity++

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

    let category, name, title, price;

    if (interaction.customId === 'buy_plus') {
        category = CATEGORY_PLUS;
        name = `clarityplus-${member.user.username}`;
        title = 'Clarity+';
        price = '€2.50 / 1 Boost';
    }

    if (interaction.customId === 'buy_plusplus') {
        category = CATEGORY_PLUSPLUS;
        name = `clarityplusplus-${member.user.username}`;
        title = 'Clarity++';
        price = '€5 / 2 Boosts';
    }

    if (!category) return;

    const channel = await guild.channels.create({
        name,
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

    // LOG
    const log = guild.channels.cache.get(LOG_CHANNEL);
    if (log) {
        log.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#0a0a0a')
                    .setTitle('Ticket Created')
                    .setDescription(
`User: ${member.user.tag}
Ticket: ${channel.name}
Type: ${title}
Price: ${price}
Time: <t:${Math.floor(Date.now()/1000)}:F>`
                    )
            ]
        });
    }

    interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
});

// ================= CLAIM + CLOSE =================
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const member = interaction.member;
    const channel = interaction.channel;

    // CLAIM
    if (interaction.customId === 'claim') {
        if (!member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ content: 'No permission.', ephemeral: true });
        }

        claimedTickets.set(channel.id, member.id);

        return interaction.reply(`Claimed by ${member}`);
    }

    // CLOSE
    if (interaction.customId === 'close') {

        if (!member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ content: 'No permission.', ephemeral: true });
        }

        await interaction.reply('Closing ticket...');

        // TRANSCRIPT
        const messages = await channel.messages.fetch();
        const transcript = messages
            .map(m => `${m.author.tag}: ${m.content}`)
            .reverse()
            .join('\n');

        const filePath = path.join('./transcripts', `${channel.id}.txt`);
        fs.writeFileSync(filePath, transcript);

        const log = channel.guild.channels.cache.get(LOG_CHANNEL);

        if (log) {
            log.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Ticket Closed')
                        .setDescription(
`Channel: ${channel.name}
Closed by: ${member.user.tag}
Claimed by: ${claimedTickets.get(channel.id) || 'None'}`
                        )
                ]
            });
        }

        setTimeout(() => {
            channel.delete().catch(() => {});
        }, 3000);
    }
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end('Bot online')).listen(PORT);

client.login(process.env.TOKEN);
