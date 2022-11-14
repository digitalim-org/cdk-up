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
  GitHubSourceAction,
  S3DeployAction,
  GitHubSourceActionProps,
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

const yaml = require("js-yaml");

export type PipelineProps = {
  deploymentBucket: Bucket;
  webDistribution: Distribution;
  pipelineName?: string;
  githubRepo: {
    /**
     * The GitHub account/user that owns the repo.
     */
    owner: string;
    /**
     * The name of the repo, without the username.
     */
    name: string;
    /**
     * A GitHub OAuth token to use for authentication.
     *
     * It is recommended to use a Secrets Manager `Secret` to obtain the token:
     *
     *   const oauth = cdk.SecretValue.secretsManager('my-github-token');
     *   new GitHubSource(this, 'GitHubAction', { oauthToken: oauth, ... });
     *
     * If you rotate the value in the Secret, you must also change at least one property
     * of the CodePipeline to force CloudFormation to re-read the secret.
     *
     * The GitHub Personal Access Token should have these scopes:
     *
     * * **repo** - to read the repository
     * * **admin:repo_hook** - if you plan to use webhooks (true by default)
     *
     * @see https://docs.aws.amazon.com/codepipeline/latest/userguide/appendix-github-oauth.html#GitHub-create-personal-token-CLI
     */
    oauthToken: SecretValue;
    /**
     * The branch to configure the webhook on.
     */
    branch: string;
  };
  build?: {
    environmentVariables: BuildEnvironment["environmentVariables"];
  };
  slack?: {
    topicName?: string;
    channelConfigurationName: string;
    workspaceId: string;
    channelId: string;
  };
};

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
    }: PipelineProps
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
                'aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_ID} --paths "/index.html"',
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
        {
          stageName: "Source",
          actions: [
            new GitHubSourceAction({
              actionName: "GitHubSource",
              owner: githubRepo.owner,
              repo: githubRepo.name,
              oauthToken: githubRepo.oauthToken,
              output: sourceRepoArtifact,
              branch: githubRepo.branch,
            }),
          ],
        },
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
                    fs.readFileSync(path.join(__dirname, "buildspec.yml"), {
                      encoding: "utf-8",
                    })
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
