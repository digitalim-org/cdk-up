import {S3Origin} from "aws-cdk-lib/aws-cloudfront-origins";
import {Bucket} from "aws-cdk-lib/aws-s3";
import {
    Distribution,
    OriginAccessIdentity,
    PriceClass,
    ViewerProtocolPolicy
} from "aws-cdk-lib/aws-cloudfront";
import {Construct} from "constructs";
import {RemovalPolicy} from "aws-cdk-lib";
import {Certificate, CertificateValidation} from "aws-cdk-lib/aws-certificatemanager";
import {AaaaRecord, ARecord, HostedZone, RecordTarget} from "aws-cdk-lib/aws-route53";
import {CloudFrontTarget} from "aws-cdk-lib/aws-route53-targets";

export interface StaticWebAppProps {
    domainName: string
}

export default class StaticWebApp extends Construct {
    public readonly webDistribution: Distribution
    public readonly deploymentBucket: Bucket

    constructor(scope: Construct, id: string, {domainName}: StaticWebAppProps) {
        super(scope, id);

        const hostedZone = new HostedZone(this, 'HostedZone', {
            zoneName: domainName,
        })

        const certificate = new Certificate(this, 'Certificate', {
            domainName,
            subjectAlternativeNames: [`www.${domainName}`],
            validation: CertificateValidation.fromDns(hostedZone)
        })

        const deploymentBucket = new Bucket(
            this,
            'S3DeploymentBucket',
            {
                versioned: true,
                removalPolicy: RemovalPolicy.DESTROY,
                autoDeleteObjects: true
            }
        );

        const originAccessIdentity = new OriginAccessIdentity(
            this,
            'CloudFrontDistributionOriginAccessIdentity'
        )

        const webDistribution = new Distribution(
            this,
            'CloudFrontDistribution',
            {
                defaultBehavior: {
                    origin: new S3Origin(deploymentBucket, {
                        originAccessIdentity
                    }),
                    viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
                },
                defaultRootObject: "index.html",
                priceClass: PriceClass.PRICE_CLASS_100,
                domainNames: [domainName],
                certificate,
            }
        );

        ([
            [ARecord, domainName],
            [ARecord, `www.${domainName}`],
            [AaaaRecord, domainName],
            [AaaaRecord, `www.${domainName}`]
        ] as [typeof ARecord | typeof AaaaRecord, string][]).forEach(([RecordType, recordName]) => {
            new RecordType(this, RecordType.name, {
                target: RecordTarget.fromAlias(new CloudFrontTarget(webDistribution)),
                recordName,
                zone: hostedZone,
            });
        })

        Object.assign(this, {
            webDistribution,
            deploymentBucket
        })
    }
}
