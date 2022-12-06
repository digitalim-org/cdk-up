import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import GraphQlApi, { GraphQlApiProps } from "./graphql-api";

type GraphQlApiWithDataSourceProps = GraphQlApiProps;

export default class GraphQlApiWithDataSource extends Construct {
  constructor(
    scope: Construct,
    id: string,
    {
      appClient,
      schema,
      userPool,
      name,
      partitionKey,
    }: GraphQlApiWithDataSourceProps
  ) {
    super(scope, id);

    new GraphQlApi(this, "GraphQlApi", {
      schema,
      name,
      userPool,
      appClient,
      partitionKey,
    });
  }
}
