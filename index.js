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
    ButtonStyle,
    StringSelectMenuBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits
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
const QUARANTINE_ROLE = '1522929889701924914';
const QUARANTINE_CHANNEL = '1522930449687773275';
const GENERAL_CATEGORY = '1523800565178433699';
const METHOD_CATEGORY = '1523800765116842126';
const PARTNER_CATEGORY = '1523800633604575363';
const PARTNER_ROLE = '1523801588584546405';
const GUILD_ID = '1520173364436664390';
const INVITE = 'https://discord.gg/ZptAeYahhc';

// ================= STATE =================
const claimedTickets = new Map();
const appealSessions = new Collection();
const quarantinedRoles = new Map(); // userId -> array van role ids van voor de quarantaine
const ticketOwners = new Map(); // channelId -> userId, om transcript ook naar de maker te sturen
const inactivityTimers = new Map(); // channelId -> { timeout, ownerId }, voor /inactive

// ================= SLASH COMMANDS REGISTREREN =================
// Draait automatisch bij elke opstart van de bot. Hierdoor is er geen
// apart script of Shell-toegang nodig (die heb je niet op Render's
// gratis plan) om de slash commands bij Discord te registreren.
const slashCommands = [

    new SlashCommandBuilder()
        .setName('build')
        .setDescription('Stuur een custom embed naar een gekozen kanaal')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Het kanaal waar de embed naartoe moet')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('De inhoud van de embed (mag meerdere regels zijn)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Optionele titel voor de embed')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),

    new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Post het Clarity+ / Clarity++ verkooppaneel in dit kanaal')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('banp')
        .setDescription('Post het ban appeal paneel in dit kanaal (voor het quarantaine-kanaal)')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('tickets')
        .setDescription('Post het support ticket paneel (dropdown) in dit kanaal')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('rename')
        .setDescription('Hernoem het huidige ticket-kanaal')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('De nieuwe naam voor het kanaal')
                .setRequired(true))
        .toJSON(),

    new SlashCommandBuilder()
        .setName('close')
        .setDescription('Sluit het huidige ticket en stuur een transcript')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('closerequest')
        .setDescription('Vraag als ticket-opener om het ticket te sluiten (staff moet accepteren)')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('inactive')
        .setDescription('Waarschuw de ticket-opener: reageer binnen 12 uur of het ticket sluit automatisch')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('claim')
        .setDescription('Claim het huidige ticket')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('add')
        .setDescription('Voeg een gebruiker toe aan het huidige ticket')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('De gebruiker om toe te voegen')
                .setRequired(true))
        .toJSON()

];

async function registerSlashCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),
            { body: slashCommands }
        );

        console.log(`✅ ${slashCommands.length} slash commands geregistreerd.`);
    } catch (err) {
        console.error('❌ Slash commands registreren mislukt:', err);
    }
}

// ================= READY =================
client.once(Events.ClientReady, async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await registerSlashCommands();
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
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'build') return;

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'No permission.', flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    const content = interaction.options.getString('message');
    const title = interaction.options.getString('title');

    const embed = new EmbedBuilder().setColor('#0a0a0a');

    if (title) embed.setTitle(title);
    embed.setDescription(content);

    await channel.send({ embeds: [embed] });

    return interaction.reply({ content: `Embed sent to ${channel}.`, flags: 64 });
});

// ================= PANEL =================
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'panel') return;

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

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: 'Panel posted.', flags: 64 });
});

// ================= QUARANTINE / BAN APPEAL PANEL =================
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'banp') return;

    const embed = new EmbedBuilder()
        .setColor('#0a0a0a')
        .setTitle('Ban Appeal <:Clarity:1522719037610790923>')
        .setDescription(
`> Placed in quarantine by mistake? Submit an appeal below and our staff team will review it.

────────────────────────────────────────────────

## <:U_:1522720864720916510> **How does it work?**

- Click the **Appeal** button below
- Answer 3 short questions about your situation
- You have **5 minutes** per question to respond
- Our staff team reviews every appeal personally

────────────────────────────────────────────────

**Ready? Click the button below to get started.** <:U_:1522719037610790923>`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('quarantine_appeal')
            .setLabel('Appeal')
            .setEmoji('<:Clarity:1522719037610790923>')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: 'Panel posted.', flags: 64 });
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

