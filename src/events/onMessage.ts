import { Event } from '../structures/Event'
import CommandManager from '../managers/CommandManager'
import ErrorManager from '../managers/ErrorManager'
import { MessageCommand } from '../structures/Command'
import BotClient from '../structures/BotClient'
import { Constants, Message, MessageActionRow, MessageSelectMenu } from 'discord.js'
import Automod from '../schemas/autoModSchema'
import profanitys from '../contents/profanitys'
import regexparser from 'regex-parser'
import MusicSetting from '../schemas/musicSchema'
import Embed from '../utils/Embed'
import { PlayerSearchResult, Queue } from 'discord-player'

export default new Event('messageCreate', async (client, message) => {
  const commandManager = new CommandManager(client)
  const errorManager = new ErrorManager(client)

  if (message.author.bot) return
  if (message.channel.type === 'DM') return
  profanityFilter(client, message)
  MusicPlayer(client, message)
  if (!message.content.startsWith(client.config.bot.prefix)) return

  const args = message.content
    .slice(client.config.bot.prefix.length)
    .trim()
    .split(/ +/g)
  const commandName = args.shift()?.toLowerCase()
  const command = commandManager.get(commandName as string) as MessageCommand

  await client.dokdo.run(message)
  try {
    await command?.execute(client, message, args)
  } catch (error: any) {
    if(error?.code === Constants.APIErrors.MISSING_PERMISSIONS) {
      return message.reply('해당 명령어를 실행하기 위한 권한이 부족합니다!')
    }
    errorManager.report(error, { executer: message, isSend: true })
  }
})

const profanityFilter = async(client: BotClient, message: Message) => {
  if(!message.content) return
  const automodDB = await Automod.findOne({guild_id: message.guild?.id})
  if(!automodDB) return
  if(!automodDB.useing.useCurse) return
  if(!automodDB.useing.useCurseType) return
  if(automodDB.useing.useCurseIgnoreChannel?.includes(message.channel.id)) return
  let regex = false
  if(/(쌍)(년|놈)/.test(message.content)) regex = true
  if(!regex && /((씨|쓰|ㅅ|ㅆ|si)([0-9]+|\W+)(블|벌|발|빨|뻘|ㅂ|ㅃ|bal))/.test(message.content)) regex = true
  if(!regex && /((시발)(?!역)|((시|씨|쓰|ㅅ|ㅆ)([0-9]+|\W+|)(블|벌|발|빨|뻘|ㅂ|ㅃ))(!시발))/.test(message.content)) regex = true
  if(!regex && /((병|빙|븅|등|ㅂ)([0-9]+|\W+|)(신|싄|ㅅ)|ㅄ)/.test(message.content)) regex = true
  if(!regex && /((너|느(그|)|니)([0-9]+|\W+|)(금|애미|엄마|금마|검마))/.test(message.content)) regex = true
  if(!regex && /(개|게)(같|갓|새|세|쉐)/.test(message.content)) regex = true
  if(!regex && /(꼬|꽂|고)(추|츄)/.test(message.content)) regex = true
  if(!regex && /(니|너)(어|엄|엠|애|m|M)/.test(message.content)) regex = true
  if(!regex && /(노)(애|앰)/.test(message.content)) regex = true
  if(!regex && /((뭔|)개(소리|솔))/.test(message.content)) regex = true
  if(!regex && /(ㅅㅂ|ㅄ|ㄷㅊ)/.test(message.content)) regex = true
  if(!regex && /(놈|년|새끼)/.test(message.content)) regex = true
  if(regex) {
    findCurse(automodDB, message)
  } else {
    return
  }
}

const findCurse = async (automodDB: any, message: Message) => {
  if (automodDB.useing.useCurseType === 'delete') {
    await message.reply('욕설 사용으로 자동 삭제됩니다').then((m) => {
      setTimeout(() => {
        m.delete()
      }, 5000)
    })
    return await message.delete()
  } else if (automodDB.useing.useCurseType === 'delete_kick') {
    await message.reply('욕설 사용으로 자동 삭제 후 추방됩니다').then((m) => {
      setTimeout(() => {
        m.delete()
      }, 5000)
    })
    await message.delete()
    try {
      return message.member?.kick()
    } catch (e) {
      return
    }
  } else if (automodDB.useing.useCurseType === 'delete_ban') {
    await message.reply('욕설 사용으로 자동 삭제 후 차단됩니다').then((m) => {
      setTimeout(() => {
        m.delete()
      }, 5000)
    })
    await message.delete()
    try {
      return message.member?.ban({ reason: '[배틀이] 욕설 사용 자동차단' })
    } catch (e) {
      return
    }
  } else {
    return
  }
}

