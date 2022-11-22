import { join as pathJoin } from "path";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Bucket } from "aws-cdk-lib/aws-s3";
import {
  Distribution,
  Function,
  FunctionCode,
  FunctionEventType,
  LambdaEdgeEventType,
  OriginAccessIdentity,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { Construct } from "constructs";
import { RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  Certificate,
  ICertificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import {
  AaaaRecord,
  ARecord,
  HostedZone,
  IHostedZone,
  RecordTarget,
} from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { BucketDeployment } from "aws-cdk-lib/aws-s3-deployment";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export enum DnsRegistrar {
  AWS,
  EXTERNAL,
}

interface StaticWebAppProps_Base {
  domainName: string;
  wwwAlias?: boolean;
}

interface WithAWSRegistrarProps {
  dns: {
    registrar: DnsRegistrar.AWS;
  };
  certificate?: ICertificate;
}

interface WithExternalRegistrarProps {
  dns: {
    registrar: DnsRegistrar.EXTERNAL;
  };
  certificate: ICertificate;
}

export type StaticWebAppProps = StaticWebAppProps_Base &
  (WithAWSRegistrarProps | WithExternalRegistrarProps);

export default class StaticWebApp extends Construct {
  public readonly webDistribution: Distribution;
  public readonly deploymentBucket: Bucket;

  constructor(
    scope: Stack,
    id: string,
    { domainName, wwwAlias = true, dns, certificate }: StaticWebAppProps
  ) {
    super(scope, id);

    let hostedZone: IHostedZone;

    if (dns.registrar === DnsRegistrar.AWS) {
      hostedZone = HostedZone.fromLookup(this, "HostedZone", {
        domainName,
      });

      certificate =
        certificate ||
        new Certificate(this, "Certificate", {
          domainName,
          validation: CertificateValidation.fromDns(hostedZone),
          ...(wwwAlias && { subjectAlternativeNames: [`www.${domainName}`] }),
        });
    }

    const deploymentBucket = new Bucket(this, "S3DeploymentBucket", {
      versioned: false,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const originAccessIdentity = new OriginAccessIdentity(
      this,
      "CloudFrontDistributionOriginAccessIdentity"
    );

    const viewerRequestFunction = new Function(this, "viewer-request", {
      code: FunctionCode.fromFile({
        filePath: pathJoin(__dirname, "cloudfront-function.viewer-request.js"),
      }),
    });

    const viewerResponseFunction = new NodejsFunction(this, "origin-response");

    const webDistribution = new Distribution(this, "CloudFrontDistribution", {
      defaultBehavior: {
        origin: new S3Origin(deploymentBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        edgeLambdas: [
          {
            eventType: LambdaEdgeEventType.ORIGIN_RESPONSE,
            functionVersion: viewerResponseFunction.currentVersion,
          },
        ],
        functionAssociations: [
          {
            eventType: FunctionEventType.VIEWER_REQUEST,
            function: viewerRequestFunction,
          },
        ],
      },
      defaultRootObject: "index.html",
      priceClass: PriceClass.PRICE_CLASS_ALL,
      // domainNames: [domainName],
      // certificate,
      enableLogging: true,
    });

    dns.registrar === DnsRegistrar.AWS &&
      (
        [
          [ARecord, domainName],
          [AaaaRecord, domainName],
          ...(wwwAlias
            ? [
                [ARecord, `www.${domainName}`],
                [AaaaRecord, `www.${domainName}`],
              ]
            : []),
        ] as [typeof ARecord | typeof AaaaRecord, string][]
      ).forEach(([RecordType, recordName]) => {
        const isWww = recordName.startsWith("www");
        new RecordType(this, `${RecordType.name}${isWww ? "WWW" : ""}`, {
          target: RecordTarget.fromAlias(new CloudFrontTarget(webDistribution)),
          recordName,
          zone: hostedZone,
        });
      });

    Object.assign(this, {
      webDistribution,
      deploymentBucket,
    });
  }
}
