import { BlueSkyChannel } from './bluesky'
import { LinkedInChannel } from './linkedin'
import { RedditChannel } from './reddit'
import type { DistributionChannel } from '../types'
import type { ChannelAccount } from '../schema'

const registry: Record<string, DistributionChannel> = {
  bluesky: new BlueSkyChannel(),
  linkedin: new LinkedInChannel(),
  reddit: new RedditChannel(),
}

export function getChannel(channel: ChannelAccount['channel']): DistributionChannel {
  const adapter = registry[channel]
  if (!adapter) throw new Error(`Canal não suportado: ${channel}`)
  return adapter
}

export function isManualChannel(channel: ChannelAccount['channel']): boolean {
  return getChannel(channel).publishMode === 'manual'
}
