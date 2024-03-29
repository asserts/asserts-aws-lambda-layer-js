import {Gauge} from "prom-client";
import {mocked} from "jest-mock";
import {LambdaInstanceMetrics} from "../../lib/LambdaInstanceMetrics";
import {RemoteWriter} from "../../lib/RemoteWriter";
import {TaskTimer} from 'tasktimer';
import * as https from "https";
import * as http from "http";

jest.mock('prom-client');
jest.mock('https', () => require('../__mocks__/https'));
jest.mock('http', () => require('../__mocks__/http'));
const mockedGauge = mocked(Gauge, true);

describe("Handler Wrapper works for async and sync", () => {
    const mockIsSet: jest.Mock = jest.fn();
    const mockGetMetrics: jest.Mock = jest.fn();

    const realFlushMetrics = RemoteWriter.prototype.flushMetrics;
    const realWriteMetrics = RemoteWriter.prototype.writeMetrics;
    const realErrorHandler = RemoteWriter.prototype.requestErrorHandler;
    const realOn = TaskTimer.prototype.on;

    // Mock flushMetrics to avoid real call;
    const mockedOn = jest.fn();
    const mockedFlushMetrics = jest.fn();
    const mockedGetAllMetrics = jest.fn();
    const mockedHttpsRequest: jest.Mock = (https.request as jest.Mock);
    const mockedHttpRequest: jest.Mock = (http.request as jest.Mock);

    const mockedReq = {
        on: jest.fn(), write: jest.fn(), end: jest.fn()
    };

    const mockedResponseErrorHandler = jest.fn();

    LambdaInstanceMetrics.prototype.isNameAndVersionSet = mockIsSet;
    LambdaInstanceMetrics.prototype.getAllMetricsAsText = mockGetMetrics;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env["ASSERTS_METRIC_ENDPOINT"] = undefined;
        process.env["ASSERTS_TENANT_NAME"] = undefined;
        process.env["ASSERTS_PASSWORD"] = undefined;
    });

    afterEach(() => {
        TaskTimer.prototype.on = realOn;
        RemoteWriter.prototype.flushMetrics = realFlushMetrics;
        RemoteWriter.prototype.writeMetrics = realWriteMetrics;
        RemoteWriter.prototype.requestErrorHandler = realErrorHandler;
    })

    it("All Required Remote Write Configs Missing", async () => {
        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(remoteWriter.isRemoteWritingOn()).toBe(false);
    });

    it("Test singleton", async () => {
        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(RemoteWriter.getSingleton()).toBe(remoteWriter);
    });

    it("Remote Write Endpoint Missing", async () => {
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(remoteWriter.isRemoteWritingOn()).toBe(false);
    });

    it("Tenant name is treated as optional", async () => {
        process.env["ASSERTS_METRIC_ENDPOINT"] = "http://host/api/v1/import/prometheus";

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(remoteWriter.isRemoteWritingOn()).toBe(true);
    });

    it("Password is treated as optional", async () => {
        process.env["ASSERTS_METRIC_ENDPOINT"] = "http://host/api/v1/import/prometheus";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(remoteWriter.isRemoteWritingOn()).toBe(true);
    });

    it("All Config Present", async () => {
        process.env["ASSERTS_METRIC_ENDPOINT"] = "http://host/api/v1/import/prometheus";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";
        process.env["DEBUG"] = "true";

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
        process.env["ASSERTS_METRIC_ENDPOINT"] = "http://host/api/v1/import/prometheus";
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

    it("Test cold start metric", async () => {
        process.env["ASSERTS_METRIC_ENDPOINT"] = "https://host/api/v1/import/prometheus";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";

        RemoteWriter.prototype.requestErrorHandler = mockedResponseErrorHandler;

        RemoteWriter.prototype.flushMetrics = mockedFlushMetrics;
        TaskTimer.prototype.on = mockedOn;
        LambdaInstanceMetrics.prototype.getAllMetricsAsText = mockedGetAllMetrics;

        const metricsText = "metrics";
        mockedGetAllMetrics.mockReturnValue(metricsText);

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(mockedOn).toHaveBeenCalledWith('tick', mockedFlushMetrics);

        mockedHttpsRequest.mockReturnValue(mockedReq);

        await remoteWriter.writeMetrics();

        expect(mockedHttpsRequest).toHaveBeenCalledWith({
            hash: "",
            href: "https://host/api/v1/import/prometheus",
            path: '/api/v1/import/prometheus',
            pathname: '/api/v1/import/prometheus',
            protocol: 'https:',
            search: '',
            hostname: 'host',
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'Content-Length': metricsText.length
            }
        }, RemoteWriter.prototype.responseCallback);

        expect(mockedReq.on).toHaveBeenCalledWith('error', mockedResponseErrorHandler);
        expect(mockedReq.write).toHaveBeenCalledWith(metricsText, expect.any(Function));
        expect(mockedReq.end).toHaveBeenCalled();
        expect(mockedGauge.prototype.set).toHaveBeenCalledWith(1);

        await remoteWriter.writeMetrics();

        expect(mockedHttpsRequest).toHaveBeenCalledWith({
            hash: "",
            href: "https://host/api/v1/import/prometheus",
            pathname: '/api/v1/import/prometheus',
            protocol: 'https:',
            search: '',
            hostname: 'host',
            path: '/api/v1/import/prometheus',
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'Content-Length': metricsText.length
            }
        }, RemoteWriter.prototype.responseCallback);

        expect(mockedReq.on).toHaveBeenCalledWith('error', mockedResponseErrorHandler);
        expect(mockedReq.write).toHaveBeenCalledWith(metricsText, expect.any(Function));
        expect(mockedReq.end).toHaveBeenCalled();
        expect(mockedGauge.prototype.set).toHaveBeenCalledWith(0);
    });

    it("Test writeMetrics without password", async () => {
        process.env["ASSERTS_METRIC_ENDPOINT"] = "https://host/api/v1/import/prometheus";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";

        RemoteWriter.prototype.requestErrorHandler = mockedResponseErrorHandler;

        RemoteWriter.prototype.flushMetrics = mockedFlushMetrics;
        TaskTimer.prototype.on = mockedOn;
        LambdaInstanceMetrics.prototype.getAllMetricsAsText = mockedGetAllMetrics;

        const metricsText = "metrics";
        mockedGetAllMetrics.mockReturnValue(metricsText);

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(mockedOn).toHaveBeenCalledWith('tick', mockedFlushMetrics);

        mockedHttpsRequest.mockReturnValue(mockedReq);

        await remoteWriter.writeMetrics();

        expect(mockedHttpsRequest).toHaveBeenCalledWith({
            hash: "",
            href: "https://host/api/v1/import/prometheus",
            pathname: '/api/v1/import/prometheus',
            protocol: 'https:',
            search: '',
            hostname: 'host',
            path: '/api/v1/import/prometheus',
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'Content-Length': metricsText.length
            }
        }, RemoteWriter.prototype.responseCallback);

        expect(mockedReq.on).toHaveBeenCalledWith('error', mockedResponseErrorHandler);
        expect(mockedReq.write).toHaveBeenCalledWith(metricsText, expect.any(Function));
        expect(mockedReq.end).toHaveBeenCalled();
        expect(mockedGauge.prototype.set).toHaveBeenCalledWith(1);

        await remoteWriter.writeMetrics();
        expect(mockedGauge.prototype.set).toHaveBeenCalledWith(0);
    });

    it("Test writeMetrics on default port with password", async () => {
        process.env["ASSERTS_METRIC_ENDPOINT"] = "https://host/api/v1/import/prometheus";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";

        RemoteWriter.prototype.requestErrorHandler = mockedResponseErrorHandler;

        RemoteWriter.prototype.flushMetrics = mockedFlushMetrics;
        TaskTimer.prototype.on = mockedOn;
        LambdaInstanceMetrics.prototype.getAllMetricsAsText = mockedGetAllMetrics;

        const metricsText = "metrics";
        mockedGetAllMetrics.mockReturnValue(metricsText);

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(mockedOn).toHaveBeenCalledWith('tick', mockedFlushMetrics);

        mockedHttpsRequest.mockReturnValue(mockedReq);

        await remoteWriter.writeMetrics();

        const credentials = remoteWriter.remoteWriteConfig.tenantName + ':' + remoteWriter.remoteWriteConfig.password;
        expect(mockedHttpsRequest).toHaveBeenCalledWith({
            hash: "",
            href: "https://host/api/v1/import/prometheus",
            pathname: '/api/v1/import/prometheus',
            protocol: 'https:',
            search: '',
            hostname: 'host',
            path: '/api/v1/import/prometheus',
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(credentials).toString('base64'),
                'Content-Type': 'text/plain',
                'Content-Length': metricsText.length
            }
        }, RemoteWriter.prototype.responseCallback);

        expect(mockedReq.on).toHaveBeenCalledWith('error', mockedResponseErrorHandler);
        expect(mockedReq.write).toHaveBeenCalledWith(metricsText, expect.any(Function));
        expect(mockedReq.end).toHaveBeenCalled();
    });

    it("Test writeMetrics on custom port with password", async () => {
        process.env["ASSERTS_METRIC_ENDPOINT"] = "http://host:8080/api/v1/import/prometheus";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";

        RemoteWriter.prototype.requestErrorHandler = mockedResponseErrorHandler;

        RemoteWriter.prototype.flushMetrics = mockedFlushMetrics;
        TaskTimer.prototype.on = mockedOn;
        LambdaInstanceMetrics.prototype.getAllMetricsAsText = mockedGetAllMetrics;

        const metricsText = "metrics";
        mockedGetAllMetrics.mockReturnValue(metricsText);

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(mockedOn).toHaveBeenCalledWith('tick', mockedFlushMetrics);

        mockedHttpRequest.mockReturnValue(mockedReq);

        await remoteWriter.writeMetrics();

        const credentials = remoteWriter.remoteWriteConfig.tenantName + ':' + remoteWriter.remoteWriteConfig.password;
        expect(mockedHttpRequest).toHaveBeenCalledWith({
            hash: "",
            href: "http://host:8080/api/v1/import/prometheus",
            pathname: '/api/v1/import/prometheus',
            protocol: 'http:',
            search: '',
            hostname: 'host',
            port: 8080,
            path: '/api/v1/import/prometheus',
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(credentials).toString('base64'),
                'Content-Type': 'text/plain',
                'Content-Length': metricsText.length
            }
        }, RemoteWriter.prototype.responseCallback);

        expect(mockedReq.on).toHaveBeenCalledWith('error', mockedResponseErrorHandler);
        expect(mockedReq.write).toHaveBeenCalledWith(metricsText, expect.any(Function));
        expect(mockedReq.end).toHaveBeenCalled();
    });

    it("Test writeMetrics no metrics", async () => {
        process.env["ASSERTS_METRIC_ENDPOINT"] = "http://host:8080/api/v1/import/prometheus";
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
        process.env["ASSERTS_METRIC_ENDPOINT"] = "http://host:8080/api/v1/import/prometheus";
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

    it("Test responseCallback", async () => {
        process.env["ASSERTS_METRIC_ENDPOINT"] = "http://host:8080/api/v1/import/prometheus";
        process.env["ASSERTS_TENANT_NAME"] = "tenantName";
        process.env["ASSERTS_PASSWORD"] = "tenantPassword";

        // Mock flushMetrics to avoid real call;
        const mockedOn = jest.fn();
        const mockedFlushMetrics = jest.fn();

        RemoteWriter.prototype.flushMetrics = mockedFlushMetrics;
        TaskTimer.prototype.on = mockedOn;

        const remoteWriter: RemoteWriter = new RemoteWriter();
        expect(mockedOn).toHaveBeenCalledWith('tick', mockedFlushMetrics);

        const mockRes = {
            statusCode: "400",
            on: jest.fn()
        };
        remoteWriter.responseCallback(mockRes);
        expect(mockRes.on).toHaveBeenCalledWith("data", RemoteWriter.prototype.responseDataHandler);

        remoteWriter.responseDataHandler({});
        remoteWriter.requestErrorHandler(new Error());
    });

    it("Calling cancel when timer not set", async () => {
        const remoteWriter: RemoteWriter = new RemoteWriter();
        remoteWriter.cancel();
    });
});
