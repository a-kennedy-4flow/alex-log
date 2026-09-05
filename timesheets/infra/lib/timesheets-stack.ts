// The AWS stack.
//
// One DynamoDB table and one Lambda behind an HTTP API with a Cognito JWT
// authorizer. The SPA is static so it sits in a private bucket behind
// CloudFront.
//
// Sign in federates to IAM Identity Center over SAML 2.0. Cognito is the
// service provider. Identity Center is the identity provider. The user reaches
// the app from a tile on the Identity Center portal.

import { Duration, RemovalPolicy, Stack, type StackProps, CfnOutput } from 'aws-cdk-lib'
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Construct } from 'constructs'

const here = dirname(fileURLToPath(import.meta.url))
const API_BUNDLE = join(here, '../../apps/api/dist')

/** The name Cognito knows the Identity Center provider by. It appears in the
 * generated username of every federated user so it is fixed here rather than
 * configured. */
export const SAML_PROVIDER = 'IdentityCenter'

/** Where the SPA receives the authorization code. */
export const CALLBACK_PATH = '/auth/callback'

/** A developer may run the SPA against the deployed pool from this origin. */
const LOCAL_ORIGIN = 'http://localhost:5173'

/**
 * Identity Center sends these SAML attribute names. They are the claim URIs
 * rather than short names because the URI form is unambiguous across providers.
 */
const SAML_ATTRIBUTES = {
  email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  givenName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
  familyName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
}

export interface TimesheetsStackProps extends StackProps {
  /** Prefix for the hosted Cognito sign in domain. Must be unique in the region. */
  cognitoDomainPrefix: string
  /**
   * The Identity Center metadata document for the timesheets application. The
   * SAML provider is created only once this is supplied. Without it the pool
   * keeps its own sign in so the deployment stays usable while the application
   * is being created on the portal.
   */
  samlMetadataUrl?: string
}

