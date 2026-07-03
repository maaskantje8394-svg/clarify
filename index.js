import 'dotenv/config';
import http from 'http';
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

// ===================== IDS =====================
const WELCOME_CHANNEL = '1520535431827951656';
const CATEGORY_PLUS = '1522741887637651566';
const CATEGORY_PLUSPLUS = '1522741953568178397';
const LOG_CHANNEL = '1522742039912124470';

// ===================== BUILD MAP =====================
const pendingBuilds = new Map();

// ===================== READY =====================
client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// ===================== WELCOME =====================
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

    channel.send({ embeds: [embed] });
});

// ===================== !BUILD =====================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    if (message.content.startsWith('!build')) {
        const channel =
            message.mentions.channels.first() ||
            message.guild.channels.cache.get(message.content.split(' ')[1]);

        if (!channel) return message.reply('Use: `!build #channel`');

        pendingBuilds.set(message.author.id, channel.id);

        return message.reply('Send embed content now. Type cancel to stop.');
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

    const embed = new EmbedBuilder()
        .setColor('#0a0a0a');

    if (title) embed.setTitle(title);

    embed.setDescription(lines.join('\n'));

    const target = message.guild.channels.cache.get(channelId);

    target.send({ embeds: [embed] });

    message.reply('Embed sent.');
});

// ===================== !PANEL =====================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    if (message.content === '!panel') {

        const embed = new EmbedBuilder()
            .setColor('#0a0a0a')
            .setTitle('<:Clarity:1522719037610790923> Clarity Store')
            .setDescription(
`Choose your rank:

Clarity+ (€2.50 / 1 Boost)
Clarity++ (€5 / 2 Boosts)`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('buy_plus')
                .setLabel('Clarity+')
                .setEmoji('<:Clarity:1522719037610790923>')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId('buy_plusplus')
                .setLabel('Clarity++')
                .setEmoji('<:Clarity:1522719037610790923>')
                .setStyle(ButtonStyle.Success)
        );

        message.channel.send({ embeds: [embed], components: [row] });
    }
});

// ===================== BUTTONS + TICKETS =====================
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const member = interaction.member;
    const guild = interaction.guild;

    let category = null;
    let name = null;
    let title = null;
    let price = null;

    if (interaction.customId === 'buy_plus') {
        category = CATEGORY_PLUS;
        name = `clarityplus-${member.user.username}`;
        title = 'Clarity+ Purchase';
        price = '€2.50 or 1 Boost';
    }

    if (interaction.customId === 'buy_plusplus') {
        category = CATEGORY_PLUSPLUS;
        name = `clarityplusplus-${member.user.username}`;
        title = 'Clarity++ Purchase';
        price = '€5 or 2 Boosts';
    }

    if (!category) return;

    const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category,
        permissionOverwrites: [
            {
                id: guild.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: member.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            }
        ]
    });

    const embed = new EmbedBuilder()
        .setColor('#0a0a0a')
        .setTitle(`<:Clarity:1522719037610790923> ${title}`)
        .setDescription(
`Welcome ${member}

Price: ${price}

Please tell us your payment method.`
        );

    channel.send({ embeds: [embed] });

    interaction.reply({
        content: `Ticket created: ${channel}`,
        ephemeral: true
    });

    const log = guild.channels.cache.get(LOG_CHANNEL);
    if (log) {
        log.send(`New ticket: ${channel.name} by ${member.user.tag}`);
    }
});

// ===================== SERVER =====================
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.end('Bot online');
}).listen(PORT);

client.login(process.env.TOKEN);
