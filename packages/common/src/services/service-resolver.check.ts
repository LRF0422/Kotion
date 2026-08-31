import { ServiceRegistry } from "../core/ServiceRegistry";
import type { FileService } from "../core/types";
import {
    bindServiceRegistry,
    createServiceResolver,
    getBoundServiceRegistry,
    resolveOptionalService,
    resolveService,
} from "./service-resolver";

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
};

interface CheckServices {
    value?: { id: string };
}

const resolver = createServiceResolver<CheckServices>();
const first = { get: () => ({ id: "first" }) };
const second = { get: () => ({ id: "second" }) };

const unbindFirst = resolver.bind(first);
assert(resolver.resolve("value").id === "first", "resolver should read the bound registry");
const unbindSecond = resolver.bind(second);
assert(resolver.resolve("value").id === "second", "new bindings should replace the active registry");
unbindSecond();
assert(resolver.resolve("value").id === "first", "nested binding cleanup should restore the previous registry");
unbindFirst();
assert(resolver.resolveOptional("value") === undefined, "cleanup should unbind the registry");

const releaseFirstOutOfOrder = resolver.bind(first);
const releaseSecondOutOfOrder = resolver.bind(second);
releaseFirstOutOfOrder();
assert(resolver.resolve("value").id === "second", "out-of-order cleanup should keep the active binding");
releaseSecondOutOfOrder();
assert(resolver.resolveOptional("value") === undefined, "out-of-order cleanup should not resurrect a released registry");

const fileService = { getDownloadUrl: (name: string) => name } as FileService;
const registry = new ServiceRegistry({ fileService });
const release = bindServiceRegistry(registry);
assert(getBoundServiceRegistry() === registry, "default resolver should expose its bound registry");
assert(resolveService("fileService") === fileService, "imperative resolve should preserve service identity");
assert(resolveOptionalService("aiFoundation") === undefined, "optional resolve should allow missing services");
release();

let threw = false;
try {
    resolveService("fileService");
} catch (error) {
    threw = error instanceof Error && error.message.includes("No ServiceRegistry");
}
assert(threw, "required resolve should explain when no registry is bound");

console.log("service resolver checks passed");
