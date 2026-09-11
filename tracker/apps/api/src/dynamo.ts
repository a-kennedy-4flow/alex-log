// The DynamoDB implementation of the repository.
//
// The table is created by the CDK stack in infra. It has a string partition key
// `pk` and a string sort key `sk` and time to live on `expiresAt`.

import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

import type { UserProfile } from '@tracker/core'

import {
  compress,
  decompress,
  expiryFor,
  type Repository,
  type StoredCatalogue,
  type StoredJiraLink,
  type StoredSheet,
} from './repository'

const CATALOGUE_PK = 'CATALOGUE'
const CATALOGUE_SK = 'CURRENT'
const JIRA_SK = 'JIRA'

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
    if (!item) return null
    const profile = item.profile as UserProfile
    // A profile written before these fields existed reads as no language chosen
    // and opted in. Left undefined the reminder would treat the user as muted.
    return {
      ...profile,
      locale: profile.locale ?? null,
      remindByEmail: profile.remindByEmail !== false,
      hoursPerDay: profile.hoursPerDay ?? null,
      jiraProjects: profile.jiraProjects ?? {},
      jiraTickets: profile.jiraTickets ?? {},
    }
  }

  async putProfile(sub: string, profile: UserProfile): Promise<void> {
    await this.put({ pk: userPk(sub), sk: 'PROFILE', profile })
  }

  async getSheet(sub: string, period: string): Promise<StoredSheet | null> {
    const item = await this.get(userPk(sub), `SHEET#${period}`)
    if (!item) return null
    const sheet = decompress<StoredSheet>(item.sheet as string)
    // A sheet written before the field existed reads as never downloaded.
    return { ...sheet, exportedAt: sheet.exportedAt ?? null }
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

  // Neither `version` nor `updatedAt` is a DynamoDB reserved word so the
  // projection needs no alias.
  async getCatalogueVersion(): Promise<{ version: string; updatedAt: string } | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.table,
        Key: marshall({ pk: CATALOGUE_PK, sk: CATALOGUE_SK }),
        ProjectionExpression: 'version, updatedAt',
      }),
    )
    if (!result.Item) return null
    const row = unmarshall(result.Item)
    return { version: row.version as string, updatedAt: row.updatedAt as string }
  }

  async claimReminder(sub: string, period: string, at: Date): Promise<boolean> {
    try {
      await this.client.send(
        new PutItemCommand({
          TableName: this.table,
          Item: marshall({
            pk: userPk(sub),
            sk: `REMIND#${period}`,
            sentAt: at.toISOString(),
            expiresAt: expiryFor(period, this.now()),
          }),
          ConditionExpression: 'attribute_not_exists(sk)',
        }),
      )
      return true
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false
      throw error
    }
  }

  async releaseReminder(sub: string, period: string): Promise<void> {
    await this.client.send(
      new DeleteItemCommand({
        TableName: this.table,
        Key: marshall({ pk: userPk(sub), sk: `REMIND#${period}` }),
      }),
    )
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

  async getJiraLink(sub: string): Promise<StoredJiraLink | null> {
    const item = await this.get(userPk(sub), JIRA_SK)
    if (!item) return null
    return decompress<StoredJiraLink>(item.link as string)
  }

  async putJiraLink(sub: string, link: StoredJiraLink): Promise<void> {
    // No `expiresAt`. The table expires a sheet after six months and a link
    // must outlive that or every user relinks twice a year.
    await this.put({
      pk: userPk(sub),
      sk: JIRA_SK,
      generation: link.generation,
      link: compress(link),
    })
  }

  async deleteJiraLink(sub: string): Promise<void> {
    await this.client.send(
      new DeleteItemCommand({
        TableName: this.table,
        Key: marshall({ pk: userPk(sub), sk: JIRA_SK }),
      }),
    )
  }

  async claimJiraRefresh(sub: string, until: Date): Promise<boolean> {
    try {
      await this.client.send(
        new UpdateItemCommand({
          TableName: this.table,
          Key: marshall({ pk: userPk(sub), sk: JIRA_SK }),
          UpdateExpression: 'SET claimedUntil = :until',
          // The item must exist. A claim on nothing would create a link with no
          // token in it. A lapsed claim is taken over rather than waited on
          // because the holder of one is a container that is already gone.
          ConditionExpression:
            'attribute_exists(sk) AND (attribute_not_exists(claimedUntil) OR claimedUntil < :now)',
          ExpressionAttributeValues: marshall({
            ':until': until.getTime(),
            ':now': this.now().getTime(),
          }),
        }),
      )
      return true
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false
      throw error
    }
  }

  async releaseJiraRefresh(sub: string): Promise<void> {
    await this.client.send(
      new UpdateItemCommand({
        TableName: this.table,
        Key: marshall({ pk: userPk(sub), sk: JIRA_SK }),
        UpdateExpression: 'REMOVE claimedUntil',
      }),
    )
  }

  async putJiraLinkIfUnchanged(
    sub: string,
    link: StoredJiraLink,
    generation: number,
  ): Promise<boolean> {
    try {
      await this.client.send(
        new UpdateItemCommand({
          TableName: this.table,
          Key: marshall({ pk: userPk(sub), sk: JIRA_SK }),
          UpdateExpression: 'SET #g = :next, #l = :link REMOVE claimedUntil',
          ConditionExpression: '#g = :expected',
          ExpressionAttributeNames: { '#g': 'generation', '#l': 'link' },
          ExpressionAttributeValues: marshall({
            ':expected': generation,
            ':next': link.generation,
            ':link': compress(link),
          }),
        }),
      )
      return true
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false
      throw error
    }
  }
}