// ================= SUPPORT TICKETS (DROPDOWN) =================
// Volledig los systeem van het bestaande !panel ticket-systeem hierboven.

function isNewTicketChannel(channel) {
    return [GENERAL_CATEGORY, METHOD_CATEGORY, PARTNER_CATEGORY].includes(channel.parentId);
}

function isTicketStaff(channel, member) {
    if (member.roles.cache.has(STAFF_ROLE)) return true;
    if (channel.parentId === PARTNER_CATEGORY && member.roles.cache.has(PARTNER_ROLE)) return true;
    return false;
}

async function generateAndSendTranscript(channel, guild, closedByTag) {

    const messages = await channel.messages.fetch();
    const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    let transcript = `Transcript — ${channel.name}\n`;
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

    const filePath = path.join('./transcripts', `${channel.id}.txt`);
    fs.writeFileSync(filePath, transcript);

    const log = guild.channels.cache.get(LOG_CHANNEL);

    if (log) {
        log.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#0a0a0a')
                    .setTitle('Ticket Closed')
                    .setDescription(
`Channel: ${channel.name}
Closed by: ${closedByTag}
Claimed: ${claimedTickets.get(channel.id) || 'None'}
Time: <t:${Math.floor(Date.now()/1000)}:F>`
                    )
            ],
            files: [filePath]
        });
    }

    // Transcript ook naar de ticket-maker sturen
    const ownerId = ticketOwners.get(channel.id);
    if (ownerId) {
        const ownerUser = await client.users.fetch(ownerId).catch(() => null);

        if (ownerUser) {
            await ownerUser.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#0a0a0a')
                        .setTitle('Ticket Closed <:Clarity:1522719037610790923>')
                        .setDescription(`Your ticket **${channel.name}** has been closed. A transcript of your conversation is attached below.`)
                ],
                files: [filePath]
            }).catch(() => {});
        }

        ticketOwners.delete(channel.id);
    }

    setTimeout(() => channel.delete().catch(() => {}), 3000);
}

// ---------- Paneel: /tickets ----------
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'tickets') return;

    const embed = new EmbedBuilder()
        .setColor('#0a0a0a')
        .setTitle('Support Tickets <:Clarity:1522719037610790923>')
        .setImage('https://cdn.discordapp.com/attachments/1518352163603091577/1522946476878200882/Bannder.jpg')
        .setDescription(
`> Need help? Select the category below that fits your request best.

────────────────────────────────────────

\`\`General Questions:\`\`
- General help, questions, or server issues.

\`\`Method Questions:\`\`
- Questions or support about a method you purchased.

\`\`Partnership:\`\`
- Partnership requests or collaborations.

────────────────────────────────────────

**Select an option below to open a ticket** <:Clarity:1522719037610790923>`
        );

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticket_select')
            .setPlaceholder('Select a ticket category')
            .addOptions(
                {
                    label: 'General Questions',
                    description: 'General help, questions, or server issues.',
                    value: 'ticket_general',
                    emoji: '🛠️'
                },
                {
                    label: 'Method Questions',
                    description: 'Questions or support about a purchased method.',
                    value: 'ticket_method',
                    emoji: '📘'
                },
                {
                    label: 'Partner Tickets',
                    description: 'Partnership requests or collaborations.',
                    value: 'ticket_partner',
                    emoji: '🤝'
                }
            )
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: 'Panel posted.', flags: 64 });
});

