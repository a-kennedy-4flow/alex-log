// The two AWS services the Jira function needs and no other function does.
//
// The client secret is read once per container. That is the arrangement
// `dynamo.ts` and `cognito.ts` already rely on.
//
// A refresh token is encrypted with KMS before it is written rather than being
// left to the encryption the table already has. Because a table export or a
// restored snapshot would otherwise carry a usable credential.

import { KMSClient, DecryptCommand, EncryptCommand } from '@aws-sdk/client-kms'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

import type { Cipher } from './jira-tokens'

export class KmsCipher implements Cipher {
  constructor(
    private readonly keyId: string,
    private readonly client: KMSClient = new KMSClient({}),
  ) {}

  async encrypt(plain: string): Promise<string> {
    const result = await this.client.send(
      new EncryptCommand({ KeyId: this.keyId, Plaintext: Buffer.from(plain, 'utf8') }),
    )
    if (!result.CiphertextBlob) throw new Error('KMS returned no ciphertext')
    return Buffer.from(result.CiphertextBlob).toString('base64')
  }

  async decrypt(cipher: string): Promise<string> {
    const result = await this.client.send(
      new DecryptCommand({
        KeyId: this.keyId,
        CiphertextBlob: Buffer.from(cipher, 'base64'),
      }),
    )
    if (!result.Plaintext) throw new Error('KMS returned no plaintext')
    return Buffer.from(result.Plaintext).toString('utf8')
  }
}

/**
 * Reads one secret and holds it for the life of the container.
 *
 * The value is never logged and never returned to a caller. It leaves this
 * process only in the body of a token request.
 */
export function secretReader(secretId: string): () => Promise<string> {
  const client = new SecretsManagerClient({})
  let held: string | null = null
  return async () => {
    if (held !== null) return held
    const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }))
    const raw = result.SecretString
    if (!raw) throw new Error(`the secret ${secretId} holds no string`)
    // The secret is filled by hand so it may be the bare value or a JSON object
    // with the console field name in it. Both are accepted.
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      held = parsed.clientSecret ?? parsed.client_secret ?? raw
    } catch {
      held = raw
    }
    return held
  }
}
