import { Client, SFTPWrapper, ClientChannel, type ConnectConfig } from 'ssh2'
import { existsSync, readFileSync, createReadStream, renameSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { WebContents } from 'electron'
import type { Readable } from 'stream'
import type { SshHostConfig } from './config-parser'

export interface FileEntry {
  filename: string
  longname: string
  isDirectory: boolean
  size: number
  mtime: number
}

export interface FileContent {
  text?: string
  base64?: string
  mimeType: string
  size: number
  error?: string
}

interface Connection {
  client: Client
  sftp: SFTPWrapper
  hostConfig: SshHostConfig
  jumpClients: Client[]
}

interface PtySession {
  stream: ClientChannel
  connectionId: string
}

const connections = new Map<string, Connection>()
const ptySessions = new Map<string, PtySession>()

let idCounter = 0
function nextId(): string {
  return String(++idCounter)
}

function stripOuterQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function expandPath(p: string): string {
  const cleaned = stripOuterQuotes(p.trim())
  const withHomeExpanded = cleaned.startsWith('~') ? join(homedir(), cleaned.slice(1)) : cleaned

  if (process.platform === 'win32') {
    return withHomeExpanded.replace(/%([^%]+)%/g, (_, envName: string) => {
      return process.env[envName] ?? `%${envName}%`
    })
  }

  return withHomeExpanded.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, envName: string) => {
    return process.env[envName] ?? `$${envName}`
  })
}

const DEFAULT_IDENTITY_FILENAMES = ['id_ed25519', 'id_ecdsa', 'id_rsa', 'id_dsa']

type AuthCandidate = Pick<ConnectConfig, 'password' | 'privateKey' | 'agent'>

function getDefaultIdentityPaths(): string[] {
  return DEFAULT_IDENTITY_FILENAMES.map((filename) => join(homedir(), '.ssh', filename)).filter(
    (path) => existsSync(path)
  )
}

function getConfiguredIdentityPath(hostConfig: SshHostConfig): string | undefined {
  if (!hostConfig.identityFile) return undefined
  const expandedPath = expandPath(hostConfig.identityFile)
  if (!existsSync(expandedPath)) return undefined
  return expandedPath
}

function getAgentSocket(): string | undefined {
  if (process.env.SSH_AUTH_SOCK) return process.env.SSH_AUTH_SOCK
  if (process.platform === 'win32') return '\\\\.\\pipe\\openssh-ssh-agent'
  return undefined
}

function getAuthCandidates(hostConfig: SshHostConfig, password?: string): AuthCandidate[] {
  if (password) return [{ password }]

  const candidates: AuthCandidate[] = []
  const configuredIdentityPath = getConfiguredIdentityPath(hostConfig)
  const identityPaths = configuredIdentityPath
    ? [configuredIdentityPath]
    : getDefaultIdentityPaths()

  for (const identityPath of identityPaths) {
    try {
      const privateKey = readFileSync(identityPath)
      candidates.push({ privateKey })
    } catch {
      continue
    }
  }

  const agentSocket = getAgentSocket()
  if (agentSocket) candidates.push({ agent: agentSocket })

  return candidates
}

export type ConnectionErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'HOST_KEY_ERROR'
  | 'UNKNOWN'

export interface ConnectionError {
  code: ConnectionErrorCode
  message: string
}

const ERROR_MESSAGES: Record<ConnectionErrorCode, string> = {
  AUTH_REQUIRED: 'Authentication required. Please provide a password.',
  AUTH_FAILED: 'Authentication failed. Please check your password and try again.',
  NETWORK_ERROR: 'Unable to connect. Please check the host address and your network.',
  HOST_KEY_ERROR: 'Host key verification failed.',
  UNKNOWN: 'An unexpected error occurred.'
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(String(error))
}

const AUTH_PATTERNS = [
  'authentication',
  'permission denied',
  'all configured authentication methods failed',
  'all authentication methods failed',
  'no authentication method',
  'unable to authenticate',
  'failed to connect to agent',
  'cannot parse privatekey',
  'encrypted private openssh key'
]

