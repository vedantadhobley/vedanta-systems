import { readFile } from 'node:fs/promises'
import { credsAuthenticator, type Authenticator } from 'nats'

// An explicitly configured file must load successfully. Never downgrade a
// missing or malformed credential to an anonymous connection.
export async function loadNatsAuthenticator(path?: string): Promise<Authenticator | undefined> {
  return path ? credsAuthenticator(await readFile(path)) : undefined
}
