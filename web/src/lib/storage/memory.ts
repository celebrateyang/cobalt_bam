import { AbstractStorage } from "./storage";
import { uuid } from "$lib/util";

export class MemoryStorage extends AbstractStorage {
    #name: string;
    #chunkSize: number;
    #actualSize: number = 0;
    #chunks: Uint8Array[] = [];

    constructor(chunkSize: number) {
        super();
        this.#name = uuid();
        this.#chunkSize = chunkSize;
    }

    static async init(expectedSize: number) {
        const MB = 1024 * 1024;

        const safeExpectedSize =
            typeof expectedSize === "number" && Number.isFinite(expectedSize) && expectedSize > 0
                ? expectedSize
                : 0;

        // A chunk size of 0 would make writes hang forever (expand loop never progresses).
        // Use a reasonable default when the expected size is unknown (e.g. missing Content-Length).
        const chunkSize = safeExpectedSize > 0 ? Math.min(512 * MB, safeExpectedSize) : 4 * MB;

        const storage = new this(chunkSize);

        // since we expect the output file to be roughly the same size
        // as inputs, preallocate its size for the output
        if (safeExpectedSize > 0) {
            for (
                let toAllocate = safeExpectedSize;
                toAllocate > 0;
                toAllocate -= chunkSize
            ) {
                storage.#chunks.push(new Uint8Array(chunkSize));
            }
        }

        return storage;
    }

    async res() {
        // if we didn't need as much space as we allocated for some reason,
        // shrink the buffers so that we don't inflate the file with zeroes
        const outputView: Uint8Array[] = [];

        for (let i = 0; i < this.#chunks.length; ++i) {
            outputView.push(
                this.#chunks[i].subarray(
                    0,
                    Math.min(this.#chunkSize, this.#actualSize),
                ),
            );

            this.#actualSize -= this.#chunkSize;
            if (this.#actualSize <= 0) {
                break;
            }
        }

        return new File(outputView, this.#name);
    }

    getName() {
        return this.#name;
    }

    async getSize() {
        return this.#actualSize;
    }

    async close() {
        // memory storage does not hold OS handles
    }

    #expand(size: number) {
        while (size > this.#chunkSize * this.#chunks.length) {
            this.#chunks.push(new Uint8Array(this.#chunkSize));
        }
    }

    async write(data: Uint8Array | Int8Array, pos: number) {
        const writeEnd = pos + data.length;
        this.#expand(writeEnd);

        // Encoded output can grow far beyond the input-sized allocation hint.
        // A single LibAV write may cross any number of chunks (not just two).
        let consumed = 0;
        while (consumed < data.length) {
            const position = pos + consumed;
            const chunkIndex = Math.floor(position / this.#chunkSize);
            const offset = position - (this.#chunkSize * chunkIndex);
            const length = Math.min(data.length - consumed, this.#chunkSize - offset);
            this.#chunks[chunkIndex].set(data.subarray(consumed, consumed + length), offset);
            consumed += length;
        }

        this.#actualSize = Math.max(writeEnd, this.#actualSize);
        return data.length;
    }

    async destroy() {
        this.#chunks = [];
    }

    static async isAvailable() {
        return true;
    }
}
