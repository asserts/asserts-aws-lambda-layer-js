'use strict';
import {collectDefaultMetrics, Counter, Gauge, Histogram, register as globalRegister} from 'prom-client';
import {hostname} from 'os';

collectDefaultMetrics({
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // These are the default buckets.
});

export class LambdaInstanceMetrics {
    labelNames: string[] = [
        'asserts_source', 'asserts_tenant', 'function_name', 'instance', 'job', 'namespace', 'region', 'tenant', 'version'];
    invocations: Counter<string>;
    errors: Counter<string>;
    up: Gauge<string>;
    latency: Histogram<string>;
    memoryLimitMb: Gauge<string>;
    labelValues: {
        job?: string;
        function_name?: string;
        version?: string;
        instance: string;
        namespace: string;
        asserts_source: string;
        asserts_tenant?: string;
        tenant?: string;
        asserts_site: string | undefined;
    };

    private static singleton: LambdaInstanceMetrics = new LambdaInstanceMetrics();

    constructor() {
        this.up = new Gauge({
            name: 'up',
            help: `Heartbeat metric`,
            registers: [globalRegister],
            labelNames: this.labelNames
        });
        globalRegister.registerMetric(this.up);

        this.invocations = new Counter({
            name: 'aws_lambda_invocations_total',
            help: `AWS Lambda Invocations Count`,
            registers: [globalRegister],
            labelNames: this.labelNames
        });
        globalRegister.registerMetric(this.invocations);

        this.errors = new Counter({
            name: 'aws_lambda_errors_total',
            help: `AWS Lambda Errors Count`,
            registers: [globalRegister],
            labelNames: this.labelNames
        });
        globalRegister.registerMetric(this.errors);

        this.latency = new Histogram({
            name: 'aws_lambda_duration_seconds',
            help: `AWS Lambda Duration Histogram`,
            registers: [globalRegister],
            labelNames: this.labelNames
        });
        globalRegister.registerMetric(this.latency);

        this.memoryLimitMb = new Gauge({
            name: 'aws_lambda_memory_limit_mb',
            help: `AWS Lambda Memory Limit in MB`,
            registers: [globalRegister],
            labelNames: this.labelNames
        });
        globalRegister.registerMetric(this.memoryLimitMb);

        this.labelValues = {
            namespace: "AWS/Lambda",
            instance: hostname() + ":" + process.pid,
            asserts_source: 'prom-client',
            asserts_site: this.mapRegionCode(process.env['AWS_REGION'])
        };
        this.labelValues.function_name = process.env["AWS_LAMBDA_FUNCTION_NAME"];
        this.labelValues.job = process.env["AWS_LAMBDA_FUNCTION_NAME"];
        this.labelValues.version = process.env["AWS_LAMBDA_FUNCTION_VERSION"];
    }

    static getSingleton(): LambdaInstanceMetrics {
        return LambdaInstanceMetrics.singleton;
    }

    setTenant(tenant: string): void {
        this.labelValues.asserts_tenant = tenant;
        this.labelValues.tenant = tenant;
    }

    recordLatency(latency: number): void {
        this.latency.observe(latency);
    }

    recordError(): void {
        this.errors.inc(1);
    }

    recordInvocation(): void {
        this.invocations.inc(1);
    }

    recordLatestMemoryLimit(): void {
        if (process.env["AWS_LAMBDA_FUNCTION_MEMORY_SIZE"]) {
            const memoryLimit = Number(process.env["AWS_LAMBDA_FUNCTION_MEMORY_SIZE"]);
            if (!isNaN(memoryLimit)) {
                this.memoryLimitMb.set(memoryLimit);
            }
        }
    }

    async getAllMetricsAsText() {
        this.recordLatestMemoryLimit();
        if (this.isNameAndVersionSet()) {
            // Touch 'up' metric
            this.up.set(1.0);
            globalRegister.setDefaultLabels(this.labelValues);
            const metrics = await globalRegister.metrics();
            console.log("Gathered metrics:\n" + metrics);
            return metrics;
        } else {
            return Promise.resolve(null);
        }
    }

    isNameAndVersionSet(): boolean {
        return !!(this.labelValues.job && this.labelValues.function_name && this.labelValues.version);
    }

    mapRegionCode(region: string | undefined) {
        switch(region) {
            case 'uswest1':
                return 'us-west-1';
            case 'uswest2':
                return 'us-west-2';
            case 'useast1':
                return 'us-east-1';
            case 'useast2':
                return 'us-east-2';
            default:
                return region;
        }
    }
}