// ---------- Dropdown selectie: ticket aanmaken ----------
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'ticket_select') return;

    const guild = interaction.guild;
    const member = interaction.member;
    const choice = interaction.values[0];

    let category, title, prefix, mentionRoles;

    if (choice === 'ticket_general') {
        category = GENERAL_CATEGORY;
        title = 'General Questions';
        prefix = 'general';
        mentionRoles = [STAFF_ROLE];
    } else if (choice === 'ticket_method') {
        category = METHOD_CATEGORY;
        title = 'Method Questions';
        prefix = 'method';
        mentionRoles = [STAFF_ROLE];
    } else if (choice === 'ticket_partner') {
        category = PARTNER_CATEGORY;
        title = 'Partner Tickets';
        prefix = 'partner';
        mentionRoles = [STAFF_ROLE, PARTNER_ROLE];
    } else {
        return;
    }

    const overwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ];

    mentionRoles.forEach(roleId => {
        overwrites.push({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
    });

    const channel = await guild.channels.create({
        name: `${prefix}-${member.user.username}`,
        type: ChannelType.GuildText,
        parent: category,
        permissionOverwrites: overwrites
    });

    ticketOwners.set(channel.id, member.id);

    const roleMentions = mentionRoles.map(r => `<@&${r}>`).join(' ');

    const embed = new EmbedBuilder()
        .setColor('#0a0a0a')
        .setDescription(
`<:Clarity:1522719037610790923> ${title}

User: ${member}

A staff member will help you soon.

${roleMentions}`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('newticket_close')
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId('newticket_claim')
            .setLabel('Claim')
            .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({
        content: roleMentions,
        embeds: [embed],
        components: [row]
    });

    return interaction.reply({
        content: `Ticket created: ${channel}`,
        flags: 64
    });
});

// ---------- Claim / Close knoppen ----------
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'newticket_close' && interaction.customId !== 'newticket_claim') return;

    const member = interaction.member;

    if (!isTicketStaff(interaction.channel, member)) {
        return interaction.reply({ content: 'No permission.', flags: 64 }).catch(() => {});
    }

    if (interaction.customId === 'newticket_claim') {
        claimedTickets.set(interaction.channel.id, member.user.tag);
        return interaction.reply({ content: `Claimed by ${member}`, flags: 64 });
    }

    // newticket_close
    await interaction.reply({ content: 'Closing ticket...', flags: 64 });
    await generateAndSendTranscript(interaction.channel, interaction.guild, member.user.tag);
});

// ---------- /rename ----------
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'rename') return;
    if (!isNewTicketChannel(interaction.channel)) {
        return interaction.reply({ content: 'This command only works in ticket channels.', flags: 64 });
    }

    if (!isTicketStaff(interaction.channel, interaction.member)) {
        return interaction.reply({ content: 'No permission.', flags: 64 });
    }

    const newName = interaction.options.getString('name');

    const sanitized = newName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 90);

    if (!sanitized) return interaction.reply({ content: 'Invalid name.', flags: 64 });

    await interaction.channel.setName(sanitized).catch(() => {});
    return interaction.reply({ content: `Channel renamed to \`${sanitized}\`.`, flags: 64 });
});

// ---------- /close ----------
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'close') return;
    if (!isNewTicketChannel(interaction.channel)) {
        return interaction.reply({ content: 'This command only works in ticket channels.', flags: 64 });
    }

    if (!isTicketStaff(interaction.channel, interaction.member)) {
        return interaction.reply({ content: 'No permission.', flags: 64 });
    }

    await interaction.reply({ content: 'Closing ticket...', flags: 64 });
    await generateAndSendTranscript(interaction.channel, interaction.guild, interaction.user.tag);
});

// ---------- /closerequest ----------
// De ticket-opener vraagt om te sluiten; staff moet dit accepteren of afwijzen.
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'closerequest') return;
    if (!isNewTicketChannel(interaction.channel)) {
        return interaction.reply({ content: 'This command only works in ticket channels.', flags: 64 });
    }

    const ownerId = ticketOwners.get(interaction.channel.id);
    if (ownerId && interaction.user.id !== ownerId) {
        return interaction.reply({ content: 'Only the ticket creator can request a close.', flags: 64 });
    }

    const embed = new EmbedBuilder()
        .setColor('#0a0a0a')
        .setTitle('Close Request <:Clarity:1522719037610790923>')
        .setDescription(`${interaction.user} has requested to close this ticket.\n\nStaff can accept or deny below.`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('closerequest_accept')
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('closerequest_deny')
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
});

