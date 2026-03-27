// ── DiscordBot ─────────────────────────────────────────────────────────────────
// Fix-tracking bot for Universe Sim.
// Commands: /add  /done  /list  /update
//
// Env vars required:
//   DISCORD_BOT_TOKEN   — bot token from Discord Developer Portal
//   DISCORD_CLIENT_ID   — application (client) ID
//   DISCORD_GUILD_ID    — (optional) guild ID for instant command refresh during dev
//                         omit for global commands (takes up to 1 hour to propagate)

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js'
import { neon } from '@neondatabase/serverless'

// ── DB helpers ─────────────────────────────────────────────────────────────────

let sql = null

async function getDb() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — ask the server admin to configure it in Railway')
    }
    sql = neon(process.env.DATABASE_URL)
  }
  return sql
}

async function migrateSchema() {
  const db = await getDb()
  if (!db) return
  await db`
    CREATE TABLE IF NOT EXISTS fix_list (
      id          SERIAL PRIMARY KEY,
      number      INTEGER UNIQUE NOT NULL,
      description TEXT    NOT NULL,
      image_url   TEXT,
      status      TEXT    NOT NULL DEFAULT 'pending',
      created_by  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await db`
    CREATE SEQUENCE IF NOT EXISTS fix_number_seq START 1
  `
}

async function nextFixNumber() {
  const db = await getDb()
  const [row] = await db`SELECT nextval('fix_number_seq') AS n`
  return parseInt(row.n, 10)
}

async function insertFix(number, description, imageUrl, createdBy) {
  const db = await getDb()
  const [row] = await db`
    INSERT INTO fix_list (number, description, image_url, created_by)
    VALUES (${number}, ${description}, ${imageUrl ?? null}, ${createdBy ?? null})
    RETURNING *
  `
  return row
}

async function getFix(number) {
  const db = await getDb()
  const [row] = await db`SELECT * FROM fix_list WHERE number = ${number}`
  return row ?? null
}

async function getAllFixes() {
  const db = await getDb()
  return db`SELECT * FROM fix_list WHERE status = 'pending' ORDER BY number ASC`
}

async function markDone(number) {
  const db = await getDb()
  const [row] = await db`
    UPDATE fix_list SET status = 'done', updated_at = NOW()
    WHERE number = ${number}
    RETURNING *
  `
  return row ?? null
}

async function updateFix(number, description, imageUrl) {
  const db = await getDb()
  // Build partial update — only change fields that were provided
  if (description !== null && imageUrl !== null) {
    const [row] = await db`
      UPDATE fix_list SET description = ${description}, image_url = ${imageUrl}, updated_at = NOW()
      WHERE number = ${number} AND status = 'pending'
      RETURNING *
    `
    return row ?? null
  }
  if (description !== null) {
    const [row] = await db`
      UPDATE fix_list SET description = ${description}, updated_at = NOW()
      WHERE number = ${number} AND status = 'pending'
      RETURNING *
    `
    return row ?? null
  }
  if (imageUrl !== null) {
    const [row] = await db`
      UPDATE fix_list SET image_url = ${imageUrl}, updated_at = NOW()
      WHERE number = ${number} AND status = 'pending'
      RETURNING *
    `
    return row ?? null
  }
  return null
}

// ── Embed builders ─────────────────────────────────────────────────────────────

const COLOR_PENDING = 0x00d4ff  // cyan
const COLOR_DONE    = 0x4cdd88  // green
const COLOR_ERROR   = 0xff4444  // red

function fixEmbed(fix, label = null) {
  const embed = new EmbedBuilder()
    .setColor(fix.status === 'done' ? COLOR_DONE : COLOR_PENDING)
    .setTitle(`#${fix.number} — ${fix.status === 'done' ? '✅ DONE' : '🔧 PENDING'}`)
    .setDescription(fix.description)
    .setFooter({ text: `Added by ${fix.created_by ?? 'unknown'} · #${fix.number}` })
    .setTimestamp(new Date(fix.created_at))

  if (fix.image_url) {
    embed.setImage(fix.image_url)
  }

  if (label) embed.setTitle(`${label} · #${fix.number}`)
  return embed
}

function listEmbed(fixes) {
  if (fixes.length === 0) {
    return new EmbedBuilder()
      .setColor(COLOR_DONE)
      .setTitle('✅ Fix List')
      .setDescription('Nothing to fix — list is empty!')
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR_PENDING)
    .setTitle(`🔧 Fix List — ${fixes.length} pending`)
    .setTimestamp()

  for (const fix of fixes) {
    const hasImage = fix.image_url ? ' 🖼' : ''
    const added = new Date(fix.created_at).toLocaleDateString()
    embed.addFields({
      name: `#${fix.number}${hasImage}`,
      value: `${fix.description}\n-# Added ${added} by ${fix.created_by ?? 'unknown'}`,
      inline: false,
    })
  }

  return embed
}

