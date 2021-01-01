require('dotenv').config()
const fs = require('fs')
const path = require('path')
const yargs = require('yargs/yargs');
const Discord = require('discord.js');

const chunkString = require('./chunkString');
const { match } = require('assert');

const argv = yargs(process.argv.slice(2))
.describe('inputDirectory', 'specify the path to the exported slack data')
.describe('inputChannel', 'input channel')
.describe('outputChannel', 'output channel')
.demandOption(['inputDirectory', 'inputChannel', 'outputChannel']).argv





const { inputDirectory, inputChannel, outputChannel } = argv


async function readAndWrite(writeTo) {
  const userData = JSON.parse(fs.readFileSync(path.join(inputDirectory, 'users.json')))
  const usersById = userData.reduce((users, user) =>  { users[user.id] = user; return users}, {})

  let channelData = fs.readdirSync(path.join(inputDirectory, inputChannel))
  const page = 241
  const pageCount = 5
  const offset = 2
  channelData = channelData.slice(page * pageCount + offset, (page + 1) * pageCount + offset)
  console.log(channelData)
  for (date of channelData) {
    const input = JSON.parse(fs.readFileSync(path.join(inputDirectory, inputChannel, date)))

    console.log(date)
    for (message of input) {
      // console.log(message)
      const time = new Date(+message.ts * 1000)
      let text = message.text

      if (text.substr(0, 5) === '&gt; ') {
        text = text.replace('&gt; ', '> ')
      }
      let username = ''
      if (message.user_profile) {
        username = message.user_profile.display_name
      } else if (message.user && usersById[message.user] && usersById[message.user].profile) {
          username = usersById[message.user].profile.display_name
      } else {
        console.log('skipping no user')
        console.log(message)
        return
      }


      const messageLinks = text.match(/(<[^>]+>)/gi)
      const matchedUrls = []
      if (messageLinks) {
        for (link of messageLinks) {
          if (link.match(/^<https?:\/\//)) {
            const url = link.substr(1, link.length - 2)
            console.log(url)
            matchedUrls.push(url)
            text = text.replace(link, url)
          } else if (link.match(/^<@U/)) {
            const user = link.substr(2, link.length - 3)
            console.log(user)
            const username = `@${usersById[user].profile.display_name}`
            text = text.replace(link, username)
          } else {
            console.log('unknown link', link)
          }
        }
      }
      const discordMessage = `${time.toLocaleString()} - ${username}: ${text}`
      const maxLength = 2000
      const chunkedMessages = chunkString(discordMessage, maxLength)
      for (chunkedMessage of chunkedMessages) {
        // console.log(chunkedMessage)
        await writeTo.send(chunkedMessage)

      }

      if (message.attachments && message.attachments.length) {
        // console.log(message.attachments)
        for (attachment of message.attachments) {
          let discordAttachment = null
          if (attachment.image_url && !matchedUrls.includes(attachment.from_url) && !matchedUrls.includes(attachment.original_url)) {
            // console.log(attachment)

            discordAttachment = new Discord.MessageAttachment(attachment.image_url)
          }
          if (discordAttachment) {
            await writeTo.send(discordAttachment)
          }
        }
      }
      if (message.files && message.files.length) {
        for (file of message.files) {
          let discordAttachment = null
          if (file.url_private && 'name' in file) {
            discordAttachment = new Discord.MessageAttachment(file.url_private, file.name)
          } else {
            console.log('unknown file', file)
          }
          if (discordAttachment) {
            await writeTo.send(discordAttachment)
          }
        }
      }
    }
  }
}


const client = new Discord.Client();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  // console.log(client.channels)
  const output = client.channels.cache.find(c => c.name === outputChannel)
  if (!output) {
    return
  }
  // console.log(output)
  readAndWrite(output)
});


client.login(process.env.DISCORD_BOT_TOKEN);