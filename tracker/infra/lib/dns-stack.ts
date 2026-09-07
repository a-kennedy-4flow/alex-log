// The public name.
//
// Route 53 is global so the region of this stack does not matter to the zone.
// It matters to the certificate. CloudFront reads a certificate only from
// us-east-1 so this stack is pinned there and the site stack reads across.

import { CfnOutput, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as route53 from 'aws-cdk-lib/aws-route53'
import type { Construct } from 'constructs'

export interface DnsStackProps extends StackProps {
  /** The full host such as `tracker.example.com`. */
  domainName: string
  /**
   * Whether the parent zone already points at this one. The certificate is
   * created only once it does. Because ACM proves ownership over public DNS and
   * a validation record that nobody can resolve leaves CloudFormation waiting
   * for hours before it gives up.
   */
  delegated: boolean
}

export class DnsStack extends Stack {
  /** The zone this account controls. The parent zone delegates to it. */
  readonly zone: route53.PublicHostedZone
  /** Absent until the delegation is live. */
  readonly certificate?: acm.Certificate

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props)

    // Retained because deleting a zone issues new name servers and the parent
    // account would have to be asked for the delegation a second time.
    this.zone = new route53.PublicHostedZone(this, 'Zone', { zoneName: props.domainName })
    this.zone.applyRemovalPolicy(RemovalPolicy.RETAIN)

    if (props.delegated) {
      this.certificate = new acm.Certificate(this, 'Certificate', {
        domainName: props.domainName,
        validation: acm.CertificateValidation.fromDns(this.zone),
      })
      new CfnOutput(this, 'CertificateArn', { value: this.certificate.certificateArn })
    }

    new CfnOutput(this, 'ZoneName', { value: this.zone.zoneName })
    new CfnOutput(this, 'ZoneId', { value: this.zone.hostedZoneId })
    // What the other account is asked to publish.
    new CfnOutput(this, 'NameServers', {
      value: Fn.join(' ', this.zone.hostedZoneNameServers ?? []),
      description: 'Give these to the account holding the parent domain',
    })
    new CfnOutput(this, 'Delegated', { value: props.delegated ? 'yes' : 'not yet' })
  }
}
