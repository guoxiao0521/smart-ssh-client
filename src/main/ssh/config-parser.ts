import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import SSHConfig, { LineType, type Directive } from 'ssh-config'

export interface SshHostConfig {
  alias: string
  host: string
  port: number
  user: string
  identityFile?: string
  bindAddress?: string
  proxyJump?: string
}

export function resolveSshConfigPath(): string {
  if (process.platform === 'win32' && process.env.USERPROFILE) {
    return join(process.env.USERPROFILE, '.ssh', 'config')
  }
  return join(homedir(), '.ssh', 'config')
}

export function parseSshConfig(): SshHostConfig[] {
  const configPath = resolveSshConfigPath()
  let content: string
  try {
    content = readFileSync(configPath, 'utf-8')
  } catch {
    return []
  }

  const parsed = SSHConfig.parse(content)
  const results: SshHostConfig[] = []

  for (const entry of parsed) {
    if (entry.type !== LineType.DIRECTIVE) continue
    const d = entry as Directive
    if (d.param?.toLowerCase() !== 'host') continue

    // value can be string or array of {val, separator}
    const alias =
      typeof d.value === 'string'
        ? d.value.trim()
        : (d.value[0] as { val: string }).val?.trim() ?? ''

    if (!alias || alias === '*') continue

    // Use compute() to get effective settings for this host
    const computed = parsed.compute(alias)
    const get = (key: string): string | undefined => {
      const normalizedKey = key.toLowerCase()
      for (const [entryKey, rawValue] of Object.entries(computed as Record<string, unknown>)) {
        if (entryKey.toLowerCase() !== normalizedKey) continue
        if (Array.isArray(rawValue)) {
          return typeof rawValue[0] === 'string' ? rawValue[0] : undefined
        }
        return typeof rawValue === 'string' ? rawValue : undefined
      }
      return undefined
    }

    results.push({
      alias,
      host: get('HostName') ?? alias,
      port: Number.parseInt(get('Port') ?? '22', 10),
      user: get('User') ?? get('user') ?? '',
      identityFile: get('IdentityFile') ?? get('identityfile'),
      bindAddress: get('BindAddress') ?? get('bindaddress'),
      proxyJump: get('ProxyJump') ?? get('proxyjump')
    })
  }

  return results
}
