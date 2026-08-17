import { describe, it, expect, beforeAll } from 'vitest'
import { encryptCredentials, decryptCredentials } from '@/modules/distribution/credentials'

// Configura chave de teste (32 bytes em hex) antes do módulo env() cachear
beforeAll(() => {
  process.env.DISTRIBUTION_ENCRYPTION_KEY = '0'.repeat(64)
})

describe('cifragem de credenciais (AES-256-GCM)', () => {
  it('cifra e decifra um objeto corretamente', () => {
    const original = { identifier: 'user.bsky.social', appPassword: 'secret-pass' }
    const encrypted = encryptCredentials(original)
    const decrypted = decryptCredentials<typeof original>(encrypted)
    expect(decrypted).toEqual(original)
  })

  it('o texto cifrado não contém a senha em claro', () => {
    const creds = { appPassword: 'minhasenhasecreta' }
    const encrypted = encryptCredentials(creds)
    expect(encrypted).not.toContain('minhasenhasecreta')
  })

  it('dois cifrados do mesmo objeto são diferentes (IV aleatório)', () => {
    const creds = { identifier: 'test', appPassword: 'pass' }
    const enc1 = encryptCredentials(creds)
    const enc2 = encryptCredentials(creds)
    expect(enc1).not.toBe(enc2)
  })

  it('retorna base64 válido', () => {
    const encrypted = encryptCredentials({ x: 1 })
    expect(() => Buffer.from(encrypted, 'base64')).not.toThrow()
  })

  it('decifra preserva tipos aninhados', () => {
    const original = {
      identifier: 'handle.bsky.social',
      appPassword: 'xxxx-xxxx-xxxx-xxxx',
      meta: { expiresAt: '2027-01-01' },
    }
    const encrypted = encryptCredentials(original)
    const decrypted = decryptCredentials<typeof original>(encrypted)
    expect(decrypted.meta.expiresAt).toBe('2027-01-01')
  })
})
