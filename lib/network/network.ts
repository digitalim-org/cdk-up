import { Vpc, SubnetType } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export default class Network extends Construct {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const vpc = new Vpc(this, "BackendVpc", {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: SubnetType.PUBLIC,
        },
        {
          name: "PrivateWithPublicOutbound",
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          name: "Private",
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    Object.assign(this, { vpc });
  }
}
