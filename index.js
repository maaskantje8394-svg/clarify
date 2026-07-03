import 'dotenv/config';
import http from 'http';
import {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    Events,
    PermissionsBitField,
    ChannelType
} from 'discord.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const WELCOME_CHANNEL = '1520535431827951656';
const pendingBuilds = new Map();

client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.GuildMemberAdd, async (member) => {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor('#000000')
        .setDescription(
            `<:Clarity:1522719037610790923> Welcome ${member} to **${member.guild.name}**!`
        )
        .setImage(
            'https://cdn.discordapp.com/attachments/1518352163603091577/1522728390652723300/Bannder.jpg?ex=6a4986d3&is=6a483553&hm=e8ece5dd2a9b50cfe9b9af1d47655b7031a716a3ab80af0fac65a4926576aa50'
        )
        .setTimestamp();

    await channel.send({
        embeds: [embed]
    });
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    // Alleen admins
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return;

    // Start builder
    if (message.content.startsWith('!build')) {
        const channel =
            message.mentions.channels.first() ||
            message.guild.channels.cache.get(message.content.split(' ')[1]);

        if (!channel || channel.type !== ChannelType.GuildText) {
            return message.reply(
                'Usage: `!build #channel`'
            );
        }

        pendingBuilds.set(message.author.id, channel.id);

        return message.reply(
            '✍️ Send the embed content in your **next message**.\nType `cancel` to cancel.'
        );
    }

    // Builder actief?
    if (!pendingBuilds.has(message.author.id)) return;

    if (message.content.toLowerCase() === 'cancel') {
        pendingBuilds.delete(message.author.id);
        return message.reply('❌ Builder cancelled.');
    }

    const channelId = pendingBuilds.get(message.author.id);
    pendingBuilds.delete(message.author.id);

    const lines = message.content.split('\n');

    let title = null;

    if (lines[0].startsWith('# ')) {
        title = lines.shift().substring(2).trim();
    }

    const description = lines.join('\n').trim();

    const embed = new EmbedBuilder()
        .setColor('#0a0a0a')
        .setThumbnail(
            'https://cdn.discordapp.com/attachments/1518352163603091577/1522728390652723300/Bannder.jpg?ex=6a4986d3&is=6a483553&hm=e8ece5dd2a9b50cfe9b9af1d47655b7031a716a3ab80af0fac65a4926576aa50'
        )
        .setTimestamp();

    if (title) embed.setTitle(title);

    embed.setDescription(description);

    const target = message.guild.channels.cache.get(channelId);

    if (!target) {
        return message.reply('❌ Channel not found.');
    }

    await target.send({
        embeds: [embed]
    });

    await message.reply(`✅ Embed sent to ${target}.`);
});

// Render / UptimeRobot
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Clarity Bot is online!');
}).listen(PORT, () => {
    console.log(`🌐 Web server listening on port ${PORT}`);
});

client.login(process.env.TOKEN);
