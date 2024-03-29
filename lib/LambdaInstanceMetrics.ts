'use strict';
import {collectDefaultMetrics, Gauge, register as globalRegister} from 'prom-client';
import {hostname} from 'os';

collectDefaultMetrics({
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5, 10], // These are the default buckets.
});


export class LambdaInstanceMetrics {
  // asserts_env will be optionally sent if configured so in the environment variable
  labelNames: string[] = [
    'account_id', 'asserts_env', 'asserts_site', 'asserts_source',
    'function_name', 'instance', 'job', 'namespace', 'region', 'version', 'runtime', 'layer_version'];
  coldStart: Gauge<string>;
  layerBuildInfo: Gauge<string>;
  debugEnabled: boolean = false;
  labelValues: {
    account_id?: string;
    region: string;
    job?: string;
    function_name?: string;
    version?: string;
    instance: string;
    namespace: string;
    asserts_source: string;
    asserts_site?: string | undefined;
    asserts_env?: string | undefined;
    runtime: string
    layer_version: string
  };

  private static singleton: LambdaInstanceMetrics = new LambdaInstanceMetrics();

  constructor() {
    this.coldStart = new Gauge({
      name: 'aws_lambda_cold_start',
      help: `AWS Lambda Cold Start`,
      registers: [globalRegister],
      labelNames: this.labelNames
    });
    globalRegister.registerMetric(this.coldStart);

    this.layerBuildInfo = new Gauge({
      name: 'aws_lambda_nodejs_layer_info',
      help: `AWS Lambda Layer Build Info`,
      registers: [globalRegister],
      labelNames: this.labelNames
    });
    this.layerBuildInfo.set(1.0)
    globalRegister.registerMetric(this.layerBuildInfo);

    this.labelValues = {
      region: (process.env['AWS_REGION'] as string),
      namespace: "AWS/Lambda",
      instance: hostname() + ":" + process.pid,
      asserts_source: 'prom-client',
      runtime: 'nodejs',
      layer_version: '__layer_version__'
    };
    this.labelValues.function_name = process.env["AWS_LAMBDA_FUNCTION_NAME"];
    this.labelValues.job = process.env["AWS_LAMBDA_FUNCTION_NAME"];
    this.labelValues.version = process.env["AWS_LAMBDA_FUNCTION_VERSION"];

    if (process.env["DEBUG"] && process.env["DEBUG"] === 'true') {
      this.debugEnabled = true;
    }

    if (process.env["ASSERTS_SITE"]) {
      this.labelValues.asserts_site = process.env["ASSERTS_SITE"];
    } else {
      this.labelValues.asserts_site = this.labelValues.region;
    }

    if (process.env["ACCOUNT_ID"]) {
      this.labelValues.account_id = process.env["ACCOUNT_ID"];
      this.labelValues.asserts_env = this.labelValues.account_id;
    }

    if (process.env["ASSERTS_ENVIRONMENT"]) {
      this.labelValues.asserts_env = process.env["ASSERTS_ENVIRONMENT"];
    }

    globalRegister.setDefaultLabels(this.labelValues)
  }

  static getSingleton(): LambdaInstanceMetrics {
    return LambdaInstanceMetrics.singleton;
  }

  async getAllMetricsAsText() {
    if (this.isNameAndVersionSet()) {
      const metrics = await globalRegister.metrics();
      if (this.debugEnabled) {
        console.log("Gathered metrics:\n" + metrics);
      }
      return metrics;
    } else {
      return Promise.resolve(null);
    }
  }

  isNameAndVersionSet(): boolean {
    return !!(this.labelValues.job && this.labelValues.function_name && this.labelValues.version);
  }
}