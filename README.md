Import Slack History into Discord
==

pretty rudimentary but it works. only does one channel at a time. Channels must exist already

Copy `.env-sample` to `.env` and add your Bot Token there. Bot must be logged in to your server already

usage:

    node index.js --inputDirectory [SLACK EXPORT DIRECTORY] --inputChannel [INPUT CHANNEL] --outputChannel [OUTPUT CHANNEL]

example:

    node index.js --inputDirectory ../slack-export-triple-threat/ --inputChannel general --outputChannel archive-general

`inputDirectory` is a path to your Slack exports

`inputChannel` is where the messages are coming from

`outputChannel` is where the messages are going to

both channels must already exist