// ── Slash command definitions ──────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a new item to the fix list')
    .addStringOption(opt =>
      opt.setName('description')
        .setDescription('What needs to be fixed?')
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addAttachmentOption(opt =>
      opt.setName('image')
        .setDescription('Optional screenshot or reference image')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('done')
    .setDescription('Mark a fix as completed and remove it from the list')
    .addIntegerOption(opt =>
      opt.setName('number')
        .setDescription('Fix number to mark as done')
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('list')
    .setDescription('Show the fix list')
    .addIntegerOption(opt =>
      opt.setName('number')
        .setDescription('Show a specific fix number (omit to show all)')
        .setRequired(false)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('update')
    .setDescription('Edit an existing fix')
    .addIntegerOption(opt =>
      opt.setName('number')
        .setDescription('Fix number to edit')
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(opt =>
      opt.setName('description')
        .setDescription('New description (leave blank to keep existing)')
        .setRequired(false)
        .setMaxLength(1000)
    )
    .addAttachmentOption(opt =>
      opt.setName('image')
        .setDescription('New image (leave blank to keep existing)')
        .setRequired(false)
    ),
].map(cmd => cmd.toJSON())

// ── Command handlers ───────────────────────────────────────────────────────────

async function handleAdd(interaction) {
  await interaction.deferReply()

  const description = interaction.options.getString('description')
  const attachment  = interaction.options.getAttachment('image')
  const imageUrl    = attachment?.url ?? null
  const createdBy   = interaction.user.username

  try {
    const number = await nextFixNumber()
    const fix = await insertFix(number, description, imageUrl, createdBy)
    const embed = fixEmbed(fix, '➕ Added to fix list')
    await interaction.editReply({ embeds: [embed] })
  } catch (err) {
    console.error('[Discord /add]', err)
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ Failed to add fix: ${err.message}`)],
    })
  }
}

async function handleDone(interaction) {
  await interaction.deferReply()

  const number = interaction.options.getInteger('number')

  try {
    const fix = await getFix(number)
    if (!fix) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ Fix #${number} not found.`)],
      })
    }
    if (fix.status === 'done') {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ Fix #${number} is already marked as done.`)],
      })
    }

    const updated = await markDone(number)
    const embed = fixEmbed(updated, '✅ Marked as done')
    await interaction.editReply({ embeds: [embed] })
  } catch (err) {
    console.error('[Discord /done]', err)
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ Error: ${err.message}`)],
    })
  }
}

async function handleList(interaction) {
  await interaction.deferReply()

  const number = interaction.options.getInteger('number')

  try {
    if (number !== null) {
      // Single fix
      const fix = await getFix(number)
      if (!fix) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ Fix #${number} not found.`)],
        })
      }
      return interaction.editReply({ embeds: [fixEmbed(fix)] })
    }

    // Full list
    const fixes = await getAllFixes()

    // Discord embed field limit is 25 — paginate if needed
    if (fixes.length <= 25) {
      return interaction.editReply({ embeds: [listEmbed(fixes)] })
    }

    // Send in chunks of 25
    const chunks = []
    for (let i = 0; i < fixes.length; i += 25) chunks.push(fixes.slice(i, i + 25))
    for (let i = 0; i < chunks.length; i++) {
      const embed = listEmbed(chunks[i])
      embed.setTitle(`🔧 Fix List — page ${i + 1}/${chunks.length} (${fixes.length} total)`)
      if (i === 0) await interaction.editReply({ embeds: [embed] })
      else await interaction.followUp({ embeds: [embed] })
    }
  } catch (err) {
    console.error('[Discord /list]', err)
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ Error: ${err.message}`)],
    })
  }
}

async function handleUpdate(interaction) {
  await interaction.deferReply()

  const number      = interaction.options.getInteger('number')
  const description = interaction.options.getString('description')  // nullable
  const attachment  = interaction.options.getAttachment('image')     // nullable
  const imageUrl    = attachment?.url ?? null

  if (!description && !imageUrl) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription('❌ Provide at least a new description or image to update.')],
    })
  }

  try {
    const existing = await getFix(number)
    if (!existing) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ Fix #${number} not found.`)],
      })
    }
    if (existing.status === 'done') {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ Fix #${number} is already done and cannot be edited.`)],
      })
    }

    const updated = await updateFix(number, description, imageUrl)
    const embed = fixEmbed(updated, '✏️ Updated')
    await interaction.editReply({ embeds: [embed] })
  } catch (err) {
    console.error('[Discord /update]', err)
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ Error: ${err.message}`)],
    })
  }
}

// ── Main class ─────────────────────────────────────────────────────────────────

export class DiscordBot {
  async init() {
    const token    = process.env.DISCORD_BOT_TOKEN
    const clientId = process.env.DISCORD_CLIENT_ID
    const guildId  = process.env.DISCORD_GUILD_ID  // optional

    console.log('[Discord] Starting bot init...')
    console.log(`[Discord] TOKEN set: ${!!token} | CLIENT_ID set: ${!!clientId} | GUILD_ID set: ${!!guildId}`)

    if (!token || !clientId) {
      console.log('[Discord] DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID not set — bot disabled')
      return
    }

    // Migrate DB schema
    try {
      await migrateSchema()
      console.log('[Discord] DB schema ready')
    } catch (err) {
      console.warn('[Discord] DB migration failed:', err.message)
    }

    // Register slash commands
    try {
      const rest = new REST({ version: '10' }).setToken(token)
      if (guildId) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
        console.log(`[Discord] Guild commands registered (guild ${guildId})`)
      } else {
        await rest.put(Routes.applicationCommands(clientId), { body: commands })
        console.log('[Discord] Global commands registered (may take up to 1h to propagate)')
      }
    } catch (err) {
      console.error('[Discord] Command registration failed:', err.message)
      return
    }

    // Start client
    const client = new Client({ intents: [GatewayIntentBits.Guilds] })

    client.once('ready', () => {
      console.log(`[Discord] Logged in as ${client.user.tag}`)
    })

    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return
      try {
        switch (interaction.commandName) {
          case 'add':    await handleAdd(interaction);    break
          case 'done':   await handleDone(interaction);   break
          case 'list':   await handleList(interaction);   break
          case 'update': await handleUpdate(interaction); break
        }
      } catch (err) {
        console.error(`[Discord] Unhandled error in /${interaction.commandName}:`, err)
      }
    })

    await client.login(token)
  }
}