// ---------- Accept/Deny knoppen van /closerequest ----------
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'closerequest_accept' && interaction.customId !== 'closerequest_deny') return;

    if (!isTicketStaff(interaction.channel, interaction.member)) {
        return interaction.reply({ content: 'No permission.', flags: 64 }).catch(() => {});
    }

    if (interaction.customId === 'closerequest_accept') {
        await interaction.update({
            content: 'Close request accepted, closing ticket...',
            embeds: [],
            components: []
        }).catch(() => {});

        await generateAndSendTranscript(interaction.channel, interaction.guild, interaction.user.tag);
    } else {
        await interaction.update({
            content: 'Close request denied. The ticket remains open.',
            embeds: [],
            components: []
        }).catch(() => {});
    }
});

// ---------- /inactive ----------
// Waarschuwt de ticket-opener en sluit het ticket automatisch na 12 uur
// zonder reactie. Let op: deze timer leeft alleen in het geheugen van het
// bot-proces. Als de bot herstart (bijv. Render die slaapt/redeploy doet)
// voordat de 12 uur voorbij zijn, gaat de timer verloren en moet /inactive
// opnieuw gebruikt worden.
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'inactive') return;
    if (!isNewTicketChannel(interaction.channel)) {
        return interaction.reply({ content: 'This command only works in ticket channels.', flags: 64 });
    }

    if (!isTicketStaff(interaction.channel, interaction.member)) {
        return interaction.reply({ content: 'No permission.', flags: 64 });
    }

    const ownerId = ticketOwners.get(interaction.channel.id);
    if (!ownerId) {
        return interaction.reply({ content: 'Could not determine the ticket creator for this channel.', flags: 64 });
    }

    const existing = inactivityTimers.get(interaction.channel.id);
    if (existing) clearTimeout(existing.timeout);

    const channelId = interaction.channel.id;
    const guildId = interaction.guild.id;

    const timeout = setTimeout(async () => {
        inactivityTimers.delete(channelId);

        const guild = client.guilds.cache.get(guildId);
        const ch = guild?.channels.cache.get(channelId);

        if (ch) {
            await ch.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#0a0a0a')
                        .setDescription('This ticket has been automatically closed due to inactivity.')
                ]
            }).catch(() => {});

            await generateAndSendTranscript(ch, guild, 'Auto-close (inactivity)');
        }
    }, 12 * 60 * 60 * 1000);

    inactivityTimers.set(channelId, { timeout, ownerId });

    const embed = new EmbedBuilder()
        .setColor('#0a0a0a')
        .setTitle('Inactivity Warning <:Clarity:1522719037610790923>')
        .setDescription(
`<@${ownerId}>, we haven't heard from you in a while.

If you don't reply within **12 hours**, this ticket will automatically be closed.`
        );

    await interaction.reply({ content: `<@${ownerId}>`, embeds: [embed] });
});

// Annuleert de auto-close timer zodra de ticket-opener weer iets typt
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    const timer = inactivityTimers.get(message.channel.id);
    if (!timer) return;
    if (message.author.id !== timer.ownerId) return;

    clearTimeout(timer.timeout);
    inactivityTimers.delete(message.channel.id);

    await message.channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor('#0a0a0a')
                .setDescription('✅ Activity detected — the auto-close timer has been cancelled.')
        ]
    }).catch(() => {});
});

// ---------- /claim ----------
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'claim') return;
    if (!isNewTicketChannel(interaction.channel)) {
        return interaction.reply({ content: 'This command only works in ticket channels.', flags: 64 });
    }

    if (!isTicketStaff(interaction.channel, interaction.member)) {
        return interaction.reply({ content: 'No permission.', flags: 64 });
    }

    claimedTickets.set(interaction.channel.id, interaction.user.tag);
    return interaction.reply({ content: `Claimed by ${interaction.user}` });
});