export class TimesheetsStack extends Stack {
  constructor(scope: Construct, id: string, props: TimesheetsStackProps) {
    super(scope, id, props)

    /* ---------- storage ---------- */

    // One table. The partition key separates a user from every other user so a
    // guessed sort key cannot cross that boundary.
    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Six months of history is enforced by the item expiry the API writes.
      timeToLiveAttribute: 'expiresAt',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    /* ---------- the site ---------- */

    // The distribution is declared before the app client because its domain is
    // the callback the client must allow.

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    const distribution = new cloudfront.Distribution(this, 'Site', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      // The SPA routes on the client so a deep link must still serve the shell.
      // The callback path has no object behind it either.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    })

    const siteUrl = `https://${distribution.distributionDomainName}`
    const origins_ = [siteUrl, LOCAL_ORIGIN]

    /* ---------- identity ---------- */

    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      // Every mapped attribute is mutable. Because Cognito rewrites them on each
      // federated sign in and an immutable attribute fails that write.
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
      },
      passwordPolicy: { minLength: 12, requireDigits: true, requireSymbols: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // Membership of this group is what lets someone replace the project list.
    // Identity Center cannot carry a group in a SAML assertion for a customer
    // managed application so membership is granted here with
    // `admin-add-user-to-group` after the person has signed in once.
    new cognito.CfnUserPoolGroup(this, 'BackofficeGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'backoffice',
      description: 'May upload the project numbers and the bank holidays',
    })

    const federated = props.samlMetadataUrl !== undefined

    const provider = federated
      ? new cognito.UserPoolIdentityProviderSaml(this, 'IdentityCenter', {
          userPool,
          name: SAML_PROVIDER,
          metadata: cognito.UserPoolIdentityProviderSamlMetadata.url(props.samlMetadataUrl!),
          // Signing out of the app ends the Identity Center session too.
          idpSignout: true,
          attributeMapping: {
            email: cognito.ProviderAttribute.other(SAML_ATTRIBUTES.email),
            givenName: cognito.ProviderAttribute.other(SAML_ATTRIBUTES.givenName),
            familyName: cognito.ProviderAttribute.other(SAML_ATTRIBUTES.familyName),
          },
        })
      : undefined

    const mapped = ['email', 'givenName', 'familyName']

    const client = userPool.addClient('WebClient', {
      // Federated users hold no password so the pool needs no direct flow once
      // the provider exists.
      authFlows: federated ? {} : { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: origins_.map((origin) => `${origin}${CALLBACK_PATH}`),
        logoutUrls: origins_.map((origin) => `${origin}/`),
      },
      supportedIdentityProviders: federated
        ? [cognito.UserPoolClientIdentityProvider.custom(SAML_PROVIDER)]
        : [cognito.UserPoolClientIdentityProvider.COGNITO],
      // Cognito refuses the sign in when it may not write an attribute it maps.
      writeAttributes: new cognito.ClientAttributes().withStandardAttributes({
        email: true,
        givenName: true,
        familyName: true,
      }),
      readAttributes: new cognito.ClientAttributes().withStandardAttributes({
        email: true,
        emailVerified: true,
        givenName: true,
        familyName: true,
      }),
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      // The browser holds no secret so the session ends when the refresh token
      // does. A working day is one sign in.
      refreshTokenValidity: Duration.hours(12),
      preventUserExistenceErrors: true,
    })

    // The provider must exist before the client names it.
    if (provider) client.node.addDependency(provider)

    const domain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: props.cognitoDomainPrefix },
    })

    /* ---------- api ---------- */

    // The bundle is built by `pnpm --filter @timesheets/api bundle` rather than
    // during synth. Because a) the esbuild binary shim is not runnable under
    // pnpm. b) an explicit artefact is reproducible. c) synth then needs no
    // toolchain of its own.
    if (!existsSync(join(API_BUNDLE, 'lambda.mjs'))) {
      throw new Error('run `pnpm --filter @timesheets/api bundle` before synth')
    }

    const handler = new lambda.Function(this, 'ApiFunction', {
      code: lambda.Code.fromAsset(API_BUNDLE),
      handler: 'lambda.main',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      // The export decompresses the catalogue and zips a workbook so it needs
      // more than the default three seconds on a cold start.
      timeout: Duration.seconds(30),
      environment: { TABLE_NAME: table.tableName, NODE_OPTIONS: '--enable-source-maps' },
      logGroup: new logs.LogGroup(this, 'ApiLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    })
    table.grantReadWriteData(handler)

    const api = new apigw.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.PUT,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: origins_,
      },
    })

    // The authorizer verifies the Cognito token before the function runs so the
    // handler can trust every claim it reads. The SPA sends the access token so
    // the audience is checked against the client id.
    const authorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [client.userPoolClientId] },
    )

    const integration = new HttpLambdaIntegration('ApiIntegration', handler)

    api.addRoutes({
      path: '/api/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration,
      authorizer,
    })

    // Health is the one route without a token so a monitor can reach it. The
    // literal path wins over the proxy so the authorizer never sees it.
    api.addRoutes({
      path: '/api/health',
      methods: [apigw.HttpMethod.GET],
      integration,
    })

    /* ---------- what the operator needs ---------- */

    const hostedUi = `https://${props.cognitoDomainPrefix}.auth.${this.region}.amazoncognito.com`

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint })
    new CfnOutput(this, 'SiteUrl', { value: siteUrl })
    new CfnOutput(this, 'SiteBucketName', { value: siteBucket.bucketName })
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId })
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId })
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId })
    new CfnOutput(this, 'TableName', { value: table.tableName })
    new CfnOutput(this, 'HostedUiDomain', { value: domain.baseUrl() })

    // The two values the Identity Center administrator is asked for.
    new CfnOutput(this, 'SamlEntityId', {
      value: `urn:amazon:cognito:sp:${userPool.userPoolId}`,
      description: 'Application SAML audience for the Identity Center application',
    })
    new CfnOutput(this, 'SamlAcsUrl', {
      value: `${hostedUi}/saml2/idpresponse`,
      description: 'Application ACS URL for the Identity Center application',
    })
    new CfnOutput(this, 'SamlProviderName', { value: federated ? SAML_PROVIDER : 'none' })
  }
}
