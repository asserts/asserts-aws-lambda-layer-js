import {LambdaInstanceMetrics} from "../../src/lib/LambdaInstanceMetrics";
import {RemoteWriter} from "../../src/lib/RemoteWriter";
import {TaskTimer} from 'tasktimer';
import * as https from "https";

jest.mock('https', () => require('../../tests/__mocks__/https'));

describe("Handler Wrapper works for async and sync", () => {
    const mockIsSet: jest.Mock = jest.fn();
    const mockGetMetrics: jest.Mock = jest.fn();
    const realFlushMetrics = RemoteWriter.prototype.flushMetrics;
    const realWriteMetrics = RemoteWriter.prototype.writeMetrics;
    const realDataHandler = function (data: any) {
        console.log(data);
    };
    const realErrorHandler = RemoteWriter.prototype.requestErrorHandler;
    const realOn = TaskTimer.prototype.on;

    LambdaInstanceMetrics.prototype.isNameAndVersionSet = mockIsSet;
    LambdaInstanceMetrics.prototype.getAllMetricsAsText = mockGetMetrics;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env["ASSERTS_REMOTE_WRITE_URL"] = undefined;
        process.env["ASSERTS_TENANT_NAME"] = undefined;
        process.env["ASSERTS_PASSWORD"] = undefined;
    });

    afterEach(() => {
        TaskTimer.prototype.on = realOn;
        RemoteWriter.prototype.flushMetrics = realFlushMetrics;
        RemoteWriter.prototype.writeMetrics = realWriteMetrics;
        RemoteWriter.prototype.requestErrorHandler = realErrorHandler;
    })

    it("All Remote Write Configs Missing", async () => {
        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(remoteWriter.isRemoteWritingOn()).toBe(false);
    });

    it("Remote Write URL Missing", async () => {
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(remoteWriter.isRemoteWritingOn()).toBe(false);
    });

    it("Tenant name Missing", async () => {
        process.env["ASSERTS_REMOTE_WRITE_URL"] = "url";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(remoteWriter.isRemoteWritingOn()).toBe(false);
    });

    it("Password Missing", async () => {
        process.env["ASSERTS_REMOTE_WRITE_URL"] = "url";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(remoteWriter.isRemoteWritingOn()).toBe(false);
    });

    it("All Config Present", async () => {
        process.env["ASSERTS_REMOTE_WRITE_URL"] = "url";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";

        // Mock flushMetrics to avoid real call;
        const mockedFlushMetrics = jest.fn();
        const mockedOn = jest.fn();
        RemoteWriter.prototype.flushMetrics = mockedFlushMetrics;
        TaskTimer.prototype.on = mockedOn;

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(remoteWriter.isRemoteWritingOn()).toBe(true);
        expect(mockedOn).toHaveBeenCalledWith('tick', mockedFlushMetrics);
    });

    it("Flush calls remote write", async () => {
        process.env["ASSERTS_REMOTE_WRITE_URL"] = "url";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";

        // Mock flushMetrics to avoid real call;
        const mockedWriteMetrics = jest.fn();
        const mockedOn = jest.fn();
        RemoteWriter.prototype.writeMetrics = mockedWriteMetrics;
        TaskTimer.prototype.on = mockedOn;

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(remoteWriter.isRemoteWritingOn()).toBe(true);
        expect(mockedOn).toHaveBeenCalledWith('tick', realFlushMetrics);
        await remoteWriter.flushMetrics();
        expect(mockedWriteMetrics).toHaveBeenCalled();
    });

    it("Test writeMetrics", async () => {
        process.env["ASSERTS_REMOTE_WRITE_URL"] = "url";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";

        // Mock flushMetrics to avoid real call;
        const mockedOn = jest.fn();
        const mockedFlushMetrics = jest.fn();
        const mockedGetAllMetrics = jest.fn();
        const mockedRequest: jest.Mock = (https.request as jest.Mock);

        const mockedReq = {
            on: jest.fn(), write: jest.fn(), end: jest.fn()
        };

        const mockedResponseErrorHandler = jest.fn();
        RemoteWriter.prototype.requestErrorHandler = mockedResponseErrorHandler;

        RemoteWriter.prototype.flushMetrics = mockedFlushMetrics;
        TaskTimer.prototype.on = mockedOn;
        LambdaInstanceMetrics.prototype.getAllMetricsAsText = mockedGetAllMetrics;

        const metricsText = "metrics";
        mockedGetAllMetrics.mockReturnValue(metricsText);

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(mockedOn).toHaveBeenCalledWith('tick', mockedFlushMetrics);

        mockedRequest.mockReturnValue(mockedReq);

        await remoteWriter.writeMetrics();

        const credentials = remoteWriter.remoteWriteConfig.tenantName + ':' + remoteWriter.remoteWriteConfig.password;
        expect(mockedRequest).toHaveBeenCalledWith({
            hostname: remoteWriter.remoteWriteConfig.remoteWriteURL,
            port: 443,
            path: '/api/v1/import/prometheus',
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(credentials).toString('base64'),
                'Content-Type': 'text/plain',
                'Content-Length': metricsText.length
            }
        }, RemoteWriter.prototype.responseCallback);

        expect(mockedReq.on).toHaveBeenCalledWith('error', mockedResponseErrorHandler);
        expect(mockedReq.write).toHaveBeenCalledWith(metricsText);
        expect(mockedReq.end).toHaveBeenCalled();
    });

    it("Test writeMetrics no metrics", async () => {
        process.env["ASSERTS_REMOTE_WRITE_URL"] = "url";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";

        // Mock flushMetrics to avoid real call;
        const mockedOn = jest.fn();
        const mockedFlushMetrics = jest.fn();
        const mockedGetAllMetrics = jest.fn();

        RemoteWriter.prototype.flushMetrics = mockedFlushMetrics;
        TaskTimer.prototype.on = mockedOn;
        LambdaInstanceMetrics.prototype.getAllMetricsAsText = mockedGetAllMetrics;

        const metricsText = null;
        mockedGetAllMetrics.mockReturnValue(metricsText);

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(mockedOn).toHaveBeenCalledWith('tick', mockedFlushMetrics);

        await remoteWriter.writeMetrics();
    });

    it("Test writeMetrics when remote write config incomplete", async () => {
        // Mock flushMetrics to avoid real call;
        const mockedGetAllMetrics = jest.fn();
        LambdaInstanceMetrics.prototype.getAllMetricsAsText = mockedGetAllMetrics;

        const metricsText = "metrics";
        mockedGetAllMetrics.mockReturnValue(metricsText);

        const remoteWriter: RemoteWriter = new RemoteWriter();
        await remoteWriter.writeMetrics();
    });

    it("Test writeMetrics when writing cancelled", async () => {
        process.env["ASSERTS_REMOTE_WRITE_URL"] = "url";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";

        // Mock flushMetrics to avoid real call;
        const mockedOn = jest.fn();
        const mockedFlushMetrics = jest.fn();
        const mockedGetAllMetrics = jest.fn();
        const mockedRequest: jest.Mock = (https.request as jest.Mock);

        RemoteWriter.prototype.flushMetrics = mockedFlushMetrics;
        TaskTimer.prototype.on = mockedOn;

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(mockedOn).toHaveBeenCalledWith('tick', mockedFlushMetrics);
        remoteWriter.cancel();
        await remoteWriter.writeMetrics();

        expect(mockedGetAllMetrics).not.toHaveBeenCalled();
        expect(mockedRequest).not.toHaveBeenCalled();
    });
});