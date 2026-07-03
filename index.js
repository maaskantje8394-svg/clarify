import 'dotenv/config';
import {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    Events
} from 'discord.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

const WELCOME_CHANNEL = '1520535431827951656';

client.once(Events.ClientReady, () => {
    console.log(`${client.user.tag} is online.`);
});

client.on(Events.GuildMemberAdd, async (member) => {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL);
    if (!channel) return;

const embed = new EmbedBuilder()
    .setColor('#000000')
    .setDescription(`**Welcome to ${member.guild.name}** ${member}! 🌙`)
    .setImage('https://cdn.discordapp.com/attachments/1518352163603091577/1522728390652723300/Bannder.jpg?ex=6a4986d3&is=6a483553&hm=e8ece5dd2a9b50cfe9b9af1d47655b7031a716a3ab80af0fac65a4926576aa50')
    .setTimestamp();

    await channel.send({
        content: `${member}`,
        embeds: [embed]
    });
});

client.login(process.env.TOKEN);
