import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  GraphqlApi,
  Schema,
  AuthorizationType,
  UserPoolDefaultAction,
} from "@aws-cdk/aws-appsync-alpha";
import { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { DynamoDbTable } from "../db";
import { Attribute } from "aws-cdk-lib/aws-dynamodb";

export interface GraphQlApiProps {
  schema: Schema;
  name?: string;
  userPool: UserPool;
  appClient: UserPoolClient;
  partitionKey: Attribute;
  sortKey?: Attribute;
}

export default class GraphQlApi extends Stack {
  constructor(
    scope: Construct,
    id: string,
    {
      schema,
      name,
      userPool,
      appClient,
      partitionKey,
      sortKey,
      ...props
    }: GraphQlApiProps & StackProps
  ) {
    super(scope, id, props);

    const graphqlApi = new GraphqlApi(this, "GraphqlApi", {
      name: name || "graphql-api",
      schema,
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
            appIdClientRegex: appClient.userPoolClientId,
            defaultAction: UserPoolDefaultAction.ALLOW,
          },
        },
      },
    });

    const { table } = new DynamoDbTable(this, "DynamoDbTable", {
      partitionKey,
      sortKey,
      name: "GraphqlApiDataSource",
    });

    graphqlApi.addDynamoDbDataSource("DynamoDbDataSource", table);
  }
}