const NETWORK_PATTERNS = [
  'econnrefused',
  'etimedout',
  'enotfound',
  'enetunreach',
  'ehostunreach',
  'econnreset',
  'connect timeout',
  'timed out while waiting for handshake',
  'getaddrinfo'
]

const HOST_KEY_PATTERNS = ['host key', 'hostkey']

function classifyError(error: unknown, hasPassword: boolean): ConnectionError {
  const message = toError(error).message.toLowerCase()

  if (HOST_KEY_PATTERNS.some((p) => message.includes(p))) {
    return { code: 'HOST_KEY_ERROR', message: ERROR_MESSAGES.HOST_KEY_ERROR }
  }

  if (NETWORK_PATTERNS.some((p) => message.includes(p))) {
    return { code: 'NETWORK_ERROR', message: ERROR_MESSAGES.NETWORK_ERROR }
  }

  if (AUTH_PATTERNS.some((p) => message.includes(p))) {
    return {
      code: hasPassword ? 'AUTH_FAILED' : 'AUTH_REQUIRED',
      message: hasPassword ? ERROR_MESSAGES.AUTH_FAILED : ERROR_MESSAGES.AUTH_REQUIRED
    }
  }

  return { code: 'UNKNOWN', message: toError(error).message }
}

function resolveUsername(hostConfig: SshHostConfig): string {
  return hostConfig.user || process.env.USER || process.env.USERNAME || ''
}

function parseHostAndPort(hostWithPort: string): { host: string; port: number } {
  if (hostWithPort.startsWith('[')) {
    const closingBracketIndex = hostWithPort.indexOf(']')
    if (closingBracketIndex > 0) {
      const host = hostWithPort.slice(1, closingBracketIndex)
      const portText = hostWithPort.slice(closingBracketIndex + 1)
      if (portText.startsWith(':')) {
        const parsedPort = Number.parseInt(portText.slice(1), 10)
        if (!Number.isNaN(parsedPort)) return { host, port: parsedPort }
      }
      return { host, port: 22 }
    }
  }

  const colonIndex = hostWithPort.lastIndexOf(':')
  const hasSingleColon = colonIndex > -1 && hostWithPort.indexOf(':') === colonIndex
  if (hasSingleColon) {
    const host = hostWithPort.slice(0, colonIndex)
    const parsedPort = Number.parseInt(hostWithPort.slice(colonIndex + 1), 10)
    if (host && !Number.isNaN(parsedPort)) {
      return { host, port: parsedPort }
    }
  }

  return { host: hostWithPort, port: 22 }
}

function resolveProxyHop(
  rawHop: string,
  hostsByAlias: Map<string, SshHostConfig>,
  fallbackUser: string
): SshHostConfig {
  const predefinedHost = hostsByAlias.get(rawHop)
  if (predefinedHost) return predefinedHost

  const atIndex = rawHop.lastIndexOf('@')
  const user = atIndex >= 0 ? rawHop.slice(0, atIndex) : fallbackUser
  const hostWithPort = atIndex >= 0 ? rawHop.slice(atIndex + 1) : rawHop
  const { host, port } = parseHostAndPort(hostWithPort)

  return {
    alias: rawHop,
    host,
    port,
    user
  }
}

function resolveProxyRoute(
  hostConfig: SshHostConfig,
  hostsByAlias: Map<string, SshHostConfig>,
  visitingAliases: Set<string> = new Set()
): SshHostConfig[] {
  const proxyJump = hostConfig.proxyJump?.trim()
  if (!proxyJump || proxyJump.toLowerCase() === 'none') return []

  const route: SshHostConfig[] = []
  const hops = proxyJump
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean)

  for (const hop of hops) {
    const resolvedHop = resolveProxyHop(hop, hostsByAlias, hostConfig.user)
    const fullHopConfig = hostsByAlias.get(resolvedHop.alias)

    if (fullHopConfig) {
      if (visitingAliases.has(fullHopConfig.alias)) {
        throw new Error(`Circular ProxyJump detected: ${fullHopConfig.alias}`)
      }

      visitingAliases.add(fullHopConfig.alias)
      route.push(...resolveProxyRoute(fullHopConfig, hostsByAlias, visitingAliases))
      route.push(fullHopConfig)
      visitingAliases.delete(fullHopConfig.alias)
      continue
    }

    route.push(resolvedHop)
  }

  return route
}

