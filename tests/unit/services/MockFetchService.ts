import * as fs from "fs";
import * as path from "path";
import { IFetchService } from "../../../src/data-access/IFetchService";
import { RunTimeFetchResponse } from "../../../src/types/RunTimeFetchResponse";

type RecordedResponse = {
    ok: boolean;
    status: number;
    statusText: string;
    data: unknown;
};

const FIXTURE_FILE = path.resolve(__dirname, "../fixtures/registry-responses.json");

const recorded = JSON.parse(fs.readFileSync(FIXTURE_FILE, "utf8")) as Record<
    string,
    RecordedResponse
>;

/**
 * Serves recorded registry responses so the unit suite runs offline and does
 * not drift when a new module version is published upstream.
 *
 * Unknown URLs throw rather than falling through to the network. A silent
 * fallback would make the offline guarantee untrue the moment a test started
 * requesting something new.
 *
 * Refresh the fixtures with `make record-fixtures`.
 */
export class MockFetchService implements IFetchService {
    /**
     * Serves the response recorded for a URL.
     * @param url The URL the code under test asked for.
     * @returns The recorded response, shaped the way the real service shapes one.
     * @throws When nothing was recorded for that URL.
     */
    fetchDataAsync<T>(url: string): Promise<RunTimeFetchResponse<T>> {
        const response = recorded[url];
        if (response === undefined) {
            throw new Error(
                `No recorded registry response for ${url}\n` +
                    `Add it to scripts/record-registry-fixtures.js and run 'make record-fixtures'.`,
            );
        }

        return Promise.resolve({
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(),
            data: response.data as T,
        });
    }
}
