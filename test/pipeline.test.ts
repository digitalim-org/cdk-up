import {App, SecretValue, Stack} from "aws-cdk-lib";
import Pipeline from "../lib/Pipeline"
import {Bucket} from "aws-cdk-lib/aws-s3";
import {Distribution} from "aws-cdk-lib/aws-cloudfront";
import {S3Origin} from "aws-cdk-lib/aws-cloudfront-origins";
import {Template} from "aws-cdk-lib/assertions";
import * as util from "util";
import * as fs from "fs";
import * as path from "path";

describe("Pipeline", () => {
    const app = new App()
    const stack = new Stack(app)
    const deploymentBucket = new Bucket(stack, 'Bucket')
    new Pipeline(stack, 'Pipeline', {
        deploymentBucket,
        githubRepo: {
            owner: "foo",
            oauthToken: SecretValue.plainText("bar"),
            name: "baz",
            branch: "quux"
        },
        webDistribution: new Distribution(stack, 'Distribution', {
            defaultBehavior: {
                origin: new S3Origin(deploymentBucket)
            }
        })
    })

    const template = Template.fromStack(stack)

    it("Creates the right CodeBuild configuration", () => {

        // console.log(util.inspect(template.toJSON(), false, 6))
        const expectedYaml = fs.readFileSync(
            path.join(
                __dirname,
                // '..',
                'lib',
                'Pipeline',
                'buildspec.yml'
            ), {encoding: 'utf8'}
        )

        template.hasResourceProperties("AWS::CodeBuild::Project", {
            Source: {
                BuildSpec: expectedYaml
            }
        })
    })

    it("Matches snapshot", () => {
        expect(template).toMatchSnapshot()
    })
})
