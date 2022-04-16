import StaticWebApp, {StaticWebAppProps} from "./static-web-app";
import Pipeline, {PipelineProps} from "../Pipeline"
import {Construct} from "constructs";
import {App, SecretValue, Stack} from "aws-cdk-lib";

type StaticWebAppWithPipelineProps = {
    withPipeline: true
} & PipelineProps

export default class StaticWebAppWithPipeline extends Construct {
    constructor(
        scope: Stack | App,
        id: string,
        {
            domainName,
            withPipeline,
            ...props
        }: StaticWebAppProps & ({ withPipeline?: false | undefined } | StaticWebAppWithPipelineProps)
    ) {
        super(scope, id);

        const {webDistribution, deploymentBucket} = new StaticWebApp(scope, 'StaticWebApp', {
            domainName
        })

        if (withPipeline === true && 'pipelineName' in props) {
            const {pipelineName, githubRepo, slack} = props
            const oauthToken = SecretValue.secretsManager(
                '/elishas-oil/github-pat'
            )

            new Pipeline(scope, 'Pipeline', {
                pipelineName,
                webDistribution,
                deploymentBucket,
                githubRepo,
                slack
            })
        }
    }
}
