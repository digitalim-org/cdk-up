import { SecretValue } from "aws-cdk-lib";
import { Artifact } from "aws-cdk-lib/aws-codepipeline";
import { GitHubSourceAction } from "aws-cdk-lib/aws-codepipeline-actions";

export interface GithubSourceStageProps {
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
}

export default function ({
  branch,
  name,
  oauthToken,
  owner,
  sourceRepoArtifact,
}: GithubSourceStageProps & { sourceRepoArtifact: Artifact }) {
  return {
    stageName: "Source",
    actions: [
      new GitHubSourceAction({
        actionName: "GitHubSource",
        owner: owner,
        repo: name,
        oauthToken: oauthToken,
        output: sourceRepoArtifact,
        branch: branch,
      }),
    ],
  };
}
