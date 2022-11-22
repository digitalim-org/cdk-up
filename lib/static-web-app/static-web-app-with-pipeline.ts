import StaticWebApp, { StaticWebAppProps } from "./static-web-app";
import { StaticWebAppPipelineProps, StaticWebAppPipeline } from "../pipeline";
import { Construct } from "constructs";
import { Stack } from "aws-cdk-lib";
import { Distribution } from "aws-cdk-lib/aws-cloudfront";
import { Bucket } from "aws-cdk-lib/aws-s3";

type StaticWebAppWithPipelineProps = StaticWebAppProps &
  Omit<StaticWebAppPipelineProps, keyof StaticWebApp>;

export default class StaticWebAppWithPipeline extends Construct {
  public readonly webDistribution: Distribution;
  public readonly deploymentBucket: Bucket;

  constructor(
    scope: Stack,
    id: string,
    {
      domainName,
      dns,
      wwwAlias,
      certificate,
      ...pipelineProps
    }: StaticWebAppWithPipelineProps
  ) {
    super(scope, id);

    const { webDistribution, deploymentBucket } = new StaticWebApp(
      scope,
      "StaticWebApp",
      { domainName, dns, wwwAlias, certificate } as StaticWebAppProps
    );

    new StaticWebAppPipeline(scope, "Pipeline", {
      ...(pipelineProps as StaticWebAppPipelineProps),
      webDistribution,
      deploymentBucket,
    });

    Object.assign(this, { webDistribution, deploymentBucket });
  }
}
