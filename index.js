"use strict";

// Main
const discordBackup = require("discord-backup")
const simpleAES256 = require("simple-aes-256")
const request = require("request-async")
const discord = require("discord.js")
const moment = require("moment")
const _ = require("lodash")
const fs = require("fs")

// Variables
var lightBackup = {
    token: "",
    debounce: []
}

const bot = new discord.Client({ intents: [ discord.Intents.FLAGS.GUILDS, discord.Intents.FLAGS.GUILD_MESSAGES, discord.Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS, discord.Intents.FLAGS.DIRECT_MESSAGES, discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS, discord.Intents.FLAGS.DIRECT_MESSAGE_REACTIONS ] })

// Functions
function debounce(guildID, type){
    lightBackup.debounce.push({ guildID: guildID, type: type })

    setTimeout(()=>{
        delete lightBackup.debounce[_.findIndex(lightBackup.debounce, { guildID: guildID, type: type })]
        lightBackup.debounce = lightBackup.debounce.filter((d)=>d)
    }, 5 * 60 * 1000)
}

/// Configurations
//* Discord Backup
discordBackup.setStorageFolder("./temp")

// Main
bot.on("ready", ()=>{
    bot.user.setActivity("LightBackup | lb.help")
    console.log("LightBackup is running.")
})

bot.on("message", async(message)=>{
    if(!message.guild) return
    if(message.author.bot) return
    if(!message.content.startsWith("lb.")) return
    if(!message.member.permissions.has("ADMINISTRATOR")) return

    const messageArgs = message.content.split(" ")

    if(message.content === "lb.help"){
        const embed = new discord.MessageEmbed()
        .setTitle("LightBackup | Help Menu")
        .addFields(
            { name: "lb.help", value: "Display the help menu" },
            { name: "lb.backup <webhook> <password>", value: "Backup the server and send the backup file in the provided Discord webhook." },
            { name: "lb.load <password>", value: "Decrypt the given backup file with the given password and upload it to the current server (current server channels, roles, etc. will be deleted)." }
        )
        .setColor("RANDOM")

        message.reply({ embeds: [embed] })
    }else if(messageArgs[0] === "lb.load"){
        await message.delete()
        if(_.find(lightBackup.debounce, { guildID: message.guild.id, type: "load" })) return message.channel.send("Please wait for 5 minutes before you can load again.")
        if(!messageArgs.length) return message.channel.send("usage: lb.load <password>")
        
        const password = messageArgs.slice(1).join(" ")
        if(password.length >= 50) return message.channel.send("Maximum password length is 50.")
        const attachment = message.attachments.first()

        if(attachment){
            debounce(message.guild.id, "load")

            await message.author.send("Note: All messages are deleted on load.\nLoading the backup in this server, please wait...")

            try{
                var response = await request(attachment.attachment)
                response = simpleAES256.decrypt(password, Buffer.from(response.body, "hex")).toString("utf8")

                await discordBackup.load(JSON.parse(response), message.guild, { clearGuildBeforeRestore: true })
                await message.author.send("Finished loading the backup.")
            }catch{
                message.channel.send("Something went wrong while loading the backup or the given password is invalid for the backup.")
            }
        }else{
            message.reply("Please attach a backup file.")
        }
    }else if(messageArgs[0] === "lb.backup"){
        await message.delete()
        if(_.find(lightBackup.debounce, { guildID: message.guild.id, type: "backup" })) return message.channel.send("Please wait for 5 minutes before you can backup again.")
        if(!messageArgs.length || !messageArgs[2]) return message.channel.send("usage: lb.backup <webhook>")
        debounce(message.guild.id, "backup")

        const password = messageArgs.slice(2).join(" ")
        if(password.length >= 50) return message.channel.send("Maximum password length is 50.")
        message.channel.send("Making a backup for the server, please wait...")

        const backup = await discordBackup.create(message.guild, {
            maxMessagesPerChannel: 5,
            jsonSave: true,
            jsonBeautify: false,
            doNotBackup: ["emojis"],
            saveImages: "base64"
        })

        try{
            await request.post(messageArgs[1], {
                formData: {
                    file: {
                        value: simpleAES256.encrypt(password, fs.readFileSync(`./temp/${backup.id}.json`)).toString("hex"),
                        options: {
                            filename: `${moment().format("l").replace(/\//g, "-")}-${Math.floor(Math.random() * 99999)} ${backup.id}.txt`
                        }
                    }
                },
                json: true
            })

            fs.writeFileSync(`./temp/${backup.id}.json`, ".", "utf8")
            fs.rmSync(`./temp/${backup.id}.json`)

            message.channel.send("Finished making the backup.")
        }catch{
            message.channel.send("Unable to backup because the backup is too large or the webhook is invalid.")
        }
    }
})

bot.login(lightBackup.token)