// ---------- /add ----------
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'add') return;
    if (!isNewTicketChannel(interaction.channel)) {
        return interaction.reply({ content: 'This command only works in ticket channels.', flags: 64 });
    }

    if (!isTicketStaff(interaction.channel, interaction.member)) {
        return interaction.reply({ content: 'No permission.', flags: 64 });
    }

    const userToAdd = interaction.options.getUser('user');

    await interaction.channel.permissionOverwrites.edit(userToAdd.id, {
        ViewChannel: true,
        SendMessages: true
    });

    return interaction.reply({ content: `${userToAdd} has been added to this ticket.` });
});

// ================= ANTI RAID (QUARANTINE) =================
// Zet iemand in quarantaine i.p.v. een harde ban. Zo blijft de gebruiker
// lid van de server (mutual guild blijft bestaan), waardoor DM's en
// knop-interacties met de bot gewoon blijven werken voor de appeal.

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

        // Huidige rollen opslaan (behalve @everyone) zodat we ze kunnen
        // terugzetten als de appeal wordt geaccepteerd.
        const currentRoleIds = member.roles.cache
            .filter(r => r.id !== message.guild.id)
            .map(r => r.id);

        quarantinedRoles.set(member.id, currentRoleIds);

        await member.roles.set([QUARANTINE_ROLE], 'Anti Raid / Anti Hack Protection - Quarantine');

        console.log(`${member.user.tag} quarantined by Anti Raid`);

    } catch (err) {
        console.log(err);
    }

    try {

        const embed = new EmbedBuilder()
            .setColor('#0a0a0a')
            .setTitle('You Have Been Quarantined <:Clarity:1522719037610790923>')
            .setDescription(
`> Our automated **Anti Raid / Anti Hack system** detected suspicious activity on your account.

You have been placed in **quarantine** and can only access <#${QUARANTINE_CHANNEL}> until this is resolved.

-# If you believe this was a mistake, click the button below to submit an appeal.`
            )
            .setImage('https://cdn.discordapp.com/attachments/1518352163603091577/1522728390652723300/Bannder.jpg');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('quarantine_appeal')
                .setLabel('Appeal')
                .setEmoji('<:Clarity:1522719037610790923>')
                .setStyle(ButtonStyle.Secondary)
        );

        await member.send({
            embeds: [embed],
            components: [row]
        }).catch(() => {});

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

// ================= QUARANTINE APPEAL BUTTON =================
// Werkt zowel op de knop in de persoonlijke DM als op de knop van het
// statische !banp paneel in het quarantaine-kanaal. Nu de gebruiker
// gequarantained wordt i.p.v. gebanned, blijft de mutual guild bestaan en
// werken knop-interacties (ook in DM) weer gewoon betrouwbaar.
client.on(Events.InteractionCreate, async (interaction) => {

    if (!interaction.isButton()) return;
    if (interaction.customId !== 'quarantine_appeal') return;

    if (appealSessions.has(interaction.user.id)) {
        return interaction.reply({
            content: 'You already have an appeal in progress. Check your DMs.',
            flags: 64
        }).catch(() => {});
    }

    appealSessions.set(interaction.user.id, true);

    try {
        await interaction.reply({
            content: 'Check your DMs, we will ask you a few questions there.',
            flags: 64
        });
    } catch (err) {
        console.error('Failed to acknowledge quarantine_appeal interaction:', err);
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
            const targetMember = await guild.members.fetch(targetId).catch(() => null);

            if (targetMember) {
                // Oude rollen terugzetten (indien bekend), anders gewoon de
                // quarantaine-rol verwijderen.
                const previousRoles = quarantinedRoles.get(targetId) || [];
                await targetMember.roles.set(previousRoles, `Ban appeal accepted by ${staffMember.user.tag}`);
                quarantinedRoles.delete(targetId);
            }
        } catch (err) {
            console.error('Herstellen van rollen mislukt:', err);
        }

        if (targetUser) {
            await targetUser.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#0a0a0a')
                        .setTitle('Ban Appeal Accepted <:Clarity:1522719037610790923>')
                        .setDescription(
`Your appeal has been **accepted** and your access to the server has been restored.

Welcome back! <:Clarity:1522719037610790923>`
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
                        .setDescription('Your appeal has been **denied**. You will remain in quarantine.')
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
