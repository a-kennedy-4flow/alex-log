// The user pool as a directory.
//
// The client comes from the Lambda runtime rather than the bundle. That is the
// same arrangement `dynamo.ts` already relies on.

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'

import type { Directory, DirectoryUser } from './reminder'

/** The most a single call returns. */
const PAGE = 60

/** A guard against a paging loop. Six thousand users is far beyond this pool. */
const MAX_PAGES = 100

function attribute(user: UserType, name: string): string {
  return user.Attributes?.find((entry) => entry.Name === name)?.Value ?? ''
}

export class CognitoDirectory implements Directory {
  constructor(
    private readonly userPoolId: string,
    private readonly client: CognitoIdentityProviderClient = new CognitoIdentityProviderClient({}),
  ) {}

  async list(): Promise<DirectoryUser[]> {
    const out: DirectoryUser[] = []
    let token: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.client.send(
        new ListUsersCommand({
          UserPoolId: this.userPoolId,
          Limit: PAGE,
          ...(token ? { PaginationToken: token } : {}),
        }),
      )
      for (const user of result.Users ?? []) {
        if (user.Enabled === false) continue
        const email = attribute(user, 'email')
        // A federated user carries the pool subject as an attribute. The
        // username of one is the provider name and the provider id joined so it
        // is never the key the table is written under.
        const sub = attribute(user, 'sub')
        if (!email || !sub) continue
        out.push({ sub, email, firstName: attribute(user, 'given_name') })
      }
      token = result.PaginationToken
      if (!token) break
    }
    return out
  }
}
