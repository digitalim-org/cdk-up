import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export interface CdkUpProps {
  // Define construct properties here
}

export class CdkUp extends Construct {

  constructor(scope: Construct, id: string, props: CdkUpProps = {}) {
    super(scope, id);

    // Define construct contents here

    // example resource
    // const queue = new sqs.Queue(this, 'CdkUpQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
