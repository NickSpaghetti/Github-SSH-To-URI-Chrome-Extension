import { BrowserCdp } from "./BrowserCdp";

/** A request a target made: its url, when it started and finished, and its status. */
export type Request = { url: string; start: number; end: number; status: number };

/** The requests a target makes, recorded at the network. */
export class NetworkWatch {
    private readonly started = new Map<string, { url: string; start: number }>();
    private readonly statuses = new Map<string, number>();
    private readonly finished: Request[] = [];

    private constructor(private readonly cdp: BrowserCdp) {}

    /**
     * Starts recording a target's requests.
     * @param cdp A browser level client.
     * @param session A session attached to the target making the requests.
     * @returns A watch that is already recording.
     */
    public static async openAsync(cdp: BrowserCdp, session: string): Promise<NetworkWatch> {
        const watch = new NetworkWatch(cdp);
        cdp.onEvent((method, params) => watch.receive(method, params));
        await cdp.sendAsync("Network.enable", {}, session);
        return watch;
    }

    /**
     * Returns the requests made to a host.
     * @param host The host to count requests to.
     * @returns Each request, with when it started and finished.
     */
    public requestsTo(host: string): Request[] {
        return this.finished.filter((request) => request.url.includes(host));
    }

    /**
     * Returns the requests to a host that it did not answer with 200.
     * @param host The host to count requests to.
     * @returns Each such request.
     */
    public rejectedBy(host: string): Request[] {
        return this.requestsTo(host).filter((request) => request.status !== 200);
    }

    private receive(method: string, params: Record<string, unknown>): void {
        if (method === "Network.responseReceived") {
            const response = params.response as { status?: number } | undefined;
            this.statuses.set(String(params.requestId), Number(response?.status ?? 0));
            return;
        }
        if (method === "Network.requestWillBeSent") {
            const request = params.request as { url: string } | undefined;
            if (request !== undefined) {
                this.started.set(String(params.requestId), {
                    url: request.url,
                    start: Number(params.timestamp) * 1000,
                });
            }
            return;
        }
        if (method !== "Network.loadingFinished" && method !== "Network.loadingFailed") {
            return;
        }
        const id = String(params.requestId);
        const began = this.started.get(id);
        if (began === undefined) {
            return;
        }
        this.started.delete(id);
        this.finished.push({
            url: began.url,
            start: began.start,
            end: Number(params.timestamp) * 1000,
            status: this.statuses.get(id) ?? 0,
        });
        this.statuses.delete(id);
    }
}
