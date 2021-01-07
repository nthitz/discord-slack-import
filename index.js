require('dotenv').config()
const fs = require('fs')
const path = require('path')
const yargs = require('yargs/yargs');
const Discord = require('discord.js');
const EmojiConvertor = require('emoji-js');
const chunkString = require('./chunkString');

const { emojiAliases, customEmojiRewrites, emojiOverrides} = require('./emojis')

const emojis = new EmojiConvertor();
emojis.addAliases(emojiAliases)
emojis.allow_native = true
emojis.replace_mode = 'unified'



const argv = yargs(process.argv.slice(2))
.describe('inputDirectory', 'specify the path to the exported slack data')
.describe('inputChannel', 'input channel')
.describe('outputChannel', 'output channel')
.demandOption(['inputDirectory', 'inputChannel', 'outputChannel']).argv


const GIPHY_BOT_ID = 'B1657RY23'

const maxDiscordAttachmentSize = 1000 * 1000 * 8 // 8MB round down

const { inputDirectory, inputChannel, outputChannel } = argv


async function readAndWrite(outputChannel) {
  const userData = JSON.parse(fs.readFileSync(path.join(inputDirectory, 'users.json')))
  const usersById = userData.reduce((users, user) =>  { users[user.id] = user; return users}, {})

  let channelData = fs.readdirSync(path.join(inputDirectory, inputChannel))
  // some options for debugging certain pages, crude.
  const page = 0
  const pageCount = channelData.length // 5
  const offset = 0 //608
  const forcePageCount = 0 // 1
  const minMessageTime = 0 //+'1518721520.000513'
  channelData = channelData.slice(page * pageCount + offset, (page + 1) * pageCount + offset)
  if (forcePageCount) {
    channelData.length = forcePageCount
  }


  console.log(channelData)

  // stores a map with keys as children Slack comment ts and values as their Slack parent ts
  const slackMessageThreadParentIds = {}

  // map keys slack ts, values discord message ids
  const newDiscordMessagesBySlackTs = {}

  for (date of channelData) {
    const input = JSON.parse(fs.readFileSync(path.join(inputDirectory, inputChannel, date)))

    console.log(date)
    for (message of input) {
      // console.log(message)
      if (minMessageTime && +message.ts < minMessageTime) {
        continue
      }
      const time = new Date(+message.ts * 1000)

      // file comments are weirdly formatted and require us to have references to the file message.
      // we could post them as is, but then they wouldn't be a proper reply to the file.. meh just ignore
      // also ignore empty bot messgaes
      if (
        (message.type === 'message' && message.subtype === 'file_comment') ||
        (message.type === 'message' && message.subtype === 'bot_message' && message.text === '')
      ) {
        continue;
      }

      let text = message.text

      // reformat quoted text
      text = text.replace(/&gt;/g, '>')
      // if first part of message is a quote, add a newline to separate it from timestamp and username in chat message
      if (text.indexOf('> ') === 0) {
        text = `\n${text}`
      }

      // set display name from available souorces
      let username = ''
      if (message.user_profile) {
        username = message.user_profile.display_name
      } else if (message.user && usersById[message.user] && usersById[message.user].profile) {
          username = usersById[message.user].profile.display_name
      } else {
        console.log('skipping no user')
        console.log(message)
        console.log(message.user)
        return
      }

      // save threaded replies
      if (message.replies && message.replies.length && message.thread_ts) {
        message.replies.forEach(({ts}, index, arr) => {
          let parentTs = null
          if (index === 0) {
            parentTs = message.thread_ts
          } else {
            parentTs = arr[index - 1].ts
          }
          slackMessageThreadParentIds[ts] = parentTs
        })
      }

      // reformat urls, both links and internal slack user ids. maybe others?
      const messageLinks = text.match(/(<[^>]+>)/gi)
      if (messageLinks) {
        for (link of messageLinks) {
          if (link.match(/^<https?:\/\//)) {
            const url = link.substr(1, link.length - 2)
            let textReplacement = url
            // sometimes urls are formatted like <https://example.com|Url Link Text>
            if (url.indexOf('|') !== -1) {
              const [link, title] = url.split('|')
              textReplacement = link
              if (link.toLowerCase().indexOf(title.toLowerCase()) === -1) {
                textReplacement = `${link} \`${title}\``
              }
            }
            console.log(textReplacement)
            text = text.replace(link, textReplacement)
          } else if (link.match(/^<@U/)) {
            const user = link.substr(2, link.length - 3)
            console.log(user)
            const username = `@${usersById[user].profile.display_name}`
            text = text.replace(link, username)
          } else if (link.match(/^<#C/)) {
            const [channelId, channelName] = link.substr(1, link.length - 2).split('|')
            text = text.replace(link, `#${channelName}`)
          } else {
            console.log('unknown link', link)
          }
        }
      }

      // pull in newew Giphy bot images manually
      if (message.bot_id === GIPHY_BOT_ID && message.blocks){
        text = ` /giphy ${text} ${message.blocks[0].image_url}`
      } else if (message.bot_id === GIPHY_BOT_ID && message.attachments ) {
        text = ` /giphy ${message.attachments[0].title} ${message.attachments[0].image_url}`

      }

      const discordMessageText = `\`${time.toLocaleString()} - ${username}:\` ${text}`
      // discord has max text limit, chunk messages
      const maxDiscordMessageLength = 2000
      const chunkedMessages = chunkString(discordMessageText, maxDiscordMessageLength)
      let firstChunkedMessageDiscordResponse = null
      if (message.ts === '1584120601.058100') {
        console.log(chunkedMessages)
      }
      for ([index, chunkedMessage] of chunkedMessages.entries()) {

        const messageContent = {
          content: chunkedMessage
        }

        // detect if this is a reply
        // find if this message ts has a parent id stored
        const parentTs = slackMessageThreadParentIds[message.ts]
        // (first message in thread won't have parent id)
        // check if we've saved a discord id for that parent message
        if (parentTs && newDiscordMessagesBySlackTs[parentTs]) {
          const parentReplyId = newDiscordMessagesBySlackTs[parentTs]
          messageContent.replyTo = parentReplyId
        }
        let discordMessage = null

        const addAttachments = message.files && index === 0
        // add any uploaded files, hopefully the private slack urls stay there and the token on them doesn't expire
        if (addAttachments) {
          const combinedFileSize = message.files.reduce((size, file) => size += file.size, 0)
          messageContent.files = []
          for (file of message.files) {
            if (combinedFileSize < maxDiscordAttachmentSize) {
              messageContent.files.push(new Discord.MessageAttachment(file.url_private, file.name))
            } else {
              messageContent.content += `${file.url_private} ${file.name}`
            }
          }
          // possible message truncation
          messageContent.content.length = maxDiscordMessageLength
        }

        try {
          discordMessage = await outputChannel.send(messageContent)
        } catch (error) {
          console.log(error)
          console.log(messageContent)
          console.log(message)
        }
        // save first chunked message discord id in case we have a reply later
        if (index === 0) {
          // also save resposne for adding reactions later
          firstChunkedMessageDiscordResponse = discordMessage
          newDiscordMessagesBySlackTs[message.ts] = discordMessage.id
        }
      }

      if (message.reactions) {
        for(const reaction of message.reactions) {
          let emoji = reaction.name
          if (customEmojiRewrites[emoji]) {
            emoji = customEmojiRewrites[emoji]
          }
          let e = emojis.replace_colons(`:${emoji}:`)
          if (!e) {
            console.log(emoji)
            e = '❓'
          }
          if (emojiOverrides[emoji]) {
            e = emojiOverrides[emoji]
          }
          try {
            await firstChunkedMessageDiscordResponse.react(e)
          } catch (error) {

            console.log(reaction)
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
    console.log('channel not found', outputChannel)
    return
  }
  // console.log(output)
  readAndWrite(output)
});


client.login(process.env.DISCORD_BOT_TOKEN);