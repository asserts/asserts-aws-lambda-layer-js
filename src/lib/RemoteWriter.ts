'use strict';
import {LambdaInstanceMetrics} from './LambdaInstanceMetrics';
import {request} from 'https';
import {TaskTimer} from "tasktimer";

export class RemoteWriter {
    remoteWriteConfig: {
        hostName?: string | undefined;
        tenantName?: string | undefined;
        password?: string | undefined;
        isComplete: boolean;
    }
    lambdaInstance: LambdaInstanceMetrics;
    taskTimer?: TaskTimer;
    cancelled: boolean = false;
    private static singleton: RemoteWriter = new RemoteWriter();

    static getSingleton() {
        return this.singleton;
    }

    constructor() {
        this.lambdaInstance = LambdaInstanceMetrics.getSingleton();
        this.remoteWriteConfig = {
            hostName: process.env["ASSERTS_METRICSTORE_HOST"],
            tenantName: process.env["ASSERTS_TENANT_NAME"],
            password: process.env["ASSERTS_PASSWORD"],
            isComplete: false
        };

        if (this.remoteWriteConfig.tenantName && this.remoteWriteConfig.tenantName !== 'undefined') {
            this.lambdaInstance.setTenant((this.remoteWriteConfig.tenantName as (string)));
        }

        this.remoteWriteConfig.isComplete = this.remoteWriteConfig.hostName !== 'undefined';
        if (this.remoteWriteConfig.isComplete && !process.env.ASSERTS_LAYER_DISABLED &&
            process.env.ASSERTS_LAYER_DISABLED !== 'undefined' &&
            process.env.ASSERTS_LAYER_DISABLED !== 'true') {
            this.startRemoteWriter();
        }
        RemoteWriter.singleton = this;
    }

    startRemoteWriter() {
        this.taskTimer = new TaskTimer(15_000);

        // 'tick' will happen every 15 seconds
        this.taskTimer.on('tick', this.flushMetrics);
        this.taskTimer.start();
        console.log("Registered metric flush task with timer at 15 seconds interval");
    }

    isRemoteWritingOn(): boolean {
        const _this = RemoteWriter.singleton;
        return _this.remoteWriteConfig.isComplete && !_this.cancelled;
    }

    async flushMetrics() {
        console.log("Timer task flushing metrics...");
        const _this = RemoteWriter.singleton;
        if (!_this.cancelled) {
            await _this.writeMetrics();
        }
    }

    cancel(): void {
        const _this = RemoteWriter.singleton;
        _this.cancelled = true;
        _this.taskTimer?.removeListener('tick', _this.flushMetrics);
    }

    // This will have to be invoked once every 15 seconds. We should probably use the NodeJS Timer for this
    async writeMetrics(): Promise<void> {
        if (this.isRemoteWritingOn()) {
            let text = await this.lambdaInstance.getAllMetricsAsText();
            if (text != null) {
                const options = {
                    hostname: this.remoteWriteConfig.hostName,
                    port: 443,
                    path: '/api/v1/import/prometheus',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain',
                        'Content-Length': text.length
                    }
                };
                this.setAuthHeaders(options);
                const req = request(options, this.responseCallback)
                req.on('error', this.requestErrorHandler);
                req.write(text, () => {
                    console.log("Flushed metrics to remote");
                });
                req.end();
            } else {
                console.log("Function name and version not known yet");
            }
        } else {
            console.log("Asserts Cloud Remote Write Configuration in complete: \n", JSON.stringify(this.remoteWriteConfig));
        }
    }

    setAuthHeaders(options: any) {
        if (this.remoteWriteConfig.password && this.remoteWriteConfig.password !== 'undefined') {
            options.headers.Authorization = 'Basic ' + Buffer
                .from(this.remoteWriteConfig.tenantName + ':' + this.remoteWriteConfig.password)
                .toString('base64');
        }
    }

    responseCallback(res: any) {
        console.log(`POST Asserts Metric API statusCode: ${res.statusCode}`);
        if (res.statusCode!.toString() === "400") {
            console.log("Response: " + JSON.stringify(res));
        }
        const _this = RemoteWriter.singleton;
        res.on('data', _this.responseDataHandler);
    }

    responseDataHandler(data: any) {
        console.log('POST to Asserts Metric API returned: ' + data.toString());
    }

    requestErrorHandler(error: any) {
        console.error('POST to Asserts Metric API resulted in an error: ' + error.toString());
    }
}

