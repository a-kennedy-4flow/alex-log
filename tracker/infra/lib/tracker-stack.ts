// The AWS stack.
//
// One DynamoDB table and one Lambda behind an HTTP API with a Cognito JWT
// authorizer. The SPA is static so it sits in a private bucket behind
// CloudFront.
//
// Sign in federates to IAM Identity Center over SAML 2.0. Cognito is the
// service provider. Identity Center is the identity provider. The user reaches
// the app from a tile on the Identity Center portal.

import {
  ArnFormat,
  Duration,
  RemovalPolicy,
  Stack,
  TimeZone,
  type StackProps,
  CfnOutput,
} from 'aws-cdk-lib'
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as scheduler from 'aws-cdk-lib/aws-scheduler'
import * as schedulerTargets from 'aws-cdk-lib/aws-scheduler-targets'
import * as ses from 'aws-cdk-lib/aws-ses'
import * as targets from 'aws-cdk-lib/aws-route53-targets'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as secrets from 'aws-cdk-lib/aws-secretsmanager'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import { existsSync, readFileSync } from 'node:fs'
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

/**
 * A developer may run the SPA against the deployed pool from this origin. It is
 * added only when `allowLocalOrigin` says so. See that prop for why it is off by
 * default.
 */
const LOCAL_ORIGIN = 'http://localhost:5173'

/** The mailbox the monthly reminder comes from. It receives nothing. */
const MAIL_FROM_LOCAL = 'reminder'

/**
 * The return path SES puts on the message. A subdomain of the sending name is
 * used rather than the SES default. Because a) SPF is checked against this name
 * rather than against the address the reader sees. b) both then sit under a name
 * we control so DMARC finds them aligned. c) the records live in our own zone so
 * no other account publishes anything.
 */
const BOUNCE_SUBDOMAIN = 'bounce'

/**
 * When the reminder run starts. The run itself decides whose reminder is due so
 * this is only the hour it looks. One zone serves every location because a
 * message is read when the mailbox is opened rather than when it lands.
 */
const REMINDER_TIME_ZONE = 'Europe/Berlin'

/**
 * The Atlassian site the Jira reader talks to.
 *
 * A cloud id names one site and 4flow has one. It is not a secret. It appears
 * in every request path so hiding it would buy nothing.
 */
const JIRA_CLOUD_ID = '792ba525-6efc-4a5f-80f4-b9269516a256'

/**
 * Where a ticket is read by a person.
 *
 * The API host answers no browse address so the host a user opens is configured
 * rather than derived from the cloud id. It reaches the browser on the Jira link
 * state. Empty leaves every ticket id on the screen as plain text.
 */
const JIRA_SITE_URL = 'https://4flow.atlassian.net'

/**
 * The client id of the registered OAuth 2.0 app.
 *
 * Not a secret either. The browser puts it in the authorize URL. Empty leaves
 * every Jira route answering 404 which is how a deployment behaves before the
 * app exists. See `docs/todo-jira-option-a.md`.
 */
const JIRA_CLIENT_ID = 'wJiihW00HOrSowAzpyBcDjWOj7vUMAXz'

/**
 * The Jira fields searched for an hours figure. In order. The first that
 * answers wins.
 *
 * `worklog` and `timespent` are the two Jira holds itself and both are seconds.
 * Any other name is a custom field read as hours. Which fields carry effort at
 * 4flow is still being settled so this is one line to change rather than a code
 * change. See `docs/jira.md`.
 */
const JIRA_HOURS_FIELDS = 'worklog,timespent'
const REMINDER_HOUR = 7

/**
 * Identity Center sends these SAML attribute names. They are the claim URIs
 * rather than short names because the URI form is unambiguous across providers.
 */
const SAML_ATTRIBUTES = {
  email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  givenName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
  familyName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
}

export interface TrackerStackProps extends StackProps {
  /**
   * Prefix for the hosted Cognito sign in domain. Must be unique in the region.
   * A retained pool holds on to the prefix it was given so moving a pool needs
   * the old domain gone first.
   */
  cognitoDomainPrefix: string
  /**
   * The Identity Center metadata document for the timesheets application. The
   * SAML provider is created only once one of the two is supplied. Without them
   * the pool keeps its own sign in so the deployment stays usable while the
   * application is being created on the portal. Identity Center offers the
   * document as a download and as a URL. Prefer the URL because Cognito then
   * follows a certificate rotation on its own.
   */
  samlMetadataUrl?: string
  /** Path to the downloaded metadata document. Ignored when the URL is set. */
  samlMetadataFile?: string
  /**
   * The public name. Absent means the site answers on its CloudFront domain
   * alone. Supplied only once the certificate exists which is only once the
   * parent account has delegated. See `DnsStack`.
   */
  domain?: {
    /** The full host such as `tracker.example.com`. */
    name: string
    zone: route53.IPublicHostedZone
    /** Must live in us-east-1. CloudFront reads no other region. */
    certificate: acm.ICertificate
  }
  /**
   * Adds `http://localhost:5173` to the sign in callback list and to the API
   * CORS origins. Absent means it is left out. Never set it on a deployment that
   * real users sign in to. Because a) the app client is public so the token
   * endpoint hands the tokens to whoever presents the code. b) Cognito treats the
   * PKCE challenge as optional so an authorize URL crafted without one yields a
   * code that needs no verifier. c) the redirect is plain http on a port any
   * local process may bind. Local work needs none of it. `pnpm dev:api` serves
   * the API and the SPA then runs with sign in off.
   */
  allowLocalOrigin?: boolean
}

export class TrackerStack extends Stack {
  constructor(scope: Construct, id: string, props: TrackerStackProps) {
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

    // The access log of the distribution. Kept apart from the site so a reader
    // of one is never a reader of the other.
    //
    // Ownership is handed to the bucket owner rather than left with the writer.
    // Because a) CloudFront delivers a log as the log delivery account. b) that
    // account would otherwise own every object it wrote. c) an object we do not
    // own is one we cannot read without a grant from whoever does.
    const siteLogBucket = new s3.Bucket(this, 'SiteLogs', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      enforceSSL: true,
      // A log older than the retention of the API log answers nothing the API
      // log cannot. Expiry is what keeps a log bucket from growing for ever.
      lifecycleRules: [{ expiration: Duration.days(90) }],
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // The API origin the SPA is allowed to reach.
    //
    // A wildcard stands in until the name is delegated. Because a) the execute
    // API host is only known once the API exists. b) naming it here would make
    // the policy wait on the API which waits on this distribution for its CORS
    // origin. c) that is a cycle CloudFormation refuses. Once `apiHost` is real
    // the wildcard is gone and the single host is named.
    const apiHost = props.domain ? `api.${props.domain.name}` : undefined
    const apiConnectSrc = apiHost
      ? `https://${apiHost}`
      : `https://*.execute-api.${this.region}.amazonaws.com`
    const hostedUiOrigin = `https://${props.cognitoDomainPrefix}.auth.${this.region}.amazoncognito.com`

    // The built SPA carries no inline script and loads nothing off site so the
    // policy needs no hash and no nonce. `unsafe-inline` is present for style
    // alone. Because a) a `:style` binding writes a style attribute. b) a style
    // attribute is governed by `style-src`. c) Vue offers no nonce for one.
    const contentSecurityPolicy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self'",
      "font-src 'self'",
      // No Atlassian host belongs here. The consent redirect is a top level
      // navigation which `connect-src` does not govern and every call to Jira
      // is made by the Jira function. Option B of `docs/jira.md` is the one
      // that would need `api.atlassian.com` and it was not built.
      `connect-src 'self' ${hostedUiOrigin} ${apiConnectSrc}`,
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')

    const siteHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SiteHeaders', {
      comment: 'Tracker SPA. Security headers and content security policy.',
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy, override: true },
        // Stops a browser guessing a type the bucket already stated.
        contentTypeOptions: { override: true },
        // `frame-ancestors` above says the same thing to a browser that reads a
        // policy. This serves the one that does not.
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        // Two years. Subdomains are included and preload is not asked for.
        // Because a) preload is a list an entry is hard to leave. b) it pins the
        // name in a browser that has never once reached it. c) the header alone
        // protects every visit after the first.
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(730),
          includeSubdomains: true,
          override: true,
        },
      },
      // The bucket names itself in a header no client needs.
      removeHeaders: ['server'],
    })

    const distribution = new cloudfront.Distribution(this, 'Site', {
      ...(props.domain
        ? { domainNames: [props.domain.name], certificate: props.domain.certificate }
        : {}),
      defaultRootObject: 'index.html',
      // Europe and North America. The users are in Europe so the rest of the
      // estate is paid for and never reached.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableLogging: true,
      logBucket: siteLogBucket,
      logFilePrefix: 'cloudfront/',
      // A cookie is never set on this distribution so there is none to log.
      logIncludesCookies: false,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: siteHeaders,
      },
      // The SPA routes on the client so a deep link must still serve the shell.
      // The callback path has no object behind it either.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    })

    // Both names answer. The custom one is canonical and the CloudFront one is
    // kept so a deployment can be checked before the name is switched over.
    const distributionUrl = `https://${distribution.distributionDomainName}`
    const siteUrl = props.domain ? `https://${props.domain.name}` : distributionUrl
    const local = props.allowLocalOrigin ? [LOCAL_ORIGIN] : []
    const origins_ = [...new Set([siteUrl, distributionUrl, ...local])]

    if (props.domain) {
      // No record name. The host is the apex of its own zone.
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution))
      new route53.ARecord(this, 'SiteRecord', { zone: props.domain.zone, target })
      new route53.AaaaRecord(this, 'SiteRecordV6', { zone: props.domain.zone, target })
    }

    /* ---------- identity ---------- */

    // The schema below may only be set while the pool is being created. Cognito
    // refuses an update that carries a schema at all and calls it
    // `Invalid AttributeDataType input` which names the wrong thing. A change
    // set reports the same edit as an in place update so the refusal appears
    // only at deploy time. Change the construct id to move a pool. Never edit
    // the schema of one that exists.
    const userPool = new cognito.UserPool(this, 'Pool', {
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

    const metadata = props.samlMetadataUrl
      ? cognito.UserPoolIdentityProviderSamlMetadata.url(props.samlMetadataUrl)
      : props.samlMetadataFile
        ? cognito.UserPoolIdentityProviderSamlMetadata.file(
            readFileSync(props.samlMetadataFile, 'utf8'),
          )
        : undefined
    const federated = metadata !== undefined

    const provider = metadata
      ? new cognito.UserPoolIdentityProviderSaml(this, 'IdentityCenter', {
          userPool,
          name: SAML_PROVIDER,
          metadata,
          // Signing out of the app ends the Identity Center session too.
          idpSignout: true,
          attributeMapping: {
            email: cognito.ProviderAttribute.other(SAML_ATTRIBUTES.email),
            givenName: cognito.ProviderAttribute.other(SAML_ATTRIBUTES.givenName),
            familyName: cognito.ProviderAttribute.other(SAML_ATTRIBUTES.familyName),
          },
        })
      : undefined

    const client = userPool.addClient('WebClient', {
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

    // A federated user holds no password so no password flow is allowed. The
    // property is set through the escape hatch. Because a) `authFlows` offers no
    // switch for the refresh grant. b) leaving it empty drops the property. c) a
    // dropped property falls back to a Cognito default that allows SRP again.
    if (federated) {
      const cfnClient = client.node.defaultChild as cognito.CfnUserPoolClient
      cfnClient.explicitAuthFlows = ['ALLOW_REFRESH_TOKEN_AUTH']
    }

    const domain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: props.cognitoDomainPrefix },
    })

    /* ---------- the api name ---------- */

    // An HTTP API is regional so its certificate must live in this region. The
    // distribution needs one in us-east-1. That is why there are two and why
    // this one is not the one passed in.
    //
    // `apiHost` is declared with the site above because the content security
    // policy names it.
    const apiDomain =
      props.domain && apiHost
        ? new apigw.DomainName(this, 'ApiDomain', {
            domainName: apiHost,
            certificate: new acm.Certificate(this, 'ApiCertificate', {
              domainName: apiHost,
              validation: acm.CertificateValidation.fromDns(props.domain.zone),
            }),
          })
        : undefined

    /* ---------- api ---------- */

    // The bundle is built by `pnpm --filter @tracker/api bundle` rather than
    // during synth. Because a) the esbuild binary shim is not runnable under
    // pnpm. b) an explicit artefact is reproducible. c) synth then needs no
    // toolchain of its own.
    for (const file of ['api-lambda.mjs', 'jira-lambda.mjs', 'reminder-lambda.mjs']) {
      if (!existsSync(join(API_BUNDLE, file))) {
        throw new Error('run `pnpm --filter @tracker/api bundle` before synth')
      }
    }

    const handler = new lambda.Function(this, 'ApiFunction', {
      code: lambda.Code.fromAsset(API_BUNDLE),
      handler: 'api-lambda.main',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      // Benchmarked rather than guessed. A sweep of the catalogue route from
      // 256 MB to 2048 MB put the warm median at 447 ms and 204 ms and 132 ms
      // and 85 ms and 65 ms and 57 ms and 77 ms. The cost of a million calls
      // was lowest here at 1.15 dollars against 1.36 at 512 MB. Because a) the
      // share of a vCPU a function gets is its memory over 1769 MB. b) the work
      // is JSON and gzip which is one thread of pure CPU. c) the run never used
      // more than 166 MB so this buys processor rather than room.
      memorySize: 1024,
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
      ...(apiDomain ? { defaultDomainMapping: { domainName: apiDomain } } : {}),
      corsPreflight: {
        allowHeaders: ['content-type', 'authorization'],
        // The export names the workbook in `content-disposition`. A browser
        // hides every response header outside the CORS safelist until the API
        // names it here. Without this the download is named by the fallback in
        // the API client rather than by the API. The development server exposes
        // the same header so the two behave alike.
        exposeHeaders: ['content-disposition'],
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.PUT,
          apigw.CorsHttpMethod.POST,
          // Unlinking a Jira consent is the one thing this API deletes.
          apigw.CorsHttpMethod.DELETE,
          apigw.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: origins_,
      },
    })

    // The access log of the API. Separate from the function log so a request
    // that never reached the function is still recorded.
    //
    // `sub` names the caller and the email address is left out. Because a) the
    // pool identifier is stable so it answers who called. b) an address in a log
    // is personal data held for no purpose the identifier does not serve. c) the
    // pool maps one to the other when an investigation needs it.
    const apiAccessLogs = new logs.LogGroup(this, 'ApiAccessLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    // The L2 exposes neither setting so both are reached through the escape
    // hatch. An explicit throw is kept because the cast would otherwise turn a
    // missing stage into a TypeError naming nothing.
    //
    // An HTTP API needs no account level logging role where a REST API does.
    // CloudWatch writes the delivery grant itself and the deploying role needs
    // `logs:PutResourcePolicy` and `logs:CreateLogDelivery` for it to do so. A
    // scoped down execution role without them fails here naming CloudWatch
    // rather than naming the API.
    const stage = api.defaultStage?.node.defaultChild as apigw.CfnStage | undefined
    if (!stage) throw new Error('the HTTP API has no default stage to log or throttle')

    stage.accessLogSettings = {
      // The ARN carries no `:*` suffix. That is the form the HTTP API
      // documentation gives and it is not the form `logGroupArn` returns.
      destinationArn: this.formatArn({
        service: 'logs',
        resource: 'log-group',
        resourceName: apiAccessLogs.logGroupName,
        arnFormat: ArnFormat.COLON_RESOURCE_NAME,
      }),
      format: JSON.stringify({
        requestId: '$context.requestId',
        requestTime: '$context.requestTime',
        sourceIp: '$context.identity.sourceIp',
        httpMethod: '$context.httpMethod',
        routeKey: '$context.routeKey',
        path: '$context.path',
        status: '$context.status',
        responseLength: '$context.responseLength',
        responseLatency: '$context.responseLatency',
        integrationStatus: '$context.integrationStatus',
        integrationLatency: '$context.integrationLatency',
        errorMessage: '$context.error.message',
        authorizerError: '$context.authorizer.error',
        caller: '$context.authorizer.claims.sub',
      }),
    }

    // A ceiling on every route. The account default of ten thousand a second is
    // what an unthrottled stage inherits.
    //
    // This is a bound on a runaway rather than a cost control. Because a) the
    // budgets in `TrackerCost` are what watch the spend. b) a few hundred people
    // filing a timesheet never approach fifty a second. c) a limit low enough to
    // cap the bill would throttle a month end.
    //
    // Detailed metrics are off. Per route metrics are billed for each dimension
    // and four routes would take a tenth of the monthly budget.
    stage.defaultRouteSettings = {
      throttlingRateLimit: 50,
      throttlingBurstLimit: 100,
    }

    // The authorizer verifies the Cognito token before the function runs so the
    // handler can trust every claim it reads. The audience is the client so a
    // token minted for another app in the pool is refused.
    const authorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [client.userPoolClientId] },
    )

    const integration = new HttpLambdaIntegration('ApiIntegration', handler)

    // OPTIONS is absent on purpose and `ANY` must never come back. Because a)
    // `ANY` matches the browser preflight. b) the preflight then reaches the
    // authorizer carrying no token because a browser never puts one on it. c)
    // the refusal is a 401 which fails the preflight so the real request is
    // never sent. With no route matching OPTIONS the API answers the preflight
    // itself from the CORS configuration above.
    api.addRoutes({
      path: '/api/{proxy+}',
      methods: [apigw.HttpMethod.GET, apigw.HttpMethod.PUT, apigw.HttpMethod.POST],
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

    /* ---------- the Jira reader ---------- */

    // A function of its own rather than a route on the API. Because a) it is
    // the only one that reads the client secret. b) it is the only one that
    // uses the key a refresh token is encrypted with. c) the API role then
    // gains neither. That is the same rule the reminder follows about
    // permission to send mail. See `docs/jira.md`.

    // Filled by hand. Because a secret written by CDK sits in the template and
    // in every CloudFormation event.
    //
    // CDK does not leave it empty. A secret given no value of its own is
    // created with `GenerateSecretString` so it holds a random password until
    // somebody overwrites it. That value reads as a filled secret. Atlassian
    // answers it with `access_denied` and the screen then blames the consent.
    // `docs/jira.md` says how to tell.
    const jiraSecret = new secrets.Secret(this, 'JiraSecret', {
      secretName: 'tracker/jira',
      description: 'The client secret of the Tracker OAuth 2.0 app. Filled by hand.',
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // A refresh token is encrypted with this before it is written rather than
    // being left to the encryption the table already has. Because a table
    // export or a restored snapshot would otherwise carry a usable credential.
    const jiraKey = new kms.Key(this, 'JiraKey', {
      description: 'Encrypts the Jira refresh token of each user.',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    const jiraHandler = new lambda.Function(this, 'JiraFunction', {
      code: lambda.Code.fromAsset(API_BUNDLE),
      handler: 'jira-lambda.jira',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      // It holds no catalogue and writes no workbook so it needs less than the
      // API function. It is not as cheap as 256 MB looked. Because a) a month
      // of production put the ninety fifth percentile at 1851 ms and the worst
      // call at 6901 ms against a twenty second timeout. b) the same sweep that
      // sized the API function had 256 MB running the identical work 2.2 times
      // slower than 512 MB. c) a KMS decrypt and a TLS handshake and the parse
      // of a search result are all processor.
      memorySize: 512,
      // Shorter than the API function. It waits on Atlassian rather than on a
      // browser and a month of one user is one search.
      timeout: Duration.seconds(20),
      environment: {
        TABLE_NAME: table.tableName,
        JIRA_CLIENT_ID,
        JIRA_CLOUD_ID,
        JIRA_SITE_URL,
        JIRA_SECRET_ARN: jiraSecret.secretArn,
        JIRA_KEY_ARN: jiraKey.keyArn,
        JIRA_HOURS_FIELDS,
        SITE_URL: siteUrl,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, 'JiraLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    })

    table.grantReadWriteData(jiraHandler)
    jiraSecret.grantRead(jiraHandler)
    jiraKey.grantEncryptDecrypt(jiraHandler)

    // The path wins over `/api/{proxy+}` so the API function never sees these.
    // DELETE is here and on no other route.
    api.addRoutes({
      path: '/api/jira/{proxy+}',
      methods: [
        apigw.HttpMethod.GET,
        apigw.HttpMethod.POST,
        apigw.HttpMethod.DELETE,
      ],
      integration: new HttpLambdaIntegration('JiraIntegration', jiraHandler),
      authorizer,
    })

    if (props.domain && apiDomain) {
      const target = route53.RecordTarget.fromAlias(
        new targets.ApiGatewayv2DomainProperties(
          apiDomain.regionalDomainName,
          apiDomain.regionalHostedZoneId,
        ),
      )
      new route53.ARecord(this, 'ApiRecord', {
        zone: props.domain.zone,
        recordName: 'api',
        target,
      })
      new route53.AaaaRecord(this, 'ApiRecordV6', {
        zone: props.domain.zone,
        recordName: 'api',
        target,
      })
    }

    /* ---------- the monthly reminder ---------- */

    // Nothing is sent until the name is delegated. Because a) SES proves the
    // domain over public DNS. b) the records are written into the zone this
    // stack is handed. c) a zone nobody can resolve leaves the identity pending
    // for ever. See `docs/mail.md`.
    let mailFrom: string | undefined
    if (props.domain) {
      mailFrom = `${MAIL_FROM_LOCAL}@${props.domain.name}`

      // A bounced or complained address is added to the account suppression
      // list so it is never written to again. A rising bounce rate is what stops
      // an account from sending at all.
      const configurationSet = new ses.ConfigurationSet(this, 'MailEvents', {
        reputationMetrics: true,
        suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
      })

      // Creating the identity from the zone is what writes the three DKIM
      // records. They are never handled by hand.
      const identity = new ses.EmailIdentity(this, 'MailIdentity', {
        identity: ses.Identity.publicHostedZone(props.domain.zone),
        mailFromDomain: `${BOUNCE_SUBDOMAIN}.${props.domain.name}`,
        configurationSet,
      })

      // Both are named. SES checks the identity and the configuration set
      // separately so a policy naming only the identity is refused.
      const mailTargets = [
        identity.emailIdentityArn,
        `arn:${this.partition}:ses:${this.region}:${this.account}:configuration-set/${configurationSet.configurationSetName}`,
      ]

      // The delivery route sends a finished workbook to the mailbox of whoever
      // pressed the button. It shares the identity and the configuration set
      // with the reminder so one bounce suppresses the address for both.
      handler.addEnvironment('MAIL_FROM', mailFrom)
      handler.addEnvironment('MAIL_CONFIGURATION_SET', configurationSet.configurationSetName)
      handler.addToRolePolicy(
        new iam.PolicyStatement({ actions: ['ses:SendEmail'], resources: mailTargets }),
      )

      // Published as `none` and changed to `reject` once a message has been
      // seen to arrive. A policy of `reject` set before DKIM is proven drops
      // every message silently.
      new route53.TxtRecord(this, 'DmarcRecord', {
        zone: props.domain.zone,
        recordName: '_dmarc',
        values: ['v=DMARC1; p=none;'],
      })

      // The Jira values are handed to the reminder as well so the message can
      // name how many tickets were closed. It is the one cost of that. Two
      // roles then hold the client secret rather than one.
      const reminder = new lambda.Function(this, 'ReminderFunction', {
        code: lambda.Code.fromAsset(API_BUNDLE),
        handler: 'reminder-lambda.reminder',
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        // Left where it was. A month of production shows the run finishing in
        // under a second on 148 MB so there is nothing here to buy.
        memorySize: 512,
        // The whole pool is read and one message goes out per person due today.
        timeout: Duration.minutes(5),
        environment: {
          TABLE_NAME: table.tableName,
          USER_POOL_ID: userPool.userPoolId,
          MAIL_FROM: mailFrom,
          MAIL_CONFIGURATION_SET: configurationSet.configurationSetName,
          SITE_URL: siteUrl,
          REMINDER_TIME_ZONE,
          JIRA_CLIENT_ID,
          JIRA_CLOUD_ID,
          JIRA_SECRET_ARN: jiraSecret.secretArn,
          JIRA_KEY_ARN: jiraKey.keyArn,
          JIRA_HOURS_FIELDS,
          NODE_OPTIONS: '--enable-source-maps',
        },
        logGroup: new logs.LogGroup(this, 'ReminderLogs', {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      })

      table.grantReadWriteData(reminder)
      // Reading a link spends its refresh token so the write side is needed
      // here as well as the read.
      jiraSecret.grantRead(reminder)
      jiraKey.grantEncryptDecrypt(reminder)
      // The roster comes from the pool rather than the table. Somebody who
      // signed in once and saved nothing is exactly who is being reminded.
      userPool.grant(reminder, 'cognito-idp:ListUsers')
      reminder.addToRolePolicy(
        new iam.PolicyStatement({ actions: ['ses:SendEmail'], resources: mailTargets }),
      )

      // Daily rather than monthly. The function decides whose day it is because
      // the answer moves with the bank holidays of each location.
      //
      // Scheduler rather than an EventBridge rule. A rule reads UTC alone so the
      // hour would move twice a year.
      new scheduler.Schedule(this, 'ReminderSchedule', {
        schedule: scheduler.ScheduleExpression.cron({
          minute: '0',
          hour: String(REMINDER_HOUR),
          day: '*',
          month: '*',
          year: '*',
          timeZone: TimeZone.of(REMINDER_TIME_ZONE),
        }),
        target: new schedulerTargets.LambdaInvoke(reminder, {
          // A run that has not started within the morning is not worth starting.
          // The day it would name has almost passed.
          maxEventAge: Duration.hours(2),
          retryAttempts: 3,
        }),
        description: 'Runs every morning. The function decides whose reminder is due.',
      })

      // Named here rather than with the rest below because it exists only once
      // the domain does. `docs/mail.md` reads it to invoke the run by hand.
      new CfnOutput(this, 'ReminderFunctionName', { value: reminder.functionName })
    }

    /* ---------- what the operator needs ---------- */

    // Each name is published once. A second output holding the same value tells
    // a reader the two differ when they do not.
    //
    // The two below are the canonical names. `ApiUrl` is what the SPA is built
    // against and `SiteUrl` is where a person is sent.
    new CfnOutput(this, 'ApiUrl', { value: apiHost ? `https://${apiHost}` : api.apiEndpoint })
    new CfnOutput(this, 'SiteUrl', { value: siteUrl })

    // The generated names. Published only while a custom one is also in use so
    // a deployment can be checked before the name is switched over. Without a
    // custom name these are the canonical ones already.
    if (props.domain) {
      new CfnOutput(this, 'ApiExecuteUrl', {
        value: api.apiEndpoint,
        description: 'The execute-api name. `ApiUrl` is the one to use.',
      })
      new CfnOutput(this, 'DistributionUrl', {
        value: distributionUrl,
        description: 'The CloudFront name. `SiteUrl` is the one to use.',
      })
    }

    new CfnOutput(this, 'SiteBucketName', { value: siteBucket.bucketName })
    new CfnOutput(this, 'SiteLogBucketName', { value: siteLogBucket.bucketName })
    new CfnOutput(this, 'ApiAccessLogGroup', { value: apiAccessLogs.logGroupName })
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
      value: `${hostedUiOrigin}/saml2/idpresponse`,
      description: 'Application ACS URL for the Identity Center application',
    })
    new CfnOutput(this, 'SamlProviderName', { value: federated ? SAML_PROVIDER : 'none' })
    new CfnOutput(this, 'MailFrom', { value: mailFrom ?? 'none until the name is delegated' })
  }
}
