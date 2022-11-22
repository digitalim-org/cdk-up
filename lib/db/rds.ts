import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import {
  AuroraPostgresEngineVersion,
  DatabaseCluster,
  DatabaseClusterEngine,
} from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

export interface RdsProps {
  vpc: Vpc;
}

export default class Rds extends Construct {
  public readonly cluster: DatabaseCluster;

  constructor(scope: Construct, id: string, { vpc }: RdsProps) {
    super(scope, id);

    const cluster = new DatabaseCluster(this, "ActixRDS", {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.of("14.5", "14"),
      }),
      instanceProps: {
        vpc,
        autoMinorVersionUpgrade: true,
        vpcSubnets: {
          onePerAz: true,
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
        instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
      },
    });

    Object.assign(this, {
      cluster,
    });
  }
}
