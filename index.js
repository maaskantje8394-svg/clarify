import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
    Client,
    Collection,
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
const RAID_CHANNEL = '1522886310002557069';
const APPEAL_CHANNEL = '1522893846571384862';
const GUILD_ID = '1520173364436664390';
const INVITE = 'https://discord.gg/ZptAeYahhc';

// ================= STATE =================
const pendingBuilds = new Map();
const claimedTickets = new Map();
const appealSessions = new Collection();

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

────────────────────────────────────────────────

## <:U_:1522720864720916510> **Clarity+**
**Price:** \`€2.50\` **or** \`1 Server Boost\`

- Lifetime access
- 5+ exclusive methods
- Edit help & support
- Future method updates
- Private methods channel
- Exclusive editing resources
- Community support
- Special Discord role
- Priority assistance
- Access to premium giveaways

────────────────────────────────────────────────

## <:U_:1522720864720916510> **Clarity++**
**Price:** \`€5.00\` **or** \`2 Server Boosts\`

Includes **everything in Methods**, plus:

- Highest quality private methods
- Advanced editing methods
- Early access to new releases
- Premium resources & assets
- Exclusive guides & tutorials
- Private request channel
- Faster support priority
- Exclusive future content
- Premium Discord role
- VIP giveaways & events

────────────────────────────────────────────────

**Interested? Open a ticket in <#1522715255036313662> and choose your preferred payment method.** <:U_:1522719037610790923>`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('buy_plus')
                .setLabel('Clarity+')
                .setEmoji('<:Clarity:1522719037610790923>')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId('buy_plusplus')
                .setLabel('Clarity++')
                .setEmoji('<:Clarity:1522719037610790923>')
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
    const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    let transcript = `Transcript — ${interaction.channel.name}\n`;
    transcript += `──────────────────────────────────────────────────\n\n`;

    sorted.forEach(m => {

        const time = new Date(m.createdTimestamp).toLocaleString();

        if (m.author.bot) {
            transcript += `${m.author.username}: ${m.content || ''}\n`;

            if (m.embeds.length > 0) {
                m.embeds.forEach(embed => {
                    transcript += `  [Embed] ${embed.title || 'No Title'}\n`;
                    if (embed.description) transcript += `  ${embed.description}\n`;
                });
            }

            if (m.attachments.size > 0) {
                m.attachments.forEach(att => {
                    transcript += `  [Attachment] ${att.name} — ${att.url}\n`;
                });
            }

            transcript += `\n`;
        } else {
            transcript += `${m.author.tag}: ${m.content || ''}\n`;

            if (m.attachments.size > 0) {
                m.attachments.forEach(att => {
                    transcript += `  [Attachment] ${att.name} — ${att.url}\n`;
                });
            }

            transcript += `\n`;
        }
    });

    const filePath = path.join('./transcripts', `${interaction.channel.id}.txt`);
    fs.writeFileSync(filePath, transcript);

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

// ================= ANTI RAID =================

client.on(Events.MessageCreate, async (message) => {

    if (!message.guild) return;
    if (message.author.bot) return;

    if (message.channel.id !== RAID_CHANNEL) return;

    try {
        await message.delete().catch(() => {});
    } catch {}

    const member = message.member;

    if (!member) return;

    try {

        const embed = new EmbedBuilder()
            .setColor('#0a0a0a')
            .setTitle('You Have Been BANNED <:Clarity:1522719037610790923>')
            .setDescription(
`> Our automated **Anti Raid / Anti Hack system** detected suspicious activity.

-# If you believe this was a mistake, you can submit a ban **appeal below.**`
            )
            .setImage('https://cdn.discordapp.com/attachments/1518352163603091577/1522728390652723300/Bannder.jpg');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ban_appeal')
                .setLabel('Ban Appeal')
                .setEmoji('<:Clarity:1522719037610790923>')
                .setStyle(ButtonStyle.Secondary)
        );

        await member.send({
            embeds: [embed],
            components: [row]
        }).catch(() => {});

    } catch {}

    try {

        await member.ban({
            deleteMessageSeconds: 60,
            reason: 'Anti Raid / Anti Hack Protection'
        });

        console.log(`${member.user.tag} banned by Anti Raid`);

    } catch (err) {

        console.log(err);

    }

});
// ================= APPEAL QUESTIONS =================

async function startAppealQuestions(user) {

    const dm = await user.createDM();

    const questions = [
        'Why do you believe your ban should be removed?',
        'What happened before you were banned?',
        'Is there anything else you would like the staff team to know?'
    ];

    const answers = [];

    await dm.send({
        embeds: [
            new EmbedBuilder()
                .setColor('#0a0a0a')
                .setTitle('Ban Appeal')
                .setDescription(
`Please answer the following questions.

You have **5 minutes** per question.

Your appeal will be reviewed by our staff team.`
                )
        ]
    });

    for (let i = 0; i < questions.length; i++) {

        await dm.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#0a0a0a')
                    .setTitle(`Question ${i + 1}/3`)
                    .setDescription(questions[i])
            ]
        });

        const collected = await dm.awaitMessages({
            filter: m => m.author.id === user.id,
            max: 1,
            time: 300000
        });

        if (!collected.size) {
            await dm.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#0a0a0a')
                        .setDescription('Your appeal has expired because you did not answer in time.')
                ]
            });

            return;
        }

        answers.push(collected.first().content);
    }

    const appealChannel = client.channels.cache.get(APPEAL_CHANNEL);

    if (!appealChannel) return;

const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId('appeal_accept')
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
    
// ================= BAN APPEAL BUTTON =================

client.on(Events.InteractionCreate, async (interaction) => {

    if (!interaction.isButton()) return;
    if (interaction.customId !== 'ban_appeal') return;

    if (appealSessions.has(interaction.user.id)) {
        return interaction.reply({
            content: 'You already have an appeal in progress.',
            ephemeral: true
        });
    }

    appealSessions.set(interaction.user.id, true);

    try {

        await interaction.deferReply({ ephemeral: true });

        await interaction.editReply({
            content: 'Check your DMs. We will ask you a few questions.'
        });

        await startAppealQuestions(interaction.user);

    } catch (err) {

        console.error(err);

        try {
            await interaction.user.send(
                'An error occurred while creating your appeal. Please try again later or contact <@1189931854657224858>.'
            );
        } catch {}

    } finally {

        appealSessions.delete(interaction.user.id);

    }

});

// ================= APPEAL REVIEW =================

    const accepted = interaction.customId === 'appeal_accept';

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);

    embed.addFields({
        name: 'Reviewed',
        value: `${accepted ? '✅ Accepted' : '❌ Denied'} by ${interaction.user}`
    });

    const disabledRow = new ActionRowBuilder().addComponents(

        ButtonBuilder.from(interaction.message.components[0].components[0])
            .setDisabled(true),

        ButtonBuilder.from(interaction.message.components[0].components[1])
            .setDisabled(true)

    );

    await interaction.update({
        embeds: [embed],
        components: [disabledRow]
    });

});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.end('Bot online');
}).listen(PORT);

client.login(process.env.TOKEN);