function openForwardStream(client: Client, host: string, port: number): Promise<Readable> {
  return new Promise((resolve, reject) => {
    client.forwardOut('127.0.0.1', 0, host, port, (error, stream) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stream)
    })
  })
}

async function connectOnce(
  hostConfig: SshHostConfig,
  authCandidate: AuthCandidate,
  socketFactory?: () => Promise<Readable>
): Promise<Client> {
  const username = resolveUsername(hostConfig)
  if (!username) {
    throw new Error(`Username is missing for host: ${hostConfig.alias}`)
  }

  const socket = socketFactory ? await socketFactory() : undefined

  return new Promise((resolve, reject) => {
    const client = new Client()
    let isSettled = false

    const handleReady = (): void => {
      if (isSettled) return
      isSettled = true
      client.removeListener('error', handleError)
      resolve(client)
    }

    const handleError = (error: Error): void => {
      if (isSettled) return
      isSettled = true
      client.removeListener('ready', handleReady)
      client.on('error', () => {})
      client.end()
      reject(error)
    }

    client.once('ready', handleReady)
    client.once('error', handleError)

    client.connect({
      host: hostConfig.host,
      port: hostConfig.port,
      username,
      ...(hostConfig.bindAddress ? { localAddress: hostConfig.bindAddress } : {}),
      ...(socket ? { sock: socket } : {}),
      ...authCandidate
    })
  })
}

async function connectWithAuthFallback(
  hostConfig: SshHostConfig,
  password?: string,
  socketFactory?: () => Promise<Readable>
): Promise<Client> {
  const authCandidates = getAuthCandidates(hostConfig, password)
  if (authCandidates.length === 0) {
    throw Object.assign(new Error(ERROR_MESSAGES.AUTH_REQUIRED), {
      connectionErrorCode: 'AUTH_REQUIRED' as ConnectionErrorCode
    })
  }

  let lastError: unknown = null
  for (const authCandidate of authCandidates) {
    try {
      return await connectOnce(hostConfig, authCandidate, socketFactory)
    } catch (error) {
      lastError = error
      const isAuthError = AUTH_PATTERNS.some((p) =>
        toError(error).message.toLowerCase().includes(p)
      )
      if (password || !isAuthError) {
        throw error
      }
    }
  }

  throw lastError
}

function createSftp(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) {
        reject(error)
        return
      }
      resolve(sftp)
    })
  })
}

export type ConnectResult =
  | { ok: true; connectionId: string }
  | { ok: false; error: ConnectionError }

export async function connect(
  hostConfig: SshHostConfig,
  password?: string,
  allHosts: SshHostConfig[] = []
): Promise<ConnectResult> {
  const jumpClients: Client[] = []
  let targetClient: Client | null = null

  try {
    const hostsByAlias = new Map(allHosts.map((host) => [host.alias, host]))
    const proxyRoute = resolveProxyRoute(hostConfig, hostsByAlias)

    let upstreamClient: Client | undefined
    for (const proxyHost of proxyRoute) {
      const currentUpstream = upstreamClient
      const socketFactory = currentUpstream
        ? () => openForwardStream(currentUpstream, proxyHost.host, proxyHost.port)
        : undefined

      const jumpClient = await connectWithAuthFallback(proxyHost, password, socketFactory)
      jumpClients.push(jumpClient)
      upstreamClient = jumpClient
    }

    const finalUpstream = upstreamClient
    const targetSocketFactory = finalUpstream
      ? () => openForwardStream(finalUpstream, hostConfig.host, hostConfig.port)
      : undefined

    targetClient = await connectWithAuthFallback(hostConfig, password, targetSocketFactory)
    const sftp = await createSftp(targetClient)

    const id = nextId()
    connections.set(id, { client: targetClient, sftp, hostConfig, jumpClients })
    return { ok: true, connectionId: id }
  } catch (error) {
    if (targetClient) {
      try {
        targetClient.end()
      } catch {}
    }

    for (const jumpClient of [...jumpClients].reverse()) {
      try {
        jumpClient.end()
      } catch {}
    }

    return { ok: false, error: classifyError(error, !!password) }
  }
}

