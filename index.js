require('dotenv').config()
const fs = require('fs')
const path = require('path')
const yargs = require('yargs/yargs');
const Discord = require('discord.js');



const argv = yargs(process.argv.slice(2))
.describe('inputDirectory', 'specify the path to the exported slack data')
.describe('inputChannel', 'input channel')
.describe('outputChannel', 'output channel')
.demandOption(['inputDirectory', 'inputChannel', 'outputChannel']).argv





const { inputDirectory, inputChannel, outputChannel } = argv


function readAndWrite(writeTo) {
  const channelData = fs.readdirSync(path.join(inputDirectory, inputChannel))

  channelData.forEach(date => {
    const input = JSON.parse(fs.readFileSync(path.join(inputDirectory, inputChannel, date)))
    input.length = 5
    console.log(date)
    input.forEach(async (message) => {
      // console.log(message)
      const time = new Date(+message.ts * 1000)
      const text = message.text.substr(0, 2000)
      if (!message.user_profile) {
        // console.log(message)
        return
      }
      const discordMessage = `${time.toLocaleString()} - ${message.user_profile.display_name}: ${text}`
      // console.log(discordMessage)
      await writeTo.send(discordMessage)
    })
  })
}


const client = new Discord.Client();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(client.channels)
  const output = client.channels.cache.find(c => c.name === outputChannel)
  if (!output) {
    return
  }
  console.log(output)
  readAndWrite(output)
});


client.login(process.env.DISCORD_BOT_TOKEN);




// console.log(channels)

// channels.forEach(channel => {
//   const name = channel.name
//   const channelLogs = fs.readdirSync(path.join(inputDirectory, name))
//   console.log(channelLogs)
//   const channelMessages = []
//   let writeOutData = false
//   const groupedChannelMessages = {}
//   let groupAccessor = date => 'all'
//   if (splitMonths) {
//     groupAccessor = date => date.substr(0, 7)
//   }

//   channelLogs.forEach(date => {
//     const dateMessages = JSON.parse(fs.readFileSync(path.join(inputDirectory, name, date)))
//     const group = groupAccessor(date)
//     // channelMessages.push(...dateMessages)
//     if (!groupedChannelMessages[group]) {
//       groupedChannelMessages[group] = []
//     }
//     groupedChannelMessages[group].push(...dateMessages)
//   })
//   Object.keys(groupedChannelMessages).forEach(group => {
//     const messages = groupedChannelMessages[group]
//     fs.writeFileSync(path.join(inputDirectory, `combined-${name}-${group}.json`), JSON.stringify(messages))

//   })
// })