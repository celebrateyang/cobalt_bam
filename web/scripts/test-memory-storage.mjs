import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { File } from "node:buffer";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/storage/memory.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, {
    exports, File, Uint8Array, Int8Array,
    require(name) {
        if (name === "./storage") return { AbstractStorage: class {} };
        if (name === "$lib/util") return { uuid: () => "test-output" };
        throw new Error(`Unexpected import: ${name}`);
    },
});
const { MemoryStorage } = exports;
const bytes = async storage => new Uint8Array(await (await storage.res()).arrayBuffer());

test("a single write can span more than two chunks", async () => {
    const storage = new MemoryStorage(4);
    const input = Uint8Array.from({ length: 19 }, (_, i) => i + 1);
    assert.equal(await storage.write(input, 0), input.length);
    assert.deepEqual(await bytes(storage), input);
});

test("unaligned multi-chunk writes preserve previous bytes", async () => {
    const storage = new MemoryStorage(4);
    await storage.write(new Uint8Array([9, 8, 7]), 0);
    const tail = Uint8Array.from({ length: 16 }, (_, i) => i + 20);
    await storage.write(tail, 3);
    assert.deepEqual(await bytes(storage), new Uint8Array([9, 8, 7, ...tail]));
});

test("header rewrites keep the complete output and size", async () => {
    const storage = new MemoryStorage(4);
    await storage.write(new Uint8Array(19).fill(5), 0);
    await storage.write(new Uint8Array([1, 2, 3, 4, 5, 6]), 2);
    assert.equal(await storage.getSize(), 19);
    assert.deepEqual(await bytes(storage), new Uint8Array([5, 5, 1, 2, 3, 4, 5, 6, ...new Array(11).fill(5)]));
});

test("sparse writes zero-fill gaps and signed input preserves bytes", async () => {
    const storage = new MemoryStorage(4);
    await storage.write(new Int8Array([-1, -128, 127]), 9);
    assert.deepEqual(await bytes(storage), new Uint8Array([...new Array(9).fill(0), 255, 128, 127]));
});

test("expected size is an allocation hint, not an output limit", async () => {
    const storage = await MemoryStorage.init(8);
    const input = new Uint8Array(40).fill(42);
    await storage.write(input, 0);
    assert.equal(await storage.getSize(), 40);
    assert.deepEqual(await bytes(storage), input);
});
