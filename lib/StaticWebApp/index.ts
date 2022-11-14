import StaticWebApp, { StaticWebAppProps } from "./static-web-app";
import Pipeline, { PipelineProps } from "../Pipeline";
import { Construct } from "constructs";
import { Stack } from "aws-cdk-lib";

type StaticWebAppWithPipelineProps = StaticWebAppProps &
  (
    | ({ withPipeline: true } & Omit<PipelineProps, keyof StaticWebApp>)
    | { withPipeline: false }
  );

export default class StaticWebAppWithPipeline extends Construct {
  constructor(
    scope: Stack,
    id: string,
    {
      domainName,
      dns,
      wwwAlias,
      certificate,
      withPipeline,
      ...pipelineProps
    }: StaticWebAppWithPipelineProps
  ) {
    super(scope, id);

    const { webDistribution, deploymentBucket } = new StaticWebApp(
      scope,
      "StaticWebApp",
      { domainName, dns, wwwAlias, certificate } as StaticWebAppProps
    );

    if (withPipeline === true) {
      new Pipeline(scope, "Pipeline", {
        ...(pipelineProps as PipelineProps),
        webDistribution,
        deploymentBucket,
      });
    }
  }
}