export async function listDir(connectionId: string, path: string): Promise<FileEntry[]> {
  const conn = connections.get(connectionId)
  if (!conn) throw new Error('Not connected')

  return new Promise((resolve, reject) => {
    conn.sftp.readdir(path, (err, list) => {
      if (err) return reject(err)
      resolve(
        list.map((item) => ({
          filename: item.filename,
          longname: item.longname,
          isDirectory: (item.attrs.mode! & 0o170000) === 0o040000,
          size: item.attrs.size ?? 0,
          mtime: item.attrs.mtime ?? 0
        }))
      )
    })
  })
}

const TEXT_MIME_TYPES: Record<string, string> = {
  ts: 'text/typescript',
  tsx: 'text/typescript',
  js: 'text/javascript',
  jsx: 'text/javascript',
  vue: 'text/html',
  html: 'text/html',
  css: 'text/css',
  json: 'application/json',
  md: 'text/markdown',
  py: 'text/x-python',
  sh: 'text/x-sh',
  bash: 'text/x-sh',
  zsh: 'text/x-sh',
  txt: 'text/plain',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  toml: 'text/toml',
  rs: 'text/x-rust',
  go: 'text/x-go',
  java: 'text/x-java',
  c: 'text/x-c',
  cpp: 'text/x-c++',
  h: 'text/x-c',
  xml: 'text/xml',
  sql: 'text/x-sql',
  env: 'text/plain',
  conf: 'text/plain',
  ini: 'text/plain',
  cfg: 'text/plain',
  log: 'text/plain'
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon'
}

export async function readFile(connectionId: string, path: string): Promise<FileContent> {
  const conn = connections.get(connectionId)
  if (!conn) throw new Error('Not connected')

  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const textMime = TEXT_MIME_TYPES[ext]
  const imageMime = IMAGE_MIME_TYPES[ext]
  const mimeType = textMime ?? imageMime ?? 'application/octet-stream'

  // Check file size via stat
  const attrs = await new Promise<{ size: number }>((resolve, reject) => {
    conn.sftp.stat(path, (err, stats) => {
      if (err) return reject(err)
      resolve({ size: stats.size ?? 0 })
    })
  })

  const MAX_SIZE = 5 * 1024 * 1024
  if (attrs.size > MAX_SIZE) {
    return {
      mimeType,
      size: attrs.size,
      error: `File too large (${(attrs.size / 1024 / 1024).toFixed(1)} MB). Limit is 5 MB.`
    }
  }

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = conn.sftp.createReadStream(path)
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })

  if (textMime) {
    return { text: buffer.toString('utf-8'), mimeType, size: attrs.size }
  } else if (imageMime) {
    return { base64: buffer.toString('base64'), mimeType, size: attrs.size }
  } else {
    return {
      mimeType,
      size: attrs.size,
      error: 'Binary file — cannot preview.'
    }
  }
}

export async function deleteFile(connectionId: string, path: string): Promise<void> {
  const conn = connections.get(connectionId)
  if (!conn) throw new Error('Not connected')

  return new Promise<void>((resolve, reject) => {
    conn.sftp.unlink(path, (err) => (err ? reject(err) : resolve()))
  })
}

