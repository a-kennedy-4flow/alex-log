// The DynamoDB implementation of the repository.
//
// The table is created by the CDK stack in infra. It has a string partition key
// `pk` and a string sort key `sk` and time to live on `expiresAt`.

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

import type { UserProfile } from '@timesheets/core'

import {
  compress,
  decompress,
  expiryFor,
  type Repository,
  type StoredCatalogue,
  type StoredSheet,
} from './repository'

const CATALOGUE_PK = 'CATALOGUE'
const CATALOGUE_SK = 'CURRENT'

function userPk(sub: string): string {
  return `USER#${sub}`
}

export class DynamoRepository implements Repository {
  constructor(
    private readonly table: string,
    private readonly client: DynamoDBClient = new DynamoDBClient({}),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async get(pk: string, sk: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.send(
      new GetItemCommand({ TableName: this.table, Key: marshall({ pk, sk }) }),
    )
    return result.Item ? unmarshall(result.Item) : null
  }

  private async put(item: Record<string, unknown>): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.table,
        Item: marshall(item, { removeUndefinedValues: true }),
      }),
    )
  }

  async getProfile(sub: string): Promise<UserProfile | null> {
    const item = await this.get(userPk(sub), 'PROFILE')
    return item ? (item.profile as UserProfile) : null
  }

  async putProfile(sub: string, profile: UserProfile): Promise<void> {
    await this.put({ pk: userPk(sub), sk: 'PROFILE', profile })
  }

  async getSheet(sub: string, period: string): Promise<StoredSheet | null> {
    const item = await this.get(userPk(sub), `SHEET#${period}`)
    return item ? decompress<StoredSheet>(item.sheet as string) : null
  }

  async putSheet(sub: string, period: string, sheet: StoredSheet): Promise<void> {
    await this.put({
      pk: userPk(sub),
      sk: `SHEET#${period}`,
      period,
      updatedAt: sheet.updatedAt,
      // A month of half days is small but it compresses well and it keeps the
      // item shape identical to the catalogue one.
      sheet: compress(sheet),
      expiresAt: expiryFor(period, this.now()),
    })
  }

  async listSheets(sub: string): Promise<{ period: string; updatedAt: string }[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: marshall({ ':pk': userPk(sub), ':prefix': 'SHEET#' }),
        // The period is in the sort key so the newest sheet comes first.
        ScanIndexForward: false,
        ProjectionExpression: 'period, updatedAt',
      }),
    )
    return (result.Items ?? []).map((item) => {
      const row = unmarshall(item)
      return { period: row.period as string, updatedAt: row.updatedAt as string }
    })
  }

  async getCatalogue(): Promise<StoredCatalogue | null> {
    const item = await this.get(CATALOGUE_PK, CATALOGUE_SK)
    if (!item) return null
    return {
      version: item.version as string,
      updatedAt: item.updatedAt as string,
      data: decompress(item.data as string),
    }
  }

  async putCatalogue(entry: StoredCatalogue): Promise<void> {
    await this.put({
      pk: CATALOGUE_PK,
      sk: CATALOGUE_SK,
      version: entry.version,
      updatedAt: entry.updatedAt,
      data: compress(entry.data),
    })
  }
}
