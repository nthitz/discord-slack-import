require('dotenv').config()
const fs = require('fs')
const path = require('path')
const yargs = require('yargs/yargs');
const Discord = require('discord.js');
const EmojiConvertor = require('emoji-js');
const chunkString = require('./chunkString');

const emojis = new EmojiConvertor();
emojis.allow_native = true
emojis.replace_mode = 'unified'



const argv = yargs(process.argv.slice(2))
.describe('inputDirectory', 'specify the path to the exported slack data')
.describe('inputChannel', 'input channel')
.describe('outputChannel', 'output channel')
.demandOption(['inputDirectory', 'inputChannel', 'outputChannel']).argv


const GIPHY_BOT_ID = 'B1657RY23'
const GIPHY_BOT_NAME = 'giphy'


const { inputDirectory, inputChannel, outputChannel } = argv


async function readAndWrite(outputChannel) {
  const userData = JSON.parse(fs.readFileSync(path.join(inputDirectory, 'users.json')))
  const usersById = userData.reduce((users, user) =>  { users[user.id] = user; return users}, {})

  let channelData = fs.readdirSync(path.join(inputDirectory, inputChannel))
  // some options for debugging certain pages, crude.
  const page = 0
  const pageCount = channelData.length // 5
  const offset = 0
  const forcePageCount = 0 // 1
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
      const time = new Date(+message.ts * 1000)

      let text = message.text

      // reformat quoted text
      if (text.substr(0, 5) === '&gt; ') {
        text = text.replace('&gt; ', '> ')
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
      const matchedUrls = []
      if (messageLinks) {
        for (link of messageLinks) {
          if (link.match(/^<https?:\/\//)) {
            const url = link.substr(1, link.length - 2)
            let textReplacement = url
            // sometimes urls are formatted like <https://example.com|Url Link Text>
            if (url.indexOf('|')) {
              const [link, title] = url.split('|')
              if (link !== title) {
                textReplacement = `${link} \`${title}\``
              }
            }
            console.log(textReplacement)
            matchedUrls.push(url)
            text = text.replace(link, textReplacement)
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

      // pull in newew Giphy bot images manually
      if (message.bot_id === GIPHY_BOT_ID){
        text = ` /giphy ${text} ${message.blocks[0].image_url}`
      }

      const discordMessageText = `${time.toLocaleString()} - ${username}: ${text}`
      // discord has max text limit, chunk messages
      const maxLength = 2000
      const chunkedMessages = chunkString(discordMessageText, maxLength)
      let firstChunkedMessageDiscordResponse = null
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
        const discordMessage = await outputChannel.send(messageContent)

        // save first chunked message discord id in case we have a reply later
        if (index === 0) {
          // also save resposne for adding reactions later
          firstChunkedMessageDiscordResponse = discordMessage
          newDiscordMessagesBySlackTs[message.ts] = discordMessage.id
        }
      }


      // check for any attachments that weren't previously linked. think this happens for old giphy embeds?
      if (message.attachments && message.attachments.length) {
        for (attachment of message.attachments) {
          let discordAttachment = null
          // url in the message could be from_url or original_url, check that neither has been linked
          if (attachment.image_url && !matchedUrls.includes(attachment.from_url) && !matchedUrls.includes(attachment.original_url)) {
            discordAttachment = new Discord.MessageAttachment(attachment.image_url)
          }
          if (discordAttachment) {
            await outputChannel.send(discordAttachment)
          }
        }
      }

      // add any uploaded files, hopefully the private slack urls stay there and the token on them doesn't expire
      if (message.files && message.files.length) {
        for (file of message.files) {
          let discordAttachment = null
          if (file.url_private && 'name' in file) {
            discordAttachment = new Discord.MessageAttachment(file.url_private, file.name)
          } else {
            console.log('unknown file', file)
          }
          if (discordAttachment) {
            await outputChannel.send(discordAttachment)
          }
        }
      }

      if (message.reactions) {
        for(const reaction of message.reactions) {
          const emoji = reaction.name
          let e = emojis.replace_colons(`:${emoji}:`)
          if (!e) {
            console.log(emoji)
            e = '❓'
          }
          await firstChunkedMessageDiscordResponse.react(e)
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