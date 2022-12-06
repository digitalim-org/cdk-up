import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import {
  Attribute,
  BillingMode,
  Table,
  TableClass,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

interface DynamoDbTableProps {
  partitionKey: Attribute;
  sortKey?: Attribute;
  enhancedMonitoring?: boolean;
  name?: string;
}

export default class DynamoDbTable extends Stack {
  public readonly table: Table;

  constructor(
    scope: Construct,
    id: string,
    { partitionKey, sortKey, name, ...props }: DynamoDbTableProps & StackProps
  ) {
    super(scope, id, props);

    const table = new Table(this, "_DynamoDBTable", {
      partitionKey,
      sortKey,
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      tableClass: TableClass.STANDARD,
      tableName: name,
    });

    Object.assign(this, {
      table,
    });
  }
}
