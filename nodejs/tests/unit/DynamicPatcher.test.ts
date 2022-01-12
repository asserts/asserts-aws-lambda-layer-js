'use strict';
import {DynamicPatcher} from "../../src/lib/DynamicPatcher";
import {LambdaInstanceMetrics} from "../../src/lib/LambdaInstanceMetrics";

LambdaInstanceMetrics.prototype.recordInvocation = jest.fn();
LambdaInstanceMetrics.prototype.recordLatency = jest.fn();

describe("Handler Wrapper works for async and sync", () => {
    const actualPatchHandler = DynamicPatcher.prototype.patchHandler;
    const actualTryPatchHandler = DynamicPatcher.prototype.tryPatchHandler;
    beforeEach(() => {
        jest.clearAllMocks();
        DynamicPatcher.prototype.patchHandler = actualPatchHandler;
        DynamicPatcher.prototype.tryPatchHandler = actualTryPatchHandler;
        process.env.ASSERTS_DYNAMIC_PATCHING = undefined;
        process.env.LAMBDA_TASK_ROOT = undefined;
        process.env._HANDLER = undefined;
    })

    it("Don't try dynamic patching when env undefined", async () => {
        DynamicPatcher.prototype.patchHandler = jest.fn();
        const patcher: DynamicPatcher = new DynamicPatcher();
        patcher.patchDynamicallyIfEnabled();
        expect(DynamicPatcher.prototype.patchHandler).not.toHaveBeenCalled();
    });

    it("Don't try dynamic patching when explicitly disabled", async () => {
        process.env.ASSERTS_DYNAMIC_PATCHING = "false";
        DynamicPatcher.prototype.patchHandler = jest.fn();
        const patcher: DynamicPatcher = new DynamicPatcher();
        patcher.patchDynamicallyIfEnabled();
        expect(DynamicPatcher.prototype.patchHandler).not.toHaveBeenCalled();
    });

    it("Try dynamic patching when enabled", async () => {
        process.env.ASSERTS_DYNAMIC_PATCHING = "true";
        DynamicPatcher.prototype.patchHandler = jest.fn();
        const patcher: DynamicPatcher = new DynamicPatcher();
        patcher.patchDynamicallyIfEnabled();
        expect(DynamicPatcher.prototype.patchHandler).toHaveBeenCalled();
    });

    it("Patching aborts when Lambda Task Root is not defined", async () => {
        process.env.ASSERTS_DYNAMIC_PATCHING = "true";
        const mockTryPatchHandler = jest.fn();
        DynamicPatcher.prototype.tryPatchHandler = mockTryPatchHandler;
        const patcher: DynamicPatcher = new DynamicPatcher();
        patcher.patchDynamicallyIfEnabled();
        expect(mockTryPatchHandler.mock.calls.length).toBe(0);
    });

    it("Patching aborts when Lambda Task Root is defined but handler env is not defined", async () => {
        process.env.ASSERTS_DYNAMIC_PATCHING = "true";
        process.env.LAMBDA_TASK_ROOT = "root";
        DynamicPatcher.prototype.tryPatchHandler = jest.fn();
        const patcher: DynamicPatcher = new DynamicPatcher();
        patcher.patchDynamicallyIfEnabled();
        expect(DynamicPatcher.prototype.tryPatchHandler).not.toHaveBeenCalled();
    });

    it("Patching is attempted when lambda task root and handler env variables are defined", async () => {
        process.env.ASSERTS_DYNAMIC_PATCHING = "true";
        process.env.LAMBDA_TASK_ROOT = "root";
        process.env._HANDLER = "index.handler";
        DynamicPatcher.prototype.tryPatchHandler = jest.fn();
        const patcher: DynamicPatcher = new DynamicPatcher();
        patcher.patchDynamicallyIfEnabled();
        expect(DynamicPatcher.prototype.tryPatchHandler).toHaveBeenCalled();
    });

    it("Patching aborts when Lambda Task Root is defined but unexpected handler name format", async () => {
        process.env.ASSERTS_DYNAMIC_PATCHING = "true";
        process.env.LAMBDA_TASK_ROOT = "root";
        process.env._HANDLER = "index";
        const patcher: DynamicPatcher = new DynamicPatcher();
        patcher.patchDynamicallyIfEnabled();
    });

    it("Patch real function handler name does not match", async () => {
        process.env.ASSERTS_DYNAMIC_PATCHING = "true";
        process.env.LAMBDA_TASK_ROOT = "./tests/unit/lambda_task_root";
        process.env._HANDLER = "missing.handler";
        process.env.AWS_LAMBDA_FUNCTION_NAME = "OrderProcessor";
        process.env.AWS_LAMBDA_FUNCTION_VERSION = "1";
        const patcher: DynamicPatcher = new DynamicPatcher();
        patcher.patchDynamicallyIfEnabled();
    });

    it("Patch real function handler not a function", async () => {
        process.env.ASSERTS_DYNAMIC_PATCHING = "true";
        process.env.LAMBDA_TASK_ROOT = "./tests/unit/lambda_task_root_mismatch";
        process.env._HANDLER = "index.handler";
        process.env.AWS_LAMBDA_FUNCTION_NAME = "OrderProcessor";
        process.env.AWS_LAMBDA_FUNCTION_VERSION = "1";
        const patcher: DynamicPatcher = new DynamicPatcher();
        patcher.patchDynamicallyIfEnabled();
    });

    it("Patch real function misleading name", async () => {
        process.env.ASSERTS_DYNAMIC_PATCHING = "true";
        process.env.LAMBDA_TASK_ROOT = "./tests/unit/lambda_task_root_mismatch";
        process.env._HANDLER = "index.handler1";
        process.env.AWS_LAMBDA_FUNCTION_NAME = "OrderProcessor";
        process.env.AWS_LAMBDA_FUNCTION_VERSION = "1";
        const patcher: DynamicPatcher = new DynamicPatcher();
        patcher.patchDynamicallyIfEnabled();
    });

    it("Patch real function", async () => {
        process.env.ASSERTS_DYNAMIC_PATCHING = "true";
        process.env.LAMBDA_TASK_ROOT = "./tests/unit/lambda_task_root";
        process.env._HANDLER = "index.handler";
        process.env.AWS_LAMBDA_FUNCTION_NAME = "OrderProcessor";
        process.env.AWS_LAMBDA_FUNCTION_VERSION = "1";
        const patcher: DynamicPatcher = new DynamicPatcher();
        patcher.patchDynamicallyIfEnabled();
        const mod = require('./../unit/lambda_task_root');
        mod.handler({}, {});
        expect(LambdaInstanceMetrics.prototype.recordInvocation).toHaveBeenCalled();
    });
});
