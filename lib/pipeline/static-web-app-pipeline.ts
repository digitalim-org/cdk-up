import { App, RemovalPolicy, SecretValue, Stack } from "aws-cdk-lib";
import {
  Artifact,
  Pipeline as CodePipeline,
} from "aws-cdk-lib/aws-codepipeline";
import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Distribution } from "aws-cdk-lib/aws-cloudfront";
import { SlackChannelConfiguration } from "aws-cdk-lib/aws-chatbot";
import { Topic } from "aws-cdk-lib/aws-sns";
import {
  CodeBuildAction,
  S3DeployAction,
} from "aws-cdk-lib/aws-codepipeline-actions";
import {
  BuildEnvironment,
  BuildSpec,
  LinuxBuildImage,
  PipelineProject,
} from "aws-cdk-lib/aws-codebuild";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as fs from "fs";
import githubSourceStage, {
  GithubSourceStageProps,
} from "./github-source-stage";

const yaml = require("js-yaml");

export type StaticWebAppPipelineProps = {
  deploymentBucket: Bucket;
  webDistribution: Distribution;
  pipelineName?: string;
  build?: {
    environmentVariables: BuildEnvironment["environmentVariables"];
  };
  slack?: {
    topicName?: string;
    channelConfigurationName: string;
    workspaceId: string;
    channelId: string;
  };
} & { githubRepo: GithubSourceStageProps };

export default class Pipeline extends Construct {
  constructor(
    scope: App | Stack,
    id: string,
    {
      deploymentBucket,
      webDistribution,
      pipelineName,
      githubRepo,
      build,
      slack,
    }: StaticWebAppPipelineProps
  ) {
    super(scope, id);

    const sourceRepoArtifact = new Artifact();
    const deploymentArtifact = new Artifact();

    const artifactBucket = new Bucket(this, "S3ArtifactBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const invalidateCacheCodeBuild = new PipelineProject(
      scope,
      `InvalidateCacheProject`,
      {
        buildSpec: BuildSpec.fromObject({
          version: "0.2",
          phases: {
            build: {
              commands: [
                // eslint-disable-next-line no-template-curly-in-string
                'aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_ID} --paths "/*"',
              ],
            },
          },
        }),
        environmentVariables: {
          CLOUDFRONT_ID: { value: webDistribution.distributionId },
        },
      }
    );

    // Add Cloudfront invalidation permissions to the project
    const distributionArn = `arn:aws:cloudfront::${scope.account}:distribution/${webDistribution.distributionId}`;

    invalidateCacheCodeBuild.addToRolePolicy(
      new PolicyStatement({
        resources: [distributionArn],
        actions: ["cloudfront:CreateInvalidation"],
      })
    );

    const pipeline = new CodePipeline(this, "CodePipeline", {
      // This prevents unnecessary KMS keys from being created.
      crossAccountKeys: false,
      pipelineName,
      restartExecutionOnUpdate: true,
      artifactBucket,
      stages: [
        githubSourceStage({ ...githubRepo, sourceRepoArtifact }),
        {
          stageName: "Build",
          actions: [
            new CodeBuildAction({
              actionName: "CodeBuild",
              input: sourceRepoArtifact,
              project: new PipelineProject(scope, "CodeBuild", {
                environment: {
                  buildImage: LinuxBuildImage.AMAZON_LINUX_2_4,
                  environmentVariables: build?.environmentVariables || {
                    ENV: {
                      value: "PROD",
                    },
                  },
                },
                buildSpec: BuildSpec.fromObjectToYaml(
                  yaml.load(
                    fs.readFileSync(
                      path.join(__dirname, "static-web-app.buildspec.yml"),
                      {
                        encoding: "utf-8",
                      }
                    )
                  )
                ),
              }),
              outputs: [deploymentArtifact],
            }),
          ],
        },
        {
          stageName: "Deploy",
          actions: [
            new S3DeployAction({
              actionName: "S3Deploy",
              input: deploymentArtifact,
              bucket: deploymentBucket,
            }),
          ],
        },
        {
          stageName: "Invalidate_Cache",
          actions: [
            new CodeBuildAction({
              actionName: "InvalidateCache",
              input: deploymentArtifact,
              project: invalidateCacheCodeBuild,
            }),
          ],
        },
      ],
    });

    if (slack) {
      const { channelConfigurationName, topicName, channelId, workspaceId } =
        slack;

      const slackTopic = new Topic(this, "PipelineTopic", {
        topicName: topicName || channelConfigurationName,
      });

      const slackTarget = new SlackChannelConfiguration(this, "SlackChannel", {
        slackChannelConfigurationName: channelConfigurationName,
        slackWorkspaceId: workspaceId,
        slackChannelId: channelId,
        notificationTopics: [slackTopic],
      });

      pipeline.notifyOnExecutionStateChange(
        "NotifyOnAnyStageStateChange",
        slackTarget
      );
    }
  }
}