const MusicPlayer = async (client: BotClient, message: Message) => {
  if (!message.guild) return
  if (!message.content) return
  const musicDB = await MusicSetting.findOne({
    channel_id: message.channel.id,
    guild_id: message.guild.id
  })
  if (!musicDB) return
  const prefix = [client.config.bot.prefix, '!', '.', '$', '%', '&', '=']
  for (const i in prefix) {
    if (message.content.startsWith(prefix[i])) return message.delete()
  }
  await message.delete()
  const errembed = new Embed(client, 'error')
  const sucessembed = new Embed(client, 'success')
  const user = message.guild?.members.cache.get(message.author.id)
  const channel = user?.voice.channel
  if (!channel) {
    errembed.setTitle('❌ 음성 채널에 먼저 입장해주세요!')
    return message.channel.send({ embeds: [errembed] }).then((m) => {
      setTimeout(() => {
        m.delete()
      }, 15000)
    })
  }
  const guildQueue = client.player.getQueue(message.guild.id)
  if (guildQueue) {
    if (channel.id !== message.guild.me?.voice.channelId) {
      errembed.setTitle('❌ 이미 다른 음성 채널에서 재생 중입니다!')
      return message.channel.send({ embeds: [errembed] }).then((m) => {
        setTimeout(() => {
          m.delete()
        }, 15000)
      })
    }
  }
  const song = await client.player
    .search(message.content, { requestedBy: message.author }) as PlayerSearchResult
  if (!song || !song.tracks.length) {
    errembed.setTitle(`❌ ${message.content}를 찾지 못했어요!`)
    return message.channel.send({ embeds: [errembed] }).then((m) => {
      setTimeout(() => {
        m.delete()
      }, 15000)
    })
  }
  let queue: Queue
  if (guildQueue) {
    queue = guildQueue
    queue.metadata = message
  } else {
    queue = await client.player.createQueue(message.guild, {
      metadata: message
    })
  }
  try {
    if (!queue.connection) await queue.connect(channel)
  } catch (e) {
    client.player.deleteQueue(message.guild.id)
    errembed.setTitle(`❌ 음성 채널에 입장할 수 없어요 ${e}`)
    return message.channel.send({ embeds: [errembed] }).then((m) => {
      setTimeout(() => {
        m.delete()
      }, 15000)
    })
  }
  if (song.playlist) {
    const songs: string[] = []
    song.playlist.tracks.forEach((music) => {
      songs.push(music.title)
    })
    sucessembed.setAuthor(
      '재생목록에 아래 노래들을 추가했어요!',
      undefined,
      song.playlist.url
    )
    sucessembed.setDescription(songs.join(', '))
    sucessembed.setThumbnail(song.playlist.thumbnail)
    queue.addTracks(song.tracks)
    if (!queue.playing) await queue.play()
    return message.channel.send({ embeds: [sucessembed] }).then((m) => {
      setTimeout(() => {
        m.delete()
      }, 15000)
    })
  } else {
    queue.addTrack(song.tracks[0])
    sucessembed.setAuthor(`재생목록에 노래를 추가했어요!`, undefined, song.tracks[0].url)
    sucessembed.setDescription(`[${song.tracks[0].title}](${song.tracks[0].url}) ${song.tracks[0].duration} - ${song.tracks[0].requestedBy}`)
    sucessembed.setThumbnail(song.tracks[0].thumbnail)
    if (!queue.playing) await queue.play()
    return message.channel.send({ embeds: [sucessembed] }).then((m) => {
      setTimeout(() => {
        m.delete()
      }, 15000)
    })
  }
}
const isValidRegex = (t: string) => {
  try {
      const msg = t.match(/^([/~@;%#'])(.*?)\1([gimsuy]*)$/)
      return msg ? !!new RegExp(msg[2], msg[3]) : false
  } catch (e) {
      return false
  }
}