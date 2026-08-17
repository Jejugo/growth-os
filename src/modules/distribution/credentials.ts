import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { env } from '@/lib/env'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const hex = env().DISTRIBUTION_ENCRYPTION_KEY
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== 32) {
    throw new Error('DISTRIBUTION_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes).')
  }
  return buf
}

/**
 * Cifra um objeto de credenciais. Retorna base64(iv + authTag + ciphertext).
 * Nunca inclua o resultado em logs — é cifrado mas não opaco a quem tiver a chave.
 */
export function encryptCredentials(credentials: object): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  const combined = Buffer.concat([iv, authTag, ciphertext])
  return combined.toString('base64')
}

/**
 * Decifra credenciais previamente cifradas com encryptCredentials.
 */
export function decryptCredentials<T = unknown>(encrypted: string): T {
  const key = getKey()
  const combined = Buffer.from(encrypted, 'base64')

  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plaintext.toString('utf8')) as T
}