export async function uploadFile(
  connectionId: string,
  remotePath: string,
  localPath: string
): Promise<void> {
  const conn = connections.get(connectionId)
  if (!conn) throw new Error('Not connected')

  const tmpPath = remotePath + '.tmp_upload_' + Date.now()

  try {
    await new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(localPath)
      const writeStream = conn.sftp.createWriteStream(tmpPath)
      let isSettled = false

      const cleanup = (): void => {
        readStream.removeListener('error', handleError)
        writeStream.removeListener('error', handleError)
        writeStream.removeListener('close', handleClose)
      }

      const handleError = (error: Error): void => {
        if (isSettled) return
        isSettled = true
        cleanup()
        reject(error)
      }

      const handleClose = (): void => {
        if (isSettled) return
        isSettled = true
        cleanup()
        resolve()
      }

      readStream.on('error', handleError)
      writeStream.on('error', handleError)
      writeStream.on('close', handleClose)
      readStream.pipe(writeStream)
    })

    // Prefer posix-rename@openssh.com (atomic replace, handles existing target).
    // Only fall back to standard rename when the server explicitly doesn't support
    // the extension — standard rename works for new files; if the target already
    // exists the server will reject it and the caller gets a clear error (no data
    // loss: the original file is untouched and tmpPath is cleaned up by catch).
    const posixRenameErr = await new Promise<Error | null>((resolve) => {
      conn.sftp.ext_openssh_rename(tmpPath, remotePath, (err) => resolve(err ?? null))
    })
    if (posixRenameErr !== null) {
      if (posixRenameErr.message !== 'Server does not support this extended request') {
        throw posixRenameErr
      }
      await new Promise<void>((resolve, reject) => {
        conn.sftp.rename(tmpPath, remotePath, (err) => (err ? reject(err) : resolve()))
      })
    }
  } catch (err) {
    conn.sftp.unlink(tmpPath, () => {})
    throw err
  }
}

export async function downloadFile(
  connectionId: string,
  remotePath: string,
  localPath: string
): Promise<void> {
  const conn = connections.get(connectionId)
  if (!conn) throw new Error('Not connected')

  const tmpPath = localPath + '.download'
  try {
    await new Promise<void>((resolve, reject) => {
      conn.sftp.fastGet(remotePath, tmpPath, (err) => (err ? reject(err) : resolve()))
    })
    if (existsSync(localPath)) {
      unlinkSync(localPath)
    }
    renameSync(tmpPath, localPath)
  } catch (err) {
    try {
      unlinkSync(tmpPath)
    } catch {
      // ignore cleanup error
    }
    throw err
  }
}

export async function createPty(
  connectionId: string,
  webContents: WebContents,
  cols: number,
  rows: number
): Promise<string> {
  const conn = connections.get(connectionId)
  if (!conn) throw new Error('Not connected')

  return new Promise((resolve, reject) => {
    conn.client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
      if (err) return reject(err)

      const ptyId = nextId()
      ptySessions.set(ptyId, { stream, connectionId })

      stream.on('data', (data: Buffer) => {
        if (!webContents.isDestroyed()) {
          webContents.send('ssh:terminal-data', { id: ptyId, data: data.toString() })
        }
      })

      stream.stderr.on('data', (data: Buffer) => {
        if (!webContents.isDestroyed()) {
          webContents.send('ssh:terminal-data', { id: ptyId, data: data.toString() })
        }
      })

      stream.on('close', () => {
        ptySessions.delete(ptyId)
        if (!webContents.isDestroyed()) {
          webContents.send('ssh:terminal-data', { id: ptyId, data: '\r\n[Session closed]\r\n' })
        }
      })

      resolve(ptyId)
    })
  })
}

export function resizePty(ptyId: string, cols: number, rows: number): void {
  const session = ptySessions.get(ptyId)
  if (session) session.stream.setWindow(rows, cols, 0, 0)
}

export function inputPty(ptyId: string, data: string): void {
  const session = ptySessions.get(ptyId)
  if (session) session.stream.write(data)
}

export function closePty(ptyId: string): void {
  const session = ptySessions.get(ptyId)
  if (session) {
    session.stream.end()
    ptySessions.delete(ptyId)
  }
}

export function disconnect(connectionId: string): void {
  const conn = connections.get(connectionId)
  if (!conn) return

  for (const [ptyId, session] of ptySessions) {
    if (session.connectionId === connectionId) {
      session.stream.end()
      ptySessions.delete(ptyId)
    }
  }

  conn.sftp.end()
  conn.client.end()
  for (const jumpClient of [...conn.jumpClients].reverse()) {
    try {
      jumpClient.end()
    } catch {}
  }
  connections.delete(connectionId)
}

process.on('exit', () => {
  for (const conn of connections.values()) {
    try {
      conn.client.end()
    } catch {}
    for (const jumpClient of conn.jumpClients) {
      try {
        jumpClient.end()
      } catch {}
    }
  }
})
