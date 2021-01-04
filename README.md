Import Slack History into Discord
==

Copies slack exports into Discord.

Attempts to:

* Add reactions (only default emoji, some custom emoji replaced with alternatives, others replaced with ?)
* Add attachments and file uploads
* Convert Slack Threads to Discord replies
* converts internal slack id text (e.g. user or channel names) to readable form

Caveats:
* some stuff might not work properly?
* Reactions only react from one user, the bot. The hisitory of who and how many people reacted is lost.
* doesn't reformat mailto: links
* Discord replies work differently than Slack threads

Copy `.env-sample` to `.env` and add your Bot Token there. Bot must be logged in to your server already


usage:

    node index.js --inputDirectory [SLACK EXPORT DIRECTORY] --inputChannel [INPUT CHANNEL] --outputChannel [OUTPUT CHANNEL]

example:

    node index.js --inputDirectory ../slack-export-triple-threat/ --inputChannel general --outputChannel archive-general

`inputDirectory` is a path to your Slack exports

`inputChannel` is where the messages are coming from

`outputChannel` is where the messages are going to

both channels must already exist



