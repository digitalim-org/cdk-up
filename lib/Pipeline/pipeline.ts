import {App, RemovalPolicy, SecretValue, Stack} from 'aws-cdk-lib';
import {Artifact, Pipeline as CodePipeline} from 'aws-cdk-lib/aws-codepipeline';
import {Construct} from 'constructs';
import {Bucket} from "aws-cdk-lib/aws-s3";
import {Distribution} from "aws-cdk-lib/aws-cloudfront";
import {SlackChannelConfiguration} from 'aws-cdk-lib/aws-chatbot';
import {Topic} from "aws-cdk-lib/aws-sns";
import {CodeBuildAction, GitHubSourceAction, S3DeployAction} from "aws-cdk-lib/aws-codepipeline-actions";
import {BuildSpec, LinuxBuildImage, PipelineProject} from "aws-cdk-lib/aws-codebuild";
import {PolicyStatement} from "aws-cdk-lib/aws-iam";
import * as path from "path";

const yaml = require("js-yaml")

export type PipelineProps = {
    deploymentBucket: Bucket
    webDistribution: Distribution
    pipelineName?: string
    githubRepo: {
        owner: string
        name: string
        oauthToken: SecretValue
        branch: string
    }
    slack?: {
        topicName?: string
        channelConfigurationName: string
        workspaceId: string
        channelId: string
    }
}

export default class Pipeline extends Construct {
    constructor(scope: Stack | App, id: string, {
        deploymentBucket,
        webDistribution,
        pipelineName,
        githubRepo,
        slack
    }: PipelineProps) {
        super(scope, id);

        const sourceRepoArtifact = new Artifact()
        const deploymentArtifact = new Artifact()

        const artifactBucket = new Bucket(this, 'S3ArtifactBucket', {
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        })

        const invalidateCacheCodeBuild = new PipelineProject(scope, `InvalidateCacheProject`, {
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
                CLOUDFRONT_ID: {value: webDistribution.distributionId},
            },
        });

        // Add Cloudfront invalidation permissions to the project
        const distributionArn = `arn:aws:cloudfront::${scope.account}:distribution/${webDistribution.distributionId}`;

        invalidateCacheCodeBuild.addToRolePolicy(
            new PolicyStatement({
                resources: [distributionArn],
                actions: ["cloudfront:CreateInvalidation"],
            })
        );

        const pipeline = new CodePipeline(this, 'CodePipeline', {
            // This prevents unnecessary KMS keys from being created.
            crossAccountKeys: false,
            pipelineName,
            restartExecutionOnUpdate: true,
            artifactBucket,
            stages: [
                {
                    stageName: 'Source',
                    actions: [new GitHubSourceAction({
                        actionName: 'GitHubSource',
                        owner: githubRepo.owner,
                        repo: githubRepo.name,
                        oauthToken: githubRepo.oauthToken,
                        output: sourceRepoArtifact,
                        branch: githubRepo.branch
                    })]
                },
                {
                    stageName: 'Build',
                    actions: [new CodeBuildAction({
                        actionName: 'CodeBuild',
                        input: sourceRepoArtifact,
                        project: new PipelineProject(scope, 'CodeBuild', {
                            environment: {
                                buildImage: LinuxBuildImage.STANDARD_5_0
                            },
                            buildSpec: yaml.load(path.join(__dirname, 'buildspec.yml'))
                        }),
                        outputs: [deploymentArtifact]
                    })]
                },
                {
                    stageName: "Deploy",
                    actions: [
                        new S3DeployAction({
                            actionName: 'S3Deploy',
                            input: deploymentArtifact,
                            bucket: deploymentBucket
                        })
                    ]
                },
                {
                    stageName: 'Invalidate_Cache',
                    actions: [new CodeBuildAction({
                        actionName: "InvalidateCache",
                        input: deploymentArtifact,
                        project: invalidateCacheCodeBuild,
                    })]
                }
            ]
        })

        if (slack) {
            const {channelConfigurationName, topicName, channelId, workspaceId} = slack

            const slackTopic = new Topic(this, 'PipelineTopic', {
                topicName: topicName || channelConfigurationName,
            })

            const slackTarget = new SlackChannelConfiguration(this, 'SlackChannel', {
                slackChannelConfigurationName: channelConfigurationName,
                slackWorkspaceId: workspaceId,
                slackChannelId: channelId,
                notificationTopics: [slackTopic]
            });

            pipeline.notifyOnExecutionStateChange('NotifyOnAnyStageStateChange', slackTarget)
        }
    }
}
