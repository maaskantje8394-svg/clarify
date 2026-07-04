import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
    Client,
    Collection,
    GatewayIntentBits,
    Partials,
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
// FIX: DirectMessages intent + Partials toegevoegd.
// Zonder deze twee kan de bot geen berichten/interacties in DM's
// goed verwerken -> dit was de oorzaak van "interaction failed"
// zodra iemand op de Ban Appeal knop in zijn DM klikte, en de reden
// dat awaitMessages() in de DM nooit antwoorden binnenkreeg.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
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

// ================= DEBUG: RAW INTERACTION LOGGER =================
// Tijdelijk, om te zien of interacties uberhaupt binnenkomen.
client.on(Events.InteractionCreate, (interaction) => {
    console.log('[RAW INTERACTION]', {
        type: interaction.type,
        isButton: interaction.isButton?.(),
        customId: interaction.customId,
        channelType: interaction.channel?.type,
        guildId: interaction.guildId,
        user: interaction.user?.tag
    });
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

    // Deze listener is alleen voor het ticket-systeem.
    // Appeal-knoppen worden verderop in aparte listeners afgehandeld.
    const ticketCustomIds = ['buy_plus', 'buy_plusplus', 'close', 'claim'];
    if (!ticketCustomIds.includes(interaction.customId)) return;

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

        answers.push(collected.first().content || '*No text content*');
    }

    const appealChannel = client.channels.cache.get(APPEAL_CHANNEL);

    if (!appealChannel) return;

    // FIX/NIEUW: Accept / Deny knoppen op de appeal embed.
    // De user id zit verwerkt in de customId zodat we later weten
    // wie geaccepteerd/afgewezen moet worden.
    const embed = new EmbedBuilder()
        .setColor('#0a0a0a')
        .setTitle('New Ban Appeal')
        .setThumbnail(user.displayAvatarURL())
        .addFields(
            {
                name: 'User',
                value: `${user.tag}\n\`${user.id}\``
            },
            {
                name: 'Question 1',
                value: answers[0]
            },
            {
                name: 'Question 2',
                value: answers[1]
            },
            {
                name: 'Question 3',
                value: answers[2]
            }
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`appeal_accept_${user.id}`)
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`appeal_deny_${user.id}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
    );

    await appealChannel.send({ embeds: [embed], components: [row] });

    await dm.send({
        embeds: [
            new EmbedBuilder()
                .setColor('#0a0a0a')
                .setDescription('✅ Your appeal has been submitted successfully.')
        ]
    });

}

// ================= BAN APPEAL BUTTON =================

client.on(Events.InteractionCreate, async (interaction) => {

    if (!interaction.isButton()) return;

    if (interaction.customId !== 'ban_appeal') return;

    if (appealSessions.has(interaction.user.id)) {
        return interaction.reply({
            content: 'You already have an appeal in progress.',
            flags: 64
        }).catch(() => {});
    }

    appealSessions.set(interaction.user.id, true);

    // FIX: reply direct binnen de DM afhandelen in een try/catch,
    // zodat een fout hier niet meer als "interaction failed" eindigt
    // zonder duidelijkheid, en we het altijd in de console zien.
    try {
        await interaction.reply({
            content: 'We will ask you a few questions here in your DMs.',
            flags: 64
        });
    } catch (err) {
        console.error('Failed to acknowledge ban_appeal interaction:', err);
    }

    try {
        await startAppealQuestions(interaction.user);
    } catch (err) {
        console.error('Appeal error:', err);

        try {
            await interaction.user.send(
                'An error occurred while creating your appeal. Please try again later.'
            );
        } catch {}
    }

    appealSessions.delete(interaction.user.id);

});

// ================= APPEAL ACCEPT / DENY =================
// NIEUW: staff kan de appeal in het appeal-kanaal accepteren of afwijzen.
client.on(Events.InteractionCreate, async (interaction) => {

    if (!interaction.isButton()) return;

    const isAccept = interaction.customId.startsWith('appeal_accept_');
    const isDeny = interaction.customId.startsWith('appeal_deny_');

    if (!isAccept && !isDeny) return;

    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
        return interaction.reply({ content: 'Guild not found.', flags: 64 }).catch(() => {});
    }

    // Alleen staff mag accepteren/afwijzen
    const staffMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!staffMember || !staffMember.roles.cache.has(STAFF_ROLE)) {
        return interaction.reply({ content: 'No permission.', flags: 64 }).catch(() => {});
    }

    const targetId = interaction.customId.replace(isAccept ? 'appeal_accept_' : 'appeal_deny_', '');

    await interaction.deferUpdate().catch(() => {});

    const targetUser = await client.users.fetch(targetId).catch(() => null);

    if (isAccept) {

        try {
            await guild.members.unban(targetId, `Ban appeal accepted by ${staffMember.user.tag}`);
        } catch (err) {
            console.error('Unban failed:', err);
        }

        if (targetUser) {
            await targetUser.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#0a0a0a')
                        .setTitle('Ban Appeal Accepted <:Clarity:1522719037610790923>')
                        .setDescription(
`Your ban appeal has been **accepted** and you have been unbanned.

You can rejoin the server using the invite below:
${INVITE}`
                        )
                ]
            }).catch(() => {});
        }

    } else {

        if (targetUser) {
            await targetUser.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#0a0a0a')
                        .setTitle('Ban Appeal Denied <:Clarity:1522719037610790923>')
                        .setDescription('Your ban appeal has been **denied**. The ban remains in place.')
                ]
            }).catch(() => {});
        }
    }

    // Embed updaten in het appeal-kanaal met de status, knoppen verwijderen
    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = originalEmbed
        ? EmbedBuilder.from(originalEmbed)
            .setColor(isAccept ? '#2ecc71' : '#e74c3c')
            .addFields({
                name: 'Status',
                value: `${isAccept ? '✅ Accepted' : '❌ Denied'} by ${staffMember.user.tag}`
            })
        : new EmbedBuilder().setDescription(isAccept ? '✅ Accepted' : '❌ Denied');

    await interaction.editReply({ embeds: [updatedEmbed], components: [] }).catch(() => {});

});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.end('Bot online');
}).listen(PORT);

client.login(process.env.TOKEN);
