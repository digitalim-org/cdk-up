import { App, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  Artifact,
  Pipeline as CodePipeline,
} from "aws-cdk-lib/aws-codepipeline";
import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { SlackChannelConfiguration } from "aws-cdk-lib/aws-chatbot";
import { Topic } from "aws-cdk-lib/aws-sns";
import {
  CodeBuildAction,
  EcsDeployAction,
} from "aws-cdk-lib/aws-codepipeline-actions";
import {
  BuildEnvironment,
  BuildSpec,
  LinuxBuildImage,
  PipelineProject,
} from "aws-cdk-lib/aws-codebuild";
import * as path from "path";
import * as fs from "fs";
import githubSourceStage, {
  GithubSourceStageProps,
} from "./github-source-stage";
import {
  Cluster as EcsCluster,
  ContainerDefinitionOptions,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDriver,
  TagParameterContainerImage,
} from "aws-cdk-lib/aws-ecs";
import { Subnet, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Repository as EcrRepository } from "aws-cdk-lib/aws-ecr";
import pipeline from "./pipeline";
import { NetworkLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import { NetworkLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";

const yaml = require("js-yaml");

export type EcsDeployPipelineProps = {
  pipelineName?: string;
  build?: {
    environmentVariables: BuildEnvironment["environmentVariables"];
  };
  ecrRepoName: string;
  slack?: {
    topicName?: string;
    channelConfigurationName: string;
    workspaceId: string;
    channelId: string;
  };
  vpc: Vpc;
  container?: {
    env?: ContainerDefinitionOptions["environment"];
    secrets?: ContainerDefinitionOptions["secrets"];
  };
  githubRepo: GithubSourceStageProps;
  dockerHubCredentials: Secret;
};

export default class Pipeline extends Construct {
  public readonly loadBalancer: NetworkLoadBalancer;
  public readonly service: FargateService;

  constructor(
    scope: App | Stack,
    id: string,
    {
      pipelineName,
      githubRepo,
      build,
      slack,
      ecrRepoName,
      vpc,
      container,
      dockerHubCredentials,
    }: EcsDeployPipelineProps
  ) {
    super(scope, id);

    const sourceRepoArtifact = new Artifact();
    const deploymentArtifact = new Artifact();

    const artifactBucket = new Bucket(this, "S3ArtifactBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const ecrRepo = EcrRepository.fromRepositoryName(
      this,
      "EcrRepository",
      ecrRepoName
    );

    const dockerBuildProject = new PipelineProject(scope, "CodeBuild", {
      environment: {
        privileged: true,
        buildImage: LinuxBuildImage.AMAZON_LINUX_2_4,
        environmentVariables: {
          AWS_ACCOUNT_ID: {
            value: scope.account,
          },
          ECR_REPO: {
            value: ecrRepo.repositoryUri,
          },
          ...build?.environmentVariables,
        },
      },
      buildSpec: BuildSpec.fromObjectToYaml(
        yaml.load(
          fs.readFileSync(path.join(__dirname, "ecs-deploy.buildspec.yml"), {
            encoding: "utf-8",
          })
        )
      ),
    });

    dockerHubCredentials.grantRead(dockerBuildProject);

    ecrRepo.grantPullPush(dockerBuildProject);

    const codeBuildAction = new CodeBuildAction({
      actionName: "BuildDockerImage",
      input: sourceRepoArtifact,
      project: dockerBuildProject,
      outputs: [deploymentArtifact],
    });

    const ecsCluster = new EcsCluster(this, "EcsCluster", {
      vpc,
    });

    const taskDefinition = new FargateTaskDefinition(
      this,
      "FargateTaskDefinition"
    );

    taskDefinition.addContainer("ecs-deploy-container", {
      image: ContainerImage.fromEcrRepository(ecrRepo, "init"),
      portMappings: [
        {
          containerPort: 8000,
          hostPort: 8000,
        },
      ],
      logging: LogDriver.awsLogs({
        streamPrefix: ecrRepoName,
      }),
      ...container,
    });

    const { loadBalancer, service: fargateService } =
      new NetworkLoadBalancedFargateService(this, "EcsFargateService", {
        cluster: ecsCluster,
        taskDefinition,
        desiredCount: 1,
        minHealthyPercent: 100,
        maxHealthyPercent: 200,
        taskSubnets: {
          subnets: vpc.privateSubnets,
        },
      });

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
          actions: [codeBuildAction],
        },
        {
          stageName: "Deploy",
          actions: [
            new EcsDeployAction({
              actionName: "EcsDeploy",
              service: fargateService,
              input: deploymentArtifact,
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

    Object.assign(this, { loadBalancer, service: fargateService });
  }
}
