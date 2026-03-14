import { readFileSync, writeFileSync } from 'fs'
import { parseSshConfig, resolveSshConfigPath, type SshHostConfig } from './config-parser'
import type { HostMutationInput } from '../../preload/index'

type HostBlock = {
  startIndex: number
  endIndex: number
  aliases: string[]
}

function normalizeHostInput(input: HostMutationInput): Required<HostMutationInput> {
  const alias = input.alias.trim()
  const host = input.host.trim()
  const parsedPort =
    input.port === undefined ? 22 : Number.isFinite(input.port) ? Math.trunc(Number(input.port)) : NaN
  const user = (input.user ?? '').trim()
  const identityFile = (input.identityFile ?? '').trim()
  const bindAddress = (input.bindAddress ?? '').trim()
  const proxyJump = (input.proxyJump ?? '').trim()

  if (!alias) {
    throw new Error('Host alias is required')
  }
  if (/\s/.test(alias)) {
    throw new Error('Host alias must be a single token without spaces')
  }
  if (!host) {
    throw new Error('HostName is required')
  }
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error('Port must be an integer between 1 and 65535')
  }

  return { alias, host, port: parsedPort, user, identityFile, bindAddress, proxyJump }
}

function readConfigFile(): { content: string; lineEnding: '\n' | '\r\n' } {
  const configPath = resolveSshConfigPath()
  try {
    const content = readFileSync(configPath, 'utf-8')
    return { content, lineEnding: content.includes('\r\n') ? '\r\n' : '\n' }
  } catch {
    return { content: '', lineEnding: '\n' }
  }
}

function writeConfigFile(content: string): void {
  const configPath = resolveSshConfigPath()
  writeFileSync(configPath, content, 'utf-8')
}

function parseHostAliases(hostLine: string): string[] {
  const withoutComment = hostLine.replace(/\s+#.*$/, '')
  const hostMatch = withoutComment.match(/^\s*Host\s+(.+)$/i)
  if (!hostMatch) return []
  return hostMatch[1]
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function findHostBlocks(lines: string[]): HostBlock[] {
  const hostLineIndexes: number[] = []

  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*Host\s+.+$/i.test(lines[i])) {
      hostLineIndexes.push(i)
    }
  }

  return hostLineIndexes.map((startIndex, currentIndex) => {
    const nextStartIndex = hostLineIndexes[currentIndex + 1]
    const endIndex = nextStartIndex === undefined ? lines.length - 1 : nextStartIndex - 1
    return {
      startIndex,
      endIndex,
      aliases: parseHostAliases(lines[startIndex])
    }
  })
}

function renderHostBlock(input: Required<HostMutationInput>, lineEnding: '\n' | '\r\n'): string {
  const lines = [
    `Host ${input.alias}`,
    `  HostName ${input.host}`,
    `  Port ${input.port}`
  ]

  if (input.user) {
    lines.push(`  User ${input.user}`)
  }
  if (input.identityFile) {
    lines.push(`  IdentityFile ${input.identityFile}`)
  }
  if (input.bindAddress) {
    lines.push(`  BindAddress ${input.bindAddress}`)
  }
  if (input.proxyJump) {
    lines.push(`  ProxyJump ${input.proxyJump}`)
  }

  return `${lines.join(lineEnding)}${lineEnding}`
}

function ensureAliasAvailable(blocks: HostBlock[], alias: string, excludingBlock?: HostBlock): void {
  const isAliasTaken = blocks.some((block) => {
    if (excludingBlock && block === excludingBlock) return false
    return block.aliases.includes(alias)
  })
  if (isAliasTaken) {
    throw new Error(`Host alias already exists: ${alias}`)
  }
}

function splitBlockLines(blockText: string): string[] {
  const lines = blockText.split(/\r?\n/)
  if (lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

function replaceBlockLines(lines: string[], block: HostBlock, nextBlockText: string): string[] {
  lines.splice(
    block.startIndex,
    block.endIndex - block.startIndex + 1,
    ...splitBlockLines(nextBlockText)
  )
  return lines
}

function removeBlockLines(lines: string[], block: HostBlock): string[] {
  lines.splice(block.startIndex, block.endIndex - block.startIndex + 1)
  while (lines.length > 1 && lines[lines.length - 1] === '' && lines[lines.length - 2] === '') {
    lines.pop()
  }
  return lines
}

function appendBlockLines(lines: string[], blockText: string): string[] {
  const nextLines = [...lines]
  const blockLines = splitBlockLines(blockText)
  if (nextLines.length > 0) {
    while (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') {
      nextLines.pop()
    }
    nextLines.push('')
  }
  nextLines.push(...blockLines)
  return nextLines
}

function findHostBlockByAlias(blocks: HostBlock[], alias: string): HostBlock | undefined {
  return blocks.find((block) => block.aliases.includes(alias))
}

function normalizeOutput(content: string, lineEnding: '\n' | '\r\n'): string {
  if (!content.trim()) return ''
  return content.endsWith(lineEnding) ? content : `${content}${lineEnding}`
}

export function createHostConfig(input: HostMutationInput): SshHostConfig[] {
  const normalized = normalizeHostInput(input)
  const { content, lineEnding } = readConfigFile()
  const lines = content ? content.split(/\r?\n/) : []
  const blocks = findHostBlocks(lines)

  ensureAliasAvailable(blocks, normalized.alias)

  const newBlockText = renderHostBlock(normalized, lineEnding)
  const nextContent = normalizeOutput(appendBlockLines(lines, newBlockText).join(lineEnding), lineEnding)
  writeConfigFile(nextContent)
  return parseSshConfig()
}

export function updateHostConfig(originalAlias: string, input: HostMutationInput): SshHostConfig[] {
  const normalized = normalizeHostInput(input)
  const { content, lineEnding } = readConfigFile()
  const lines = content.split(/\r?\n/)
  const blocks = findHostBlocks(lines)
  const targetBlock = findHostBlockByAlias(blocks, originalAlias)

  if (!targetBlock) {
    throw new Error(`Host not found: ${originalAlias}`)
  }
  if (targetBlock.aliases.length > 1) {
    throw new Error(`Host "${originalAlias}" uses multiple aliases. Edit this block manually in ~/.ssh/config.`)
  }

  ensureAliasAvailable(blocks, normalized.alias, targetBlock)

  const nextBlockText = renderHostBlock(normalized, lineEnding)
  const updatedContent = replaceBlockLines(lines, targetBlock, nextBlockText).join(lineEnding)
  writeConfigFile(normalizeOutput(updatedContent, lineEnding))
  return parseSshConfig()
}

export function deleteHostConfig(alias: string): SshHostConfig[] {
  const targetAlias = alias.trim()
  if (!targetAlias) {
    throw new Error('Host alias is required')
  }

  const { content, lineEnding } = readConfigFile()
  const lines = content.split(/\r?\n/)
  const blocks = findHostBlocks(lines)
  const targetBlock = findHostBlockByAlias(blocks, targetAlias)

  if (!targetBlock) {
    throw new Error(`Host not found: ${targetAlias}`)
  }
  if (targetBlock.aliases.length > 1) {
    throw new Error(`Host "${targetAlias}" uses multiple aliases. Delete this block manually in ~/.ssh/config.`)
  }

  const nextContent = removeBlockLines(lines, targetBlock).join(lineEnding)
  writeConfigFile(normalizeOutput(nextContent, lineEnding))
  return parseSshConfig()
}
