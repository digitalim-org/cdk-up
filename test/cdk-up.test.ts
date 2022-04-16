// import * as cdk from 'aws-cdk-lib';
// import { Template } from 'aws-cdk-lib/assertions';
// import * as CdkUp from '../lib/index';

// example test. To run these tests, uncomment this file along with the
// example resource in lib/index.ts
test('SQS Queue Created', () => {
    `
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 14
    commands:
      - npm install -g npm
      - npm install
  build:
    commands:
      - npm run build
artifacts:
  secondary-artifacts:
    ui:
      name: ui
      files:
        - '**/*'
      base-directory: build
    api:
      name: api
      files:
        - '**/*'
        - ../infra/appspec.yml
        - ../infra/scripts/**
      base-directory: api
    `
//   const app = new cdk.App();
//   const stack = new cdk.Stack(app, "TestStack");
//   // WHEN
//   new CdkUp.CdkUp(stack, 'MyTestConstruct');
//   // THEN
//   const template = Template.fromStack(stack);

//   template.hasResourceProperties('AWS::SQS::Queue', {
//     VisibilityTimeout: 300
//   });
});
