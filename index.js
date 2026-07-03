import 'dotenv/config';
import http from 'http';
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

// Render / UptimeRobot
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Clarity Bot is online!');
}).listen(PORT, () => {
    console.log(`🌐 Web server listening on port ${PORT}`);
});

client.login(process.env.TOKEN